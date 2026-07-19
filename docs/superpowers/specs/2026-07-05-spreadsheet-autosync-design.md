# Droid Tycoon Tracker — Spec 2: Spreadsheet Auto-Sync Design

- Created: 2026-07-05T21:49:33-07:00
- Status: Draft for review. Brainstormed with Jason 2026-07-05; revised the same day after a
  Fable design review (fixes: mechanical gate enforcement, paint-stage keying, canonical
  serialization, `income_pct` home, OCC-in-transaction). Awaiting Jason's spec review before
  implementation planning.
- Scope: Spec 2 of 3. Platform is spec 1 (`2026-07-03-platform-design.md`, merged); timer/alert is spec 3.
- Recon basis: `.superpowers/sdd/spec2-groundwork.md` — a read-only diff of the community
  sheet against the seeded reference zone. This spec turns that recon's eight open questions
  (its §5) into locked decisions.

## 1. Context

The reference zone (`droids`, `droid_tiers`, `rebirth_reqs`, `chip_costs`, `rebirth_meta`,
`nova_shop`, `cosmetics`, `data_versions`) is currently seeded once from prototype constants
(`app/drizzle/seed.mjs` → `seed-data.json`). The platform spec reserved sheet-sync as a
future seam that "lands datasets atomically via `data_versions`" and defined the orphan
contract (platform spec lines 83–87). This spec fills that seam.

The groundwork established the fact that reframes the whole feature: **the seed and the sheet
are the same lineage.** Rebirth requirements match 324/324; the five droid-name misspellings
in the sheet are exactly the five already in `DROID_ALIASES`. Almost nothing drifts. The real
problem is a *narrow, mixed* changeset where the sheet is sometimes more correct than the seed
(Mythic chip costs; fully-enumerated cosmetics) and sometimes less correct (one internally
self-contradictory `IG` droid-tier row). A blind overwrite would fix and regress in the same
transaction. Every decision below follows from that.

## 2. Goals & non-goals

**Goals**
- Manually-triggered, human-gated sync of the reference zone from the community sheet.
- Faithful capture of the full sheet — including three regions the current schema does not
  model (droid sell-values, flawless-spawn probabilities, nova paint-stages) and Iconic
  percentage income.
- Every sync is previewed as a diff, validated, and applied atomically; nothing lands blind,
  and apply can only replay a payload the server itself built during a preview.
- Full auditability and cheap rollback via stored per-version payloads.

**Non-goals**
- Player state — Droidex checkboxes, cosmetics `OWNED`, `TOTAL COLLECTED`, `counts`, `plans`
  are never ingested.
- Scheduling / a background worker (deferred seam — see §14).
- A curated-overrides layer (deferred seam — see §14).
- Frontend visual design of the preview/admin surface (belongs to the design session; this
  spec defines the data and endpoints, not the styling).

## 3. Decisions (locked in session 2026-07-05)

|Question (groundwork §5)|Decision|
|-|-|
|§5.1 Overwrite vs curate|**Gate now, overrides later.** Diff-and-approve is the mechanism; a curated-overrides layer is a deferred optimization, not built now.|
|§5.2 Preview vs apply-report|**Preview-then-apply** (implied by the gate).|
|§5.3a Trigger|**Manual only.** Sync routes in the existing app — no new compose service.|
|§5.3b Authority|**Any authenticated member** may trigger and approve. See §10 for the three guards this makes mandatory.|
|§5.4/§5.5 Versioning & rollback|**Store the normalized payload per version; keep the proven truncate-then-insert apply.** Rollback = re-stage an old version's payload through the same gate.|
|§5.6/§5.9 Unmodeled tables|**Ingest all three now** — sell-values, flawless-spawn, paint-stages get their own reference tables.|
|Cosmetics drift|**Adopt the sheet's 50 enumerated rows** across Hats / Base Paints / Droid Effects.|
|§5.7 Iconic chip row|**Ingest as an explicit all-null `chip_costs` row** (requires relaxing that table's NOT NULL — see §6).|
|§5.8 Iconic income|**Represent it** — add `droids.income_pct` (droid-level; Iconics have no tier grid). Also `droids.buy_nc` for CB-23's 75 nova-crystal Base cost.|

Design philosophy the answers converge on: **minimal pipeline, maximal data model.** The
parser is written once regardless, so the sheet is captured in full; the operational machinery
(no scheduler, no extra service, no overrides yet) stays lean.

## 4. Source contract

- Sheet id `1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg`, public.
- Per-tab CSV export: `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>`.

|gid|Tab|Feeds|
|-|-|-|
|1248391507|Droid Reference|`droids`, `droid_tiers`, `chip_costs`, `droid_sell_values` (new), `flawless_spawn` (new)|
|0|Droidex / Rebirths|`rebirth_reqs` (left-side Droidex checkboxes and `TOTAL COLLECTED` are player state — ignored)|
|547464940|Cosmetics|`cosmetics` (the `OWNED` columns are player state — ignored)|
|1548395368|Nova shop|`nova_shop`, `rebirth_meta`, `nova_paint_stages` (new)|
|1791582942|Contact info|**skipped entirely**|

All four data tabs are fetched **all-or-nothing**: a fetch/parse/validate failure on any tab
aborts the whole preview (a half-read reference zone is worse than a stale one). Ignored in
every tab: the decorative `"IF YOU ARE NOT A SHEET EDITOR…"` banner cells, merged/blank
header-continuation cells, and separator columns. Groundwork §1 fully maps the main droid grid,
the rebirth blocks, cosmetics, and nova upgrades; two sub-tables (`droid_sell_values`,
`flawless_spawn`) are **not** fully column-mapped there and must be pinned from the CSV during
planning — see §6.

## 5. Parser & normalization

A per-tab parser under `app/src/lib/server/sync/`. Each parser takes raw CSV text and returns
a typed, normalized fragment of the payload; a real CSV reader is mandatory (tab 1548395368
has a quoted cell with an embedded newline that breaks line-based indexing).

Normalization rules (full inventory in groundwork §2):
- **Magnitude suffixes** on numbers: `k`=1e3, `m`=1e6, `b`=1e9, `t`/`T`=1e12. Case varies by
  region (lowercase in the droid grid, uppercase in rebirth credits).
- **Income cells** carry `/s` and their own scaling (`4.08k/s` → 4080). **Iconic income is a
  percentage** (`15%/s`) → parsed to `droids.income_pct` — a droid-level value; Iconics have no
  tier grid, so it does not belong on any `droid_tiers` row.
- **Sentinels:** `N/A` → null; empty → null/skip. `75 NC` (CB-23's Base cost) is a
  nova-crystal price, not credits → `droids.buy_nc`; it is the only NC-denominated cost.
- **Rebirth credits stay display text** (`"2.95M"`), matching the existing `text` column — an
  intentional asymmetry with `droid_tiers.buy` (normalized to a number). Preserved.
- **Tier-word map** (UPPERCASE sheet → app `TIERS`): `BASE`/`BASIC`/`DEFAULT` → Base, and
  `GOLD`/`DIAMOND`/`RAINBOW`/`BESKAR` one-to-one. The complete tier-word set is closed.
- **Droid-name alias map** — the sync module keeps **its own copy** (the existing map in
  `scripts/extract-prototype-data.mjs` reads the prototype, not the sheet). A req-droid token
  that does not resolve after aliasing is a **hard failure** (see §7): it means a new
  misspelling or a renamed droid, and silently dropping it would corrupt rebirth requirements.

## 6. Schema changes

Precise deltas against `app/src/lib/server/schema.ts`. Delivered as Drizzle migrations.

**Altered tables**
- `droids` — add `income_pct numeric` (nullable) and `buy_nc integer` (nullable). Iconic
  percentage income (`15`, `25`) and CB-23's `75` nova-crystal Base cost are **droid-level**
  facts: Iconics have no tier grid (the recon stores them as all-null `droid_tiers` rows), so
  neither value has a `droid_tiers` row to live on. `droid_tiers` itself is unchanged —
  `buy`/`income`/`sell` are already nullable, so Iconic tier rows already fit.
- `chip_costs` — **relax `to_gold`/`to_diamond`/`to_rainbow`/`to_beskar` to nullable.** They
  are `NOT NULL` today; the Iconic row is all-`N/A`, so ingesting it requires nullable cost
  columns. The parser writes an `Iconic` row with all four null. **Implementation note:** once
  an Iconic `chip_costs` row exists, audit `src/lib/game/` for per-rarity iteration that
  assumes non-null costs (null-blind chip-total math would break).
- `data_versions` — add `payload jsonb NOT NULL`. `payload` is a self-describing envelope:
  `{ meta: { source, fetchedAt, tabChecksums, rowCounts, orphanReport }, tables: { …full normalized reference set… } }`.
  `checksum` (existing) becomes the SHA-256 of the **canonically serialized** `payload.tables`
  (§9 — load-bearing). `source` (existing) records sheet id + gids + fetch timestamp.
  `rowCounts`/`orphanReport` are stored so `GET /api/sync/versions` reports them without
  recomputation.
  - **Existing-row migration.** One `data_versions` row already exists (the
    `prototype-constants` seed) with no payload. A **JS migration script** (not raw SQL)
    backfills it by reading the current reference tables and serializing them through the *same*
    canonical serializer the parser uses (§9), then sets `NOT NULL`. Serializing in SQL
    (`json_agg` key order, numeric formatting) would not match the JS normalizer and would make
    the first real sync show spurious diffs on every row. This backfilled **v1** envelope has
    the three new tables **empty** and no per-tab `tabChecksums` (they didn't exist at seed
    time) — see §9 for what rolling back to v1 means. `seed.mjs` is likewise updated to write a
    canonical `payload` (else it violates the new `NOT NULL`).

**New reference tables**
- `droid_sell_values` — per-rarity, per-tier sell multiplier (droid grid, sheet rows 11–18).
  Provisional shape `(rarity, tier, multiplier numeric; PK rarity+tier)`. **Column semantics
  unverified:** the recon maps the main grid but not this sub-table — the right value-stack has
  4 columns against 5 tiers, so the exact column→tier and row→rarity mapping must be pinned from
  the CSV during planning, with a header-anchor assert added for it.
- `flawless_spawn` — `(tier PK, one_in integer)`. Probability = `1/one_in` (`DEFAULT 1/1000`
  → tier Base; … `BESKAR 1/100`). Storing the denominator keeps it exact and computable
  (renders as `1/N`). Same caveat: the exact tier→value mapping across the region's columns is
  under-mapped in the recon and must be pinned from the CSV before implementation.
- `nova_paint_stages` — `(stage integer PK, crystal_cost integer)`. A **single global** 3-stage
  crystal ladder (30/120/400). The Nova-shop cosmetics region is one LEVEL column + one value
  column with **no paint names** (groundwork §1), so the ladder is uniform across all base
  paints — there is nothing to key or join per-paint.

**New operational table (not reference data)**
- `sync_previews` — `(checksum PK, base_version_id integer, payload jsonb, flags jsonb, built_at)`.
  Short-lived staging for server-built preview payloads; apply consumes from it by checksum
  (§8). Swept on a TTL; a row is also superseded once its `base_version_id` is no longer active.

**Data-only restructure (no column change)**
- `cosmetics` — same `(category, name, requirement)` shape, but ingested rows change from the
  seed's 15 summarized `general` rows to the sheet's 50 enumerated rows across
  `{Hats, Base Paints, Droid Effects}`.

**Base-paints, two facets (resolved).** Base paints appear in the sheet twice: the Cosmetics
tab lists *what exists and how you unlock it* (→ `cosmetics`, 23 named base paints); the
Nova-shop tab lists *the crystal cost to advance a paint stage* (→ `nova_paint_stages`). Kept as
separate tables — but the stage ladder is a single global 3-row sequence, **not** per-paint, so
they are **not** joined on name. Separation still avoids giving hats/effects permanently-null
stage columns and never conflates "unlock requirement" with "stage-upgrade cost."

## 7. Validation

Validators run on the normalized payload before any diff is shown. Each has an explicit fail
action: **reject** (refuse the whole ingest), **hold** (surface the row as suspect in the
preview; may be applied only with an explicit ack — §8), or **report** (attach to the diff,
never block).

|Invariant|Fail action|
|-|-|
|Header anchors: literal header labels sit at expected columns per tab (including the two under-mapped sub-tables once pinned)|**reject** — a moved column means mis-mapping; refuse rather than corrupt|
|Roster shape: droid count in bounds; every rarity ∈ {Common,Rare,Epic,Legendary,Mythic,Iconic}; every type ∈ {Worker,Astromech,Battle}|**reject**|
|Tier-grid ratio: for non-Iconic droids, Gold ≈ 4×Base and value ≈ 0.7×cost|**hold** — this is the check that flags the corrupt `IG` row; see §8/§10|
|Rebirth shape: exactly 4 cycles × 27 transitions × 3 req-droids = 324; every token resolves after aliasing; every tier word maps|**reject** (an unresolved token is a hard failure)|
|Enum coverage: chip-cost rarities ⊇ {Common,Rare,Epic,Legendary,Mythic}; nova costs numeric; rebirth-meta a contiguous RB range|**reject**|
|Orphan check: droids referenced by existing `counts` rows that the new payload removes/renames|**report**|
|No-op: canonical checksum equals the active version's|short-circuit — stage nothing, apply nothing, write no new version|

The **tier-grid ratio check is load-bearing, not polish.** Its per-row output annotates the
diff so a reviewer sees "this changed row also violates the value≈cost invariant — likely
corrupt" rather than a bare before/after, and a hold cannot be applied without acknowledging it
(§8). That is what lets the `IG` regression be rejected and the Mythic chip fix accepted in the
same review.

## 8. Diff & apply model

Two phases, two endpoints (§12). Apply can only replay a payload the server built.

**Preview (dry run, no writes).** Fetch all four tabs → parse → normalize → validate → build
`payload`. **The server persists the built payload** in `sync_previews`, keyed by its canonical
checksum (§9). Diff `payload.tables` against the *active version's stored* `payload.tables`
(available because §6 stores it — no reconstruction from live tables needed). Return: the diff
(added / removed / changed rows, grouped by table), the validator hold/report annotations (esp.
ratio-check flags and orphaned `counts`), `baseVersionId`, and the `payloadChecksum` naming the
staged payload.

**Apply.** Input is `{ baseVersionId, payloadChecksum, acknowledgedHolds }` — **never a raw
client payload.** In order:
1. **Provenance.** Look up `payloadChecksum` in `sync_previews`. Unknown → 422; the server
   refuses to apply anything it did not build. This is what makes "the human approved *this*
   diff" mechanically true rather than aspirational — a client cannot hand-craft or replay an
   unpreviewed payload.
2. **Hold acknowledgment.** If the staged `flags` contain hold-class entries (e.g. the `IG`
   ratio-check flag), every one must appear in `acknowledgedHolds`, else 422. A held regression
   cannot land silently — it needs a deliberate, per-flag human ack.
3. **Apply transaction.** Open one transaction; *inside* it, take a lock on the active version
   (advisory lock, or `SELECT … FOR UPDATE` on the latest `data_versions` row) and re-check
   `active id == baseVersionId` → mismatch 409. The lock-inside-txn is required: an unlocked
   read-then-write lets two concurrent applies both see version N and both commit. Then
   truncate + insert every reference table from the staged `payload.tables`, insert the new
   `data_versions` row (payload, checksum, source, meta), and delete the consumed
   `sync_previews` row.

If the no-op invariant fired at preview, nothing is staged and there is nothing to apply.

## 9. Versioning, checksum, rollback

- **Canonical serialization (load-bearing).** One serializer produces `payload.tables` from
  normalized data — object keys sorted, arrays ordered by primary key, numbers formatted by a
  fixed rule (integers verbatim, `numeric` at fixed precision, `null` explicit). The checksum,
  the byte-identical no-op check, the diff, and the migration backfill all depend on this being
  the *only* way a payload is produced. jsonb does **not** preserve key order, so equality is
  always compared on the stored `checksum`, never on raw jsonb bytes. The backfill (§6) and
  `seed.mjs` run through this same serializer — otherwise the first real sync diffs spuriously
  against a differently-formatted v1.
- `data_versions` is append-only; each accepted sync is one new row carrying its full
  normalized `payload`.
- `checksum` = SHA-256 of the canonically serialized `payload.tables`, so CSV formatting churn
  (a re-quoted cell, a reordered comment) does not produce a spurious new version.
  `tabChecksums` (per-tab) let a diff name *which tab* moved.
- **Active version** = the `data_versions` row with the greatest `id` (append-only, so newest
  wins); the live reference tables always reflect it.
- **Rollback is not separate machinery.** To roll back to version N, the server re-stages N's
  stored `payload` (through the same preview → checksum → apply path); it lands as a new
  append-only version whose data equals N's. Concurrency guard and single transaction apply
  unchanged. **Caveat — rolling back to the backfilled v1** restores prototype-seed state: its
  envelope has the three new tables *empty*, so a v1 rollback truncates `droid_sell_values` /
  `flawless_spawn` / `nova_paint_stages`. That is the faithful meaning of "roll back to
  prototype data," and it shows in the preview as full-table removals the gate already renders.
- `GET /api/reference` continues to report the active version so the UI can show "data as
  of …"; it now also serves the three new tables and `income_pct`/`buy_nc`.

## 10. Trigger & auth

- Sync is a set of **sync routes inside the existing SvelteKit app** — no new compose service
  (the reserved sync-worker seam stays reserved, see §14).
- **Any authenticated member** may call preview and apply (session-gated, like
  `GET /api/reference`). No admin role/column is added.

Because authority is open, three safeguards are **mandatory**, not optional:
1. **Server-built payloads only.** Apply references a staged payload by checksum (§8, step 1);
   it never accepts a raw client payload. A member cannot hand-craft or replay a payload the
   server never previewed.
2. **Explicit hold acknowledgment.** Hold-class flags (ratio-check "likely corrupt", orphaned
   `counts`) are surfaced prominently in the preview *and* each acknowledged by checksum at
   apply (§8, step 2). A member who doesn't know the game-math invariants still cannot land a
   flagged regression like `IG` without a deliberate, per-flag ack — so §7's ratio check is a
   hard requirement of the preview UI, not a nice-to-have.
3. **Concurrency guard.** The lock-inside-transaction version re-check (§8, step 3) prevents a
   stale preview approved by one member from clobbering a version another member landed between.

## 11. Orphan surfacing

- The only user data coupled to reference-by-name is `counts` (`counts.droid`/`tier`, text,
  deliberately **no FK**). `plans` key on `(profileId, cycle, rebirth)` only — immune. So the
  entire orphan surface is: **a droid rename/removal in the sheet orphans `counts` rows that
  reference the old name.** Tier values are a closed enum — tier orphans are effectively
  impossible.
- Per the platform contract (lines 83–87), the ingest **reports** these orphans in the diff
  (and stores the report in the version envelope, §6) and the app surfaces them; user rows are
  **never dropped**. Because there is no hard FK, the reference swap lands atomically inside the
  one transaction while orphaned `counts` simply stop matching until the user reconciles them.

## 12. API

All under `/api/*`, JSON, cookie-session auth (any authenticated member).

|Endpoint|Purpose|
|-|-|
|POST `/api/sync/preview`|Fetch + parse + validate + stage payload + diff; returns `{diff, flags, orphans, baseVersionId, payloadChecksum}`. No writes to the reference zone (writes only its own `sync_previews` staging row).|
|POST `/api/sync/apply`|Body `{baseVersionId, payloadChecksum, acknowledgedHolds}` — server-built payload referenced by checksum, never a raw payload. Provenance-checked, hold-ack-checked, lock-guarded single-transaction apply. 422 unknown checksum / unacknowledged hold; 409 stale base.|
|POST `/api/sync/rollback`|Body `{versionId}`; re-stages that version's stored payload and applies it as a new version (same provenance + lock + transaction).|
|GET `/api/sync/versions`|List versions (id, ingestedAt, source, stored `rowCounts` + `orphanReport`) for audit and "data as of …".|

Errors follow the platform convention: `{error, code}`, typed, no silent failures — 401
unauthenticated, 409 stale-base concurrency conflict, 422 validation / unknown-checksum /
unacknowledged-hold (with the reason named).

## 13. Testing

- **Unit (Vitest):** each per-tab parser against a golden CSV → expected normalized fragment,
  covering every normalization rule (suffixes, `/s`, `%/s`, `N/A`, `75 NC`, alias resolution,
  tier words). The canonical serializer against a fixed payload → stable byte output. Validators
  against crafted payloads that trip each invariant.
- **Diff/apply integration (dockerized test Postgres):**
  - Golden CSVs → expected `payload` → apply → reference tables + a `data_versions` row match.
  - A **deliberately-reorganized CSV** (shifted column) → header-anchor reject, no write.
  - The **corrupt `IG` row** → ratio-check hold flag present in the preview diff.
  - **Unacknowledged hold:** apply omits the `IG` flag from `acknowledgedHolds` → 422, no write.
  - **Forged payload:** apply a `payloadChecksum` the server never staged → 422, no write.
  - An **orphan-producing rename** → orphan reported + stored, `counts` row preserved, apply
    still lands.
  - A **no-op re-sync** (canonical checksum equals active) → no new version written.
  - **Backfill fidelity:** after the v1 backfill, syncing the same prototype-equivalent data
    yields a byte-identical checksum → no new version (proves the serializer matches the
    backfill, not just itself).
  - **Concurrency:** preview against version N, land N+1 out-of-band, then apply the N-based
    payload → 409, no write.
- **Regression net:** the existing `src/lib/game/` unit suites must pass unchanged against
  sheet-ingested data — the sheet's numbers flow through the same math as the seed's.

## 14. Out of scope / deferred seams (designed-for, not built)

- **Curated-overrides layer** (groundwork §5.1 option c) — if re-rejecting the same cell every
  sync becomes real toil, add a small override set applied on top of each ingest. Layers onto
  the gate; not built now.
- **Scheduled sync-worker** (platform spec line 36) — if "nobody remembered to sync" becomes a
  problem, add a poller that computes the diff on a cron and flags a pending sync for approval.
  It would call the same preview/apply path; still human-gated.
- **Timer/alert feature** — spec 3.
- **Preview/admin visual design** — the design session.
