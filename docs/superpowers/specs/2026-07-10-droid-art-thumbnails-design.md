# Droid Art Thumbnails (Design)

- Created: 2026-07-10T23:52:18-07:00
- Status: approved (brainstorm session, design user-approved 2026-07-10)
- Sources of truth:
  - `.claude/worktrees/asset-manifest/docs/asset-manifest.json` — verified inventory
    of all 340 droid tier-art files (droidtrakr, HTTP 200 webp, `normName` filenames).
  - `docs/superpowers/specs/2026-07-04-frontend-design-handoff.md` §Assets — filename
    contract, load order, self-host + attribution guidance.
  - `prototype/index.html:541-564` — reference `normName` / `droidImg` implementation.
- Scope decisions (user):
  - **Surfaces:** all droid-listing views — Checklist, SearchPopover, and the
    (currently unrestyled) Inventory / Keepers / Droidex views.
  - **Sourcing:** this session self-hosts. Download all 340 `.webp` (~13 MB) into
    `app/static/assets/droids/` and commit them, plus wire the UI.
  - **Variant:** Base / `_Default` identity thumbnail per droid for v1. Tier-specific
    art (skin changing per tier) is downloaded but not rendered yet — a later enhancement.
  - **Loading:** simple `<img>` with an `onerror` fallback chain. No IndexedDB blob
    cache (the prototype needed it as an offline single-file page; this is a
    server-hosted app where the browser HTTP cache + local static serving suffice).

## Overview

This is the "droid-art pipeline" sub-project deferred by the tracker-redesign spec
(`2026-07-07-…-checklist-design.md`). The rebuilt SvelteKit app currently shows droids
as text names only. This adds a self-hosted droid thumbnail to every surface that lists
droids.

**No backend, DB, or seed changes.** The art filename is derived entirely client-side
from the droid `name` (already in the reference data) plus a tier. The 340 image files
are static assets served by SvelteKit at the site root.

## Filename contract

`normName(name) = name.toUpperCase().replace(/[^A-Z0-9]/g, '')`

`droidArtFile(name, tier) = normName(name) + "_" + fileTier(tier) + ".webp"`, where
`fileTier('Base') = 'Default'` and every other tier keeps its own name.

Worked examples (from the verified manifest):

- `A-LT` + Gold → `ALT_Gold.webp`
- `DRK-1 PROBE` + Base → `DRK1PROBE_Default.webp`
- `IMPERIAL PROBE` + Beskar → `IMPERIALPROBE_Beskar.webp`
- `2BB` + Base → `2BB_Default.webp`
- `MOUSE` + Rainbow → `MOUSE_Rainbow.webp`

droidtrakr uses these `normName` filenames exactly (zero remapping — verified in the
manifest's source investigation), so a generated name maps 1:1 to both the local path
and the remote URL.

## File layout

```
scripts/
  fetch-droid-art.mjs              # NEW: download 340 webp → app/static/assets/droids/
app/
  static/assets/droids/            # NEW: 340 committed *.webp (~13 MB)
  src/lib/game/
    art.ts                         # NEW: normName, fileTier, droidArtFile (+ art.test.ts)
  src/lib/components/
    DroidImg.svelte                # NEW: <img> with local→remote→hidden fallback
  src/routes/checklist/+page.svelte        # thumbnail in each row
  src/lib/components/SearchPopover.svelte   # thumbnail in each result
  src/routes/inventory/+page.svelte         # thumbnail per droid row
  src/routes/keepers/+page.svelte           # thumbnail per droid/card
  src/routes/droids/+page.svelte            # (Droidex) thumbnail per droid row
README.md                          # keep droidtrakr attribution; note self-hosting
```

## Components / units

### 1. `scripts/fetch-droid-art.mjs` (acquisition)

- Reads the 68 droids from `app/drizzle/seed-data.json` (canonical dataset).
- Generates 340 filenames = 68 droids × 5 tiers (`Default`, `Gold`, `Diamond`,
  `Rainbow`, `Beskar`) via the filename contract above.
- Downloads each from `https://droidtrakr.com/droid-tycoon/assets/droids/<file>` into
  `app/static/assets/droids/<file>`.
- **Idempotent:** skips files already on disk; safe to re-run.
- Validates `content-type: image/webp` and non-zero length; prints a summary and a
  non-zero exit if any file is missing/failed so a partial pull is never silently
  committed.
- Run once to populate; the 340 `.webp` are then committed. The script stays in the
  repo for reproducibility (documented in README). Optional npm alias in
  `app/package.json`: `"assets:droids": "node ../scripts/fetch-droid-art.mjs"`.

### 2. `app/src/lib/game/art.ts` (pure helper)

```ts
export function normName(name: string): string;      // uppercase, strip non-alphanumerics
export function droidArtFile(name: string, tier: Tier): string;  // "{NORM}_{fileTier}.webp"
export function droidArtUrl(name: string, tier: Tier): string;   // "/assets/droids/{file}"
```

Pure and framework-free → unit-testable without the Svelte compiler (same constraint
that kept the tracker store out of the unit harness). `Tier` reuses `$lib/game/tiers`.

### 3. `app/src/lib/components/DroidImg.svelte`

- Props: `{ name: string; tier?: Tier = 'Base'; size?: number = 28; class?: string }`.
- Renders `<img src={droidArtUrl(name, tier)} loading="lazy" alt="" width={size}
  height={size}>`.
- **Fallback chain (`onerror`):** local `/assets/droids/<file>` → remote
  `droidtrakr.com/...<file>` (tried once, guarded by a flag) → `visibility: hidden`
  (never collapses row layout; the adjacent text name is the accessible label, so
  `alt=""` is correct — the image is decorative).
- Styling matches the holo-terminal chips: dark rounded background
  (`var(--panel-deep)`-ish), `object-fit: contain`, `flex: none`. Size driven by the
  `size` prop / a CSS var so each surface can pick its scale.

### 4. Placement

One identity thumbnail (`tier="Base"`) per droid:

- **Checklist row** (`checklist/+page.svelte`): left of the name column, ~28 px.
- **SearchPopover** result rows: ~22 px.
- **Inventory / Keepers / Droidex**: in each droid row/card, ~24–28 px. These views are
  unrestyled-by-design; adding `<DroidImg>` is a minimal, consistent change and does not
  pre-empt their future restyle sub-projects.

## Data flow

Reference droid `name` (already loaded via `page.data.reference.droids` / tracker) →
`droidArtUrl(name, 'Base')` → `<img>` src. Local static file served by SvelteKit; on a
miss, the browser's `onerror` swaps to the droidtrakr URL; on a second miss, the image
hides. No network calls in app code, no state, no store changes.

## Error handling

- Missing local file → transparent remote fallback (covers the window before assets are
  committed, and any single-file gap).
- Missing remote too → hidden image, text name still present. No broken-image icon, no
  layout shift.
- Fetch script surfaces failures loudly (non-zero exit + per-file report) rather than
  committing a partial set.

## Testing

- **Unit (`art.test.ts`, TDD):** `normName` edge cases (hyphens `A-LT`, spaces
  `IMPERIAL PROBE`, digits `2BB`), `fileTier` Base→Default mapping, full
  `droidArtFile` / `droidArtUrl` output for a representative droid per rarity.
- **E2e (extend `e2e/checklist.spec.ts`):** a checklist row renders a droid `<img>`
  whose `src` ends with the expected `/assets/droids/<NORM>_Default.webp`; simulate a
  local 404 and assert the `src` falls back to the droidtrakr URL (fallback wiring, not
  network dependence).
- **Acquisition:** fetch script asserts 340/340 downloaded (content-type + size); a
  committed count check (`ls app/static/assets/droids | wc -l == 340`).

## Non-goals / deferred

- **Tier-specific rendering** (per-chip or owned-tier skins) — files are self-hosted now,
  rendering is a later enhancement.
- **IndexedDB blob cache** — not needed for a server-hosted app.
- **Other manifest categories** — app-icons (favicon set, P1), self-vendored fonts (P1),
  bespoke chip/UI icons (P3) are separate manifest line items, out of scope here.

## Attribution / IP

Art is fan-extracted (© Lucasfilm / Epic / FOAD) sourced from the community site
droidtrakr.com. Self-hosting a private tracker is the same posture as the prototype's
existing hot-link. Keep the droidtrakr credit in `README.md`; add a one-line note that
the images are self-hosted copies.
