# Droid Tycoon Tracker — Spec 2: Spreadsheet Auto-Sync Design

- Created: 2026-07-05T21:49:33-07:00
- Status: Draft for review (brainstormed and approved in session 2026-07-05; awaiting spec review before implementation planning)
- Scope: Spec 2 of 3. Platform is spec 1 (`2026-07-03-platform-design.md`, merged); timer/alert is spec 3.
- Recon basis: `.superpowers/sdd/spec2-groundwork.md` — a read-only diff of the community
  sheet against the seeded reference zone. This spec turns that recon's eight open questions
  (its §5) into locked decisions.

## Context

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

## Goals & non-goals

**Goals**
- Manually-triggered, human-gated sync of the reference zone from the community sheet.
- Faithful capture of the full sheet — including three regions the current schema does not
  model (droid sell-values, flawless-spawn probabilities, nova paint-stages) and Iconic
  percentage income.
- Every sync is previewed as a diff, validated, and applied atomically; nothing lands blind.
- Full auditability and cheap rollback via stored per-version payloads.

**Non-goals**
- Player state — Droidex checkboxes, cosmetics `OWNED`, `TOTAL COLLECTED`, `counts`, `plans`
  are never ingested.
- Scheduling / a background worker (deferred seam — see §12).
- A curated-overrides layer (deferred seam — see §12).
- Frontend visual design of the preview/admin surface (belongs to the design session; this
  spec defines the data and endpoints, not the styling).

## Decisions (locked in session 2026-07-05)

|Question (groundwork §5)|Decision|
|-|-|
|§5.1 Overwrite vs curate|**Gate now, overrides later.** Diff-and-approve is the mechanism; a curated-overrides layer is a deferred optimization, not built now.|
|§5.2 Preview vs apply-report|**Preview-then-apply** (implied by the gate).|
|§5.3a Trigger|**Manual only.** An admin route in the existing app — no new compose service.|
|§5.3b Authority|**Any authenticated member** may trigger and approve. See §10 for the two guards this makes mandatory.|
|§5.4/§5.5 Versioning & rollback|**Store the normalized payload per version; keep the proven truncate-then-insert apply.** Rollback = re-apply an old version's payload through the same gate.|
|§5.6/§5.9 Unmodeled tables|**Ingest all three now** — sell-values, flawless-spawn, paint-stages get their own reference tables.|
|Cosmetics drift|**Adopt the sheet's 50 enumerated rows** across Hats / Base Paints / Droid Effects.|
|§5.7 Iconic chip row|**Ingest as an explicit all-null `chip_costs` row** (requires relaxing that table's NOT NULL — see §6).|
|§5.8 Iconic income|**Represent it** — add `droid_tiers.income_pct`; regular `income` stays null for Iconic rows.|

Design philosophy the answers converge on: **minimal pipeline, maximal data model.** The
parser is written once regardless, so the sheet is captured in full; the operational machinery
(no scheduler, no extra service, no overrides yet) stays lean.

## Source contract

- Sheet id `1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg`, public.
- Per-tab CSV export: `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>`.

|gid|Tab|Feeds|
|-|-|-|
|1248391507|Droid Reference|`droids`, `droid_tiers`, `chip_costs`, `droid_sell_values` (new), `flawless_spawn` (new)|
|0|Droidex / Rebirths|`rebirth_reqs` (left-side Droidex checkboxes and `TOTAL COLLECTED` are player state — ignored)|
|547464940|Cosmetics|`cosmetics` (the `OWNED` columns are player state — ignored)|
|1548395368|Nova shop|`nova_shop`, `rebirth_meta`, `nova_paint_stages` (new)|
|1791582942|Contact info|**skipped entirely**|

Ignored in every tab: the decorative `"IF YOU ARE NOT A SHEET EDITOR…"` banner cells,
merged/blank header-continuation cells, and separator columns. The exact column maps live in
groundwork §1 and are the parser's specification; this spec does not restate them cell-by-cell.

## Parser & normalization

A per-tab parser under `app/src/lib/server/sync/`. Each parser takes raw CSV text and returns
a typed, normalized fragment of the payload; a real CSV reader is mandatory (tab 1548395368
has a quoted cell with an embedded newline that breaks line-based indexing).

Normalization rules (full inventory in groundwork §2):
- **Magnitude suffixes** on numbers: `k`=1e3, `m`=1e6, `b`=1e9, `t`/`T`=1e12. Case varies by
  region (lowercase in the droid grid, uppercase in rebirth credits).
- **Income cells** carry `/s` and their own scaling (`4.08k/s` → 4080). **Iconic income is a
  percentage** (`15%/s`) → parsed to `income_pct`, not `income`.
- **Sentinels:** `N/A` → null; empty → null/skip; `75 NC` (CB-23) is a nova-crystal cost.
- **Rebirth credits stay display text** (`"2.95M"`), matching the existing `text` column — an
  intentional asymmetry with `droid_tiers.buy` (normalized to a number). Preserved.
- **Tier-word map** (UPPERCASE sheet → app `TIERS`): `BASE`/`BASIC`/`DEFAULT` → Base, and
  `GOLD`/`DIAMOND`/`RAINBOW`/`BESKAR` one-to-one. The complete tier-word set is closed.
- **Droid-name alias map** — the sync module keeps **its own copy** (the existing map in
  `scripts/extract-prototype-data.mjs` reads the prototype, not the sheet). A req-droid token
  that does not resolve after aliasing is a **hard failure** (see §7): it means a new
  misspelling or a renamed droid, and silently dropping it would corrupt rebirth requirements.

## Schema changes

Precise deltas against `app/src/lib/server/schema.ts`. Delivered as Drizzle migrations.

**Altered tables**
- `droid_tiers` — add `income_pct numeric` (nullable). Holds Iconic `%/s` as a plain number
  (`15`, `25`). `buy`/`income`/`sell` are already nullable, so Iconic tier rows already fit.
- `chip_costs` — **relax `to_gold`/`to_diamond`/`to_rainbow`/`to_beskar` to nullable.** They
  are `NOT NULL` today; the Iconic row is all-`N/A`, so ingesting it requires nullable cost
  columns. The parser writes an `Iconic` row with all four null.
- `data_versions` — add `payload jsonb NOT NULL`. `payload` is a self-describing envelope:
  `{ meta: { source, fetchedAt, tabChecksums }, tables: { …the full normalized reference set… } }`.
  `checksum` (existing) becomes the hash of `payload.tables` (the *normalized* data, not raw
  CSV). `source` (existing) records sheet id + gids + fetch timestamp.
  - **Existing-row migration:** one `data_versions` row already exists (the
    `prototype-constants` seed) with no payload. The migration must backfill it by serializing
    the current reference tables into a `payload` envelope before enforcing `NOT NULL`, so that
    row stays a valid rollback target. (Equivalently, re-run the seed, which would then write a
    payload-bearing row.)

**New tables**
- `droid_sell_values` — `(rarity, tier, multiplier numeric; PK rarity+tier)`. Per-rarity,
  per-tier sell multiplier (droid grid, sheet rows 11–18).
- `flawless_spawn` — `(tier PK, one_in integer)`. Probability = `1/one_in` (`DEFAULT 1/1000`
  → tier Base, `one_in` 1000; … `BESKAR 1/100`). Storing the denominator keeps it computable.
- `nova_paint_stages` — `(paint_name, stage integer, crystal_cost integer; PK paint_name+stage)`.
  The base-paint crystal ladder (30/120/400) from the Nova-shop tab. Joins to
  `cosmetics` on `name` where `category = 'Base Paints'`.

**Data-only restructure (no column change)**
- `cosmetics` — same `(category, name, requirement)` shape, but ingested rows change from the
  seed's 15 summarized `general` rows to the sheet's 50 enumerated rows across
  `{Hats, Base Paints, Droid Effects}`.

**Base-paints, two facets (resolved).** Base paints appear in the sheet twice: the Cosmetics
tab lists *what exists and how you unlock it* (→ `cosmetics`); the Nova-shop tab lists *the
crystal cost to level a paint you already own* (→ `nova_paint_stages`). Kept as two tables
joined on paint name, so hats/effects don't carry permanently-null stage columns and "unlock
requirement" is never conflated with "upgrade cost."

## Validation

Validators run on the normalized payload before any diff is shown. Each has an explicit fail
action: **reject** (refuse the whole ingest), **hold** (surface the row as suspect in the
preview but allow approval), or **report** (attach to the diff, never block).

|Invariant|Fail action|
|-|-|
|Header anchors: literal header labels sit at expected columns per tab|**reject** — a moved column means mis-mapping; refuse rather than corrupt|
|Roster shape: droid count in bounds; every rarity ∈ {Common,Rare,Epic,Legendary,Mythic,Iconic}; every type ∈ {Worker,Astromech,Battle}|**reject**|
|Tier-grid ratio: for non-Iconic droids, Gold ≈ 4×Base and value ≈ 0.7×cost|**hold** — this is the check that flags the corrupt `IG` row; see §10|
|Rebirth shape: exactly 4 cycles × 27 transitions × 3 req-droids = 324; every token resolves after aliasing; every tier word maps|**reject** (an unresolved token is a hard failure)|
|Enum coverage: chip-cost rarities ⊇ {Common,Rare,Epic,Legendary,Mythic}; nova costs numeric; rebirth-meta a contiguous RB range|**reject**|
|Orphan check: droids referenced by existing `counts` rows that the new payload removes/renames|**report**|
|No-op: `payload.tables` byte-identical to the active version|short-circuit — apply nothing, write no new version|

The **tier-grid ratio check is load-bearing, not polish.** Its per-row output annotates the
diff so a reviewer sees "this changed row also violates the value≈cost invariant — likely
corrupt" rather than a bare before/after. That annotation is what lets the `IG` regression be
rejected and the Mythic chip fix accepted in the same review.

## Diff & apply model

Two phases, two endpoints (§11).

**Preview (dry run, no writes).** Fetch all four tabs → parse → normalize → validate → build
`payload`. Diff `payload.tables` against the *active version's stored* `payload.tables`
(available because §6 stores it — no reconstruction from live tables needed). Return: the diff
(added / removed / changed rows, grouped by table), the validator hold/report annotations
(esp. ratio-check flags and orphaned `counts`), and the `baseVersionId` the diff was computed
against.

**Apply.** Input carries `baseVersionId` and the approved payload (or its hash to re-fetch
server-side). Then, in order:
1. **Optimistic-concurrency guard** — if the current active `data_versions.id` ≠ `baseVersionId`,
   reject with 409; the approver must re-preview. (Mandatory because §10 lets any member
   trigger — two people can sync concurrently.)
2. **Re-validate** the payload (reject-class invariants) — never trust a stale client.
3. **One transaction** (the seed's existing `sql.begin` truncate-then-insert pattern):
   truncate + insert every reference table from `payload.tables`, then insert the new
   `data_versions` row (payload, checksum, source, tabChecksums). No blind overwrite ever
   occurs — the human approved this exact diff.

If the no-op invariant fired at preview, apply is refused as a no-op (nothing to write).

## Versioning, checksum, rollback

- `data_versions` is append-only; each accepted sync is one new row carrying its full
  normalized `payload`.
- `checksum` = SHA-256 of `payload.tables` (normalized), so CSV formatting churn (a re-quoted
  cell, a reordered comment) does not produce a spurious new version. `tabChecksums` (per-tab)
  let a diff name *which tab* moved.
- **Rollback is not separate machinery.** To roll back to version N, feed N's stored
  `payload` into the same apply path; it lands as a new append-only version whose data equals
  N's. The concurrency guard and single transaction apply unchanged.
- `GET /api/reference` continues to report the active version so the UI can show "data as
  of …"; it now also serves the three new tables and `income_pct`.

## Trigger & auth

- Sync is a set of **sync routes inside the existing SvelteKit app** — no new compose
  service (the reserved sync-worker seam stays reserved, see §12).
- **Any authenticated member** may call preview and apply (session-gated, like
  `GET /api/reference`). No admin role/column is added.

Because authority is open, two safeguards are **mandatory**, not optional:
1. **Anti-rubber-stamp.** The preview must render the validator's hold-class flags
   (ratio-check "likely corrupt", orphaned `counts`) prominently — a member who doesn't know
   the game-math invariants must still see that a row is suspect before approving. The gate
   only protects if the flags are visible, so §7's ratio check is a hard requirement of the
   preview UI, not a nice-to-have.
2. **Concurrency guard.** The apply's optimistic-concurrency check (§9/§ "Apply" step 1)
   prevents a stale preview approved by one member from clobbering a version another member
   landed in between.

## Orphan surfacing

- The only user data coupled to reference-by-name is `counts` (`counts.droid`/`tier`, text,
  deliberately **no FK**). `plans` key on `(profileId, cycle, rebirth)` only — immune. So the
  entire orphan surface is: **a droid rename/removal in the sheet orphans `counts` rows that
  reference the old name.** Tier values are a closed enum — tier orphans are effectively
  impossible.
- Per the platform contract (lines 83–87), the ingest **reports** these orphans in the diff
  and the app surfaces them; user rows are **never dropped**. Because there is no hard FK, the
  reference swap lands atomically inside the one transaction while orphaned `counts` simply
  stop matching until the user reconciles them.

## API

All under `/api/*`, JSON, cookie-session auth (any authenticated member).

|Endpoint|Purpose|
|-|-|
|POST `/api/sync/preview`|Fetch + parse + validate + diff; returns `{diff, flags, orphans, baseVersionId}`. No writes.|
|POST `/api/sync/apply`|Body `{baseVersionId, payload}`; concurrency-guarded, re-validated, single-transaction apply. 409 on stale base; 422 on validation failure.|
|POST `/api/sync/rollback`|Body `{versionId}`; re-applies that version's stored payload as a new version (same guard + transaction).|
|GET `/api/sync/versions`|List versions (id, ingestedAt, source, row-count summary, orphan report) for audit and "data as of …".|

Errors follow the platform convention: `{error, code}`, typed, no silent failures — 401
unauthenticated, 409 stale-base concurrency conflict, 422 validation failure (with the failing
invariant named).

## Testing

- **Unit (Vitest):** each per-tab parser against a golden CSV → expected normalized fragment,
  covering every normalization rule (suffixes, `/s`, `%/s`, `N/A`, `75 NC`, alias resolution,
  tier words). Validators against crafted payloads that trip each invariant.
- **Diff/apply integration (dockerized test Postgres):**
  - Golden CSVs → expected `payload` → apply → reference tables + a `data_versions` row match.
  - A **deliberately-reorganized CSV** (shifted column) → header-anchor reject, no write.
  - The **corrupt `IG` row** → ratio-check hold flag present in the preview diff.
  - An **orphan-producing rename** → orphan reported, `counts` row preserved, apply still lands.
  - A **no-op re-sync** (byte-identical payload) → no new version written.
  - **Concurrency:** preview against version N, land N+1 out-of-band, then apply the N-based
    payload → 409, no write.
- **Regression net:** the existing `src/lib/game/` unit suites must pass unchanged against
  sheet-ingested data — the sheet's numbers flow through the same math as the seed's.

## Out of scope / deferred seams (designed-for, not built)

- **Curated-overrides layer** (groundwork §5.1 option c) — if re-rejecting the same cell every
  sync becomes real toil, add a small override set applied on top of each ingest. Layers onto
  the gate; not built now.
- **Scheduled sync-worker** (platform spec line 36) — if "nobody remembered to sync" becomes a
  problem, add a poller that computes the diff on a cron and flags a pending sync for approval.
  It would call the same preview/apply path; still human-gated.
- **Timer/alert feature** — spec 3.
- **Preview/admin visual design** — the design session.
