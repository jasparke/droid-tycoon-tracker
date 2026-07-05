# Droid Tycoon Tracker — Platform Design

- Created: 2026-07-03T23:36:58-07:00
- Status: Approved (design review completed in session; sections 1–3 approved individually)
- Scope: Spec 1 of 3. Spreadsheet auto-sync is spec 2; timer/alert feature is spec 3.

## Context

The existing tracker is a single-file, client-only web app (`index.html`, ~1000 lines) with
localStorage persistence, URL-hash mirroring, and optional last-write-wins Supabase blob sync.
It is hereby designated the **prototype**: its feature set, game math, and export-code format
are the reference; its architecture is not carried forward.

This spec defines the replacement: a standalone multi-user web app, self-hosted on the
user's proxmox cluster via docker-compose, backed by Postgres.

## Decisions (locked during review)

|Decision|Choice|
|-|-|
|Sequencing|Platform first; game-patch data arrives via future sheet sync; timer feature later|
|Prototype|Frozen as reference under `prototype/`; ground-up rebuild|
|Stack|SvelteKit full-stack (UI + API routes, one Node container) + Postgres; Drizzle ORM|
|Auth|Local accounts, invite-code-gated registration, argon2id hashes, cookie sessions (server-side session table)|
|Visibility|All members read all profiles; only owners write|
|User data model|Hybrid-normalized: counts/plans as rows; cosmetic UI prefs as one JSONB column|
|Reference data|Ingested (sheet-fed later; seeded from prototype constants initially), never hardcoded|
|Frontend visual design|Explicitly deferred to a separate design session; this build ships a functional skeleton|

## Architecture

One SvelteKit app serving UI and `/api/*` JSON endpoints, one Postgres instance,
orchestrated by docker-compose. No additional services (no Redis, no queue) — YAGNI.

Future seams (out of scope here, designed-for):
- **Sheet-sync worker (spec 2):** third compose service writing reference tables; lands
  datasets atomically via `data_versions`.
- **Timer/alert feature (spec 3):** module inside the app; no schema reserved yet.

### Repo layout

```
app/
  src/routes/           # pages + /api/* endpoints
  src/lib/server/       # db client, auth, session handling
  src/lib/game/         # pure TS game math (ported from prototype; no DOM)
  src/lib/              # shared components
  drizzle/              # schema + migrations
docker-compose.yml
prototype/              # old index.html + schema.sql, frozen reference
docs/superpowers/specs/ # design docs
```

## Data model

### User zone

- `users` (id, username unique, pw_hash, created_at)
- `sessions` (token PK, user_id FK, expires_at)
- `profiles` (id, user_id FK, name, cycle, current_rebirth, prefs JSONB)
  - `prefs` holds view ephemera only (hidePast, gapsOpen, collapsed panes). Nothing in
    `prefs` may be required for correctness of any server-side computation.
- `counts` (profile_id FK, cycle, droid, tier, n; PK = profile_id+cycle+droid+tier)
  - Every mutation is a single-row upsert (n>0) or delete (n=0). Two devices editing
    different droids never conflict — this removes the prototype's whole-blob
    last-write-wins clobbering by construction.
- `plans` (profile_id FK, cycle, rebirth; PK = all three) — row per ticked rebirth level.

### Reference zone (read-only to the app; owned by seed script, later by sync worker)

- `droids` (name PK, rarity, type)
- `droid_tiers` (droid FK, tier, buy, income, sell; PK = droid+tier)
- `rebirth_reqs` (cycle, rebirth, droid, tier, credits, unlock; PK = cycle+rebirth+droid+tier —
  matches the prototype schema, which permits one droid at two tiers within a rebirth)
- `chip_costs` (rarity PK, to_gold, to_diamond, to_rainbow, to_beskar)
- `rebirth_meta` (rebirth PK, nova, credit_mult, xp_mult) — per-rebirth nova crystals and
  multipliers shown in the checklist header (prototype constants `NOVA`/`CRED`/`XP`)
- `nova_shop` (category, item, level, cost; PK = category+item+level)
- `cosmetics` (category, name, requirement; PK = category+name)
- `data_versions` (id, ingested_at, source, checksum) — each ingest is one version;
  reference reads report the active version so the UI can show "data as of …".

`counts.droid`/`tier` are validated against the reference zone at write time via
app-level check — deliberately not a hard FK, so reference re-ingests can land atomically
without user rows blocking them. Invalid writes are rejected with a typed error, never
dropped. If a re-ingest removes/renames a droid that user rows reference, the ingest must
report those orphans (contract for spec 2); the app surfaces them rather than hiding them.

## API

All under `/api/*`, JSON in/out, cookie-session auth. Errors are `{error, code}` with
appropriate HTTP status; no silent failures.

|Area|Endpoints|Auth rule|
|-|-|-|
|Auth|POST `/api/auth/register` (requires `INVITE_CODE`), POST `/api/auth/login`, POST `/api/auth/logout`, GET `/api/me`|register/login public; rest session|
|Profiles|GET `/api/profiles` (all members'); POST `/api/profiles`; PATCH/DELETE `/api/profiles/:id`|reads instance-wide; writes owner-only|
|Counts|PUT `/api/profiles/:id/counts/:cycle/:droid/:tier` body `{n}` (n=0 deletes)|owner-only|
|Plans|PUT `/api/profiles/:id/plans/:cycle` body `{rebirths:[…]}` (replace set)|owner-only|
|Reference|GET `/api/reference` (full dataset + version; cacheable by version)|session|
|Migration|POST `/api/import` body `{code}` — accepts prototype export codes verbatim (`{__dt:1, profile}` base64), creates a profile owned by the caller|session|

Ownership is enforced server-side on every write (session user must own the target
profile). Registration is the only endpoint consulting `INVITE_CODE`; rotating the code
invalidates future invites without affecting existing accounts.

## Frontend skeleton (visual design deferred)

- Routes: `/checklist`, `/planner`, `/inventory`, `/droids`, `/keepers`, `/roi`, `/login`,
  `/register` — replacing the prototype's tab state with shareable URLs.
- **ROI view (`/roi`, new — not in prototype):** ranks all (droid, tier) pairs by
  credit efficiency. Primary metric: payback time = buy cost ÷ income/s (inverse shown as
  income per 1k credits). Chips are a separate currency and are NOT mixed into the metric;
  cumulative chip cost appears as a context column. Sortable/filterable by rarity, type,
  and tier; rows the active profile owns are marked. Includes a cost-vs-income scatter —
  values span ~10³ to ~10¹² credits, so axes must be log-log (design session may restyle,
  not re-scale). Math lives in `src/lib/game/roi.ts`, pure and unit-tested.
- A client store hydrates from `GET /api/reference` + `GET /api/profiles` at load.
  Writes are optimistic with rollback + visible toast on failure.
- All game math ports from the prototype into `src/lib/game/` as pure TS functions
  (`isMet`, `ownedIdx`, planner dedupe-to-highest-tier, chip cumulative costs, sell/refund
  math). No DOM access. These are the regression net for the rebuild and for future
  sheet-ingested data.
- Components are semantic and minimally styled. Tier colors stay CSS custom properties
  (`--base`…`--beskar`) — the canonical color language a later design session restyles
  without touching logic. Checklist rows keep the reviewed semantics: right pill = required
  tier (constant), name colored by owned tier.

## Migration

1. **Profiles:** `POST /api/import` maps prototype export codes onto
   `profiles` + `counts` + `plans` rows. Decode path already proven in-session (jasparke
   port: 17 counts, plan, prefs round-tripped).
2. **Reference data:** one-time seed script (`app/drizzle/seed.ts`) loads the reference
   zone from the prototype's JS constants, recording a `data_versions` row with
   source="prototype-constants". Replaced by the sheet-sync worker in spec 2.

## Error handling

- API: typed JSON errors; 401 unauthenticated, 403 not-owner, 404 missing, 409 conflicts
  (duplicate username), 422 validation (unknown droid/tier, bad import code).
- UI: optimistic writes roll back visibly on failure; a failed save is never silent.
- Import: invalid/corrupt codes return 422 with reason; no partial profile is created
  (single transaction).

## Testing

- **Unit (Vitest):** `src/lib/game/` math — parity cases derived from the prototype's
  behavior, including counts-as-higher-tier (`isMet`) and planner dedupe.
- **Integration:** API against dockerized test Postgres — auth flow, invite gating,
  ownership enforcement (A cannot write B's counts), count upsert/delete semantics,
  plan replacement, import (valid + corrupt codes), reference read w/ version.
- **E2E (Playwright, one smoke):** register → login → toggle a count → reload → persisted.
- No visual-appearance tests; that surface belongs to the design session.

## Deployment

- `docker-compose.yml`: `app` (multi-stage Node build) + `postgres:16` (named volume,
  healthcheck). App waits on healthy DB, runs Drizzle migrations at startup, listens on
  one internal port.
- TLS/ingress: user's PXE-cluster reverse proxy (being set up); app itself serves HTTP
  on the compose network only. Postgres is not exposed outside the compose network.
- Config via `.env`: `DATABASE_URL`, `SESSION_SECRET`, `INVITE_CODE`.
- Backups: proxmox-level regime; `pg_dump` cron is the portable fallback.

## Out of scope

- Spreadsheet auto-sync pipeline (spec 2) — sheet tabs already mapped in-session: all
  five tabs public and CSV-exportable; parser will be per-tab with validation.
- Timer/alert ping feature (spec 3).
- Frontend visual design (separate Claude design session).
- Supabase sync retirement: prototype stays functional as-is until the platform is live;
  no changes to it beyond already-merged UX fixes.
