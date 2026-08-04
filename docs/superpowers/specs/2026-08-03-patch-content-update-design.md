# Patch Content Update — Design

- **Date:** 2026-08-03 22:29 PDT
- **Status:** Approved by Jason (interactive brainstorm, background session)
- **Source of truth:** live sheet `1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg` (sheet-authority policy: sheet values ship as-is, never patched locally)

## Goal

Bring the tracker up to the game's latest patch content, end state: everything merged to `origin/main`, stale branches/worktrees cleaned up.

## Verified content delta (live sheet vs `main` @ `859228c`)

No new tier, no new rarity. Galactic and the 4-path rebirth model are already on main. FLAWLESS is an ownership axis, **not** a tier (excluded from the sheet's 380 grand total).

| Domain | Delta |
|-|-|
| Droids | +1 CHOPPER (Iconic/Astromech, 15%/s) → 70 droids; no removals/renames |
| Droid tiers | 28 changed cells: 20 Galactic sell values newly published (grid now complete), HOV-R Beskar income 774→744, 2BB Galactic sell 420m→420k (upstream fix), IG sells corrected (clears standing ratio holds) |
| Chip costs | Rebalance in 4 rarities; Mythic now 4000/8000/20000/40000/70000 |
| Rebirths | RB30 nova crystals 252→254 (only change; 360 requirement rows identical) |
| Nova shop | +2 Featured columns shift the whole tab (parser breaks silently, see below); new items: Companion Slot 250, Upgrade Chip Station 120, Daily Crystals 30; level-curve extensions: Crit Chance L5-18, Crit Amount L6-18, Credits L19-25, Scrap Value L14-19, Crafting Speed L11; cost changes: Crit Chance L4 180→150, Crit Amount L5 330→270; rows 131→175 |
| Cosmetics | +CHOPPER HAT, +CHOPPER PAINT (both "CHOPPER EVENT") |
| Flawless spawn | +Galactic 1/75 |
| New tab | Droid Crafting Times + Companion Buffs (gid `1131770079`) — no parser exists |
| Ignored tab | Inventory Manager (gid `200719463`) — player-facing calculator (formulas, input cells, `#VALUE!` errors), not reference data; not synced |

**Critical defect found:** `parsers/novaShop.ts` uses hardcoded column indices; against the live sheet it does not throw — it emits ~11 garbage rows plus empty paintStages/rebirthMeta, and `validate.ts` has no empty-table guard. Any sync against the live sheet today writes corrupted shop data.

## Scope decisions (Jason, 2026-08-03)

1. **Flawless ownership tracking: IN, full** (schema + sync + UI). Eligibility derived as non-Iconic (62 droids); the sheet's checkbox cells are player state, not reference data — nothing to ingest.
2. **Crafting domain: sync + UI.** Planner shows **base (unbuffed) craft times** per droid/tier plus a simple per-cycle total. Companion-buff tables are reference display on `/droids` only — no buff math in planner, no loadout feature.
3. **Cleanup: full.** Delete all 15 content-verified-merged local branches; prune all stale worktrees including dirty `planner-colored-names` (~13 MB superseded untracked scratch — verified against main before the decision).
4. **PR slicing: 3 layered PRs** (below). Cleanup is direct repo surgery, no PR.

## PR A — Sync foundation

- `sync/fetch.ts`: add gid `1131770079` to `GIDS`. Inventory Manager and Contact Info tabs are deliberately excluded.
- `sync/parsers/novaShop.ts`: rewrite with **header-anchored column discovery** — locate sections by header text (`NOVA SHOP - FEATURED` …) and item columns by name row; no positional constants. Parses all 4 sections, new items, extended curves, paint stages, RB-level crystal/mult table (now through RB 30).
- `sync/validate.ts`: empty-table REJECT for novaShop/paintStages/rebirthMeta + geometry assertion so unknown layouts fail the sync loudly.
- New `sync/parsers/craftingCompanions.ts`: left grid → per-droid craft durations, 6 tiers, `H:MM:SS` → seconds, blank cells → null (unpublished); right stack → 3 companion-buff tables (worker=crafting-speed %, astromech=pickaxe +N, battle=max-health +N; rarity × 6 tiers; Iconic N/A → null) + iconic companion effects (free text, 8 droids incl. CHOPPER).
- Migration `0004` (single migration for the entire update): `crafting_times`, `companion_buffs`, `iconic_companion_effects`, `flawless_owned` (profile × droid, boolean).
- Reference service + `/api/reference`: expose crafting/companion data alongside existing domains.
- Seed refresh: regenerate `app/drizzle/seed-data.json` through the real parsers (`scripts/regen-seed-data.ts`); carries every data delta above. Sheet anomalies ship as-is per sheet authority (e.g. Crafting Speed L11=445 breaking its +15 step; duplicate craft-time cells; Beskar craft times 0.8× Rainbow, i.e. non-monotonic — all real sheet values).
- Fixture debt: `__fixtures__/tabs.ts` gains the new tab **and** the missing col-22 separator rows (known fixture bug from the Galactic review). `regen-seed-data.ts` now fails on unexpected holds with an explicit allowlist (IG holds clear upstream, so the list starts empty or minimal).
- Aliases: `BB-8`→`BB8` retained; verify CHOPPER canonical naming against art/manifest conventions.

## PR B — Flawless ownership (branches from main after A merges)

- API: `PUT /api/profiles/[id]/flawless/[droid]` (+ read via layout load), mirroring counts-endpoint conventions.
- Client: `lib/client/tracker.svelte.ts` + `routes/+layout.server.ts` extended with the flawless axis.
- UI: `/droids` Droidex gains a visually distinct flawless toggle column; collection metric shown as separate `x/62` (matching the sheet's accounting — flawless excluded from the 380 total).

## PR C — Crafting surfaces (parallel with B)

- `/planner`: base craft time per droid/tier on plan rows + a per-cycle total defined as Σ(base craft time × remaining planned crafts) for that cycle.
- `/droids`: three companion-buff reference tables + iconic companion effects.
- Art: attempt CHOPPER art fetch (`scripts/fetch-droid-art.mjs`); re-check the 62 outstanding Galactic art files upstream (droidtrakr previously served fake-200 HTML fallbacks — 13085 B, sha 81f61d6c…; verify by content, not status); self-host whatever now exists.
- `docs/asset-manifest.json`: refresh to the 380-file universe (+CHOPPER), plus the small stale-meta touch-ups (meta.generated, meta.purpose).

## Cleanup (direct, no PR)

Remove worktrees before deleting branches. Three worktree dirs hold a *different* branch than their name suggests (standalone-planner-deploy→`feat/authentik-oidc-sso`, oidc-sso-partb→`feat/oidc-callback-hardening`, platform-impl→`hardening`) — resolve by branch, not directory name. Then delete all 15 merged local branches. `planner-colored-names` (dirty, superseded scratch) is authorized for deletion including its untracked files.

## Testing

Repo pattern (suites at main: 44 unit / 126 integration / 1 route / 10 e2e / svelte-check):

- Parser units against updated fixtures, **plus a regression test asserting the old 4-tab/pre-shift nova geometry now fails loudly** (the defect was a parsing *success* on wrong columns).
- craftingCompanions units: duration parsing, blanks, Iconic N/A, quirk tolerance (`COMPAINION` headers, `"ICONIC "` trailing space).
- Integration: sync-apply with new payload shape; flawless API CRUD; reference endpoint.
- e2e: flawless toggle on `/droids`; planner craft-time render.

## Merge order & deployment

A → (B ∥ C) → cleanup anytime. Single migration in A keeps the drizzle chain linear (`0003_condemned_omega_red` → `0004`). ghcr image builds on each main merge (CI); ghcr package visibility note in deploy-state memory still applies.

## Team shape

Opus agent owns PR A (parser rewrite + schema judgment). Two sonnet agents take B and C in parallel worktrees after A merges. Code-review pass before each merge; orchestrator (this session) verifies suites, merges, and performs cleanup. Detail in the implementation plan (`docs/superpowers/plans/`).

## Out of scope

- Inventory Manager tab sync.
- Companion-buff math in planner / companion loadout feature.
- Prototype/ + standalone/ embedded droid lists (only `app/` deploys).
- Any local correction of sheet values.

## New sheet quirks for the register

`COMPAINION` ×4 block headers; `"ICONIC "` trailing space (reference + crafting tabs, absent in droidex); multi-line quoted INFORMATION cell in nova tab (embedded newline — physical ≠ logical rows); stray `-` in droidex spacer cols 31/34; chip block uses `"3,000"` style while grids use `3k`/`1.06m`/`1.41T` (uppercase T); crafting blanks at TRAK-R/B2 SUPER/HAUL-R/PROTO-ROLLER Galactic and RIC Rainbow; suspected dupes (LO Gold==Basic, B2-RP Beskar==Rainbow, B1 HEAVY Galactic 3:38:06); Crafting Speed L11=445 breaks its +15 step.
