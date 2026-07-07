# Tracker Redesign — Foundation + Checklist (Design)

- Created: 2026-07-07T00:11:33-07:00
- Status: approved (brainstorm session, all sections user-approved)
- Sources of truth: `design_handoff_tracker_redesign/README.md` (07-06 design handoff, v1)
  and `Droid Tycoon Prototype.dc.html` (primary visual reference). Where the older
  `2026-07-04-frontend-design-handoff.md` disagrees on values, the 07-06 README wins;
  its variable-name contract and five-way tier distinction are preserved.
- Scope decisions (user): Foundation + Checklist first; old views stay reachable inside
  the new shell; droid art deferred to a later sub-project; token-first Svelte
  components (no Tailwind, no inline-style transliteration).

## Overview

First sub-project of the holo-terminal redesign: design tokens + fonts, the app shell
(190px sidebar, header controls, profile switcher), shared interactive components
(TierChip, TierLadder, SearchPopover, StatStrip), tracker-store extensions, and a full
Checklist rewrite. Later sub-projects (each its own spec → plan → build): Planner, ROI,
SRB Pre-plan, in-game overlay, droid-art pipeline, Inventory/Droidex/Keepers/Reference.

**No backend changes.** `PATCH /api/profiles/[id]` already accepts `cycle`,
`currentRebirth`, and `prefs`; counts and reference APIs cover everything else.

## File layout

```
app/src/
  app.css                          # full token set + fonts + base styles (rewritten)
  lib/assets/fonts/                # self-hosted Chakra Petch + JetBrains Mono woff2
  lib/client/tracker.svelte.ts     # extended: setCycle, setRebirth, setHideDone
  lib/client/format.ts             # NEW: fmtN, pad2, parseNum (+ format.test.ts)
  lib/components/
    Shell.svelte                   # sidebar + header chrome; slots the view
    TierChip.svelte                # letter+count pill; click +1, contextmenu −1
    TierLadder.svelte              # 5-tier ladder w/ steppers + RB/SELLABLE statuses
    SearchPopover.svelte           # global ⌘K overlay
    StatStrip.svelte               # generic 4-cell stats band
    Toasts.svelte                  # existing, restyled to tokens
  lib/game/inventory.ts            # ADDITIVE: satisfyingIdx() + unit tests
  routes/
    +layout.svelte                 # renders Shell around children when authed
    checklist/+page.svelte         # rewritten
```

Routes are contract-fixed; nav labels are the design's (DROIDEX → `/droids`).

## Design tokens (`app.css :root`)

Fonts: Chakra Petch 600/700 (display/UI labels, droid names, nav), JetBrains Mono
500/600/700 (all numbers, badges, meta). Self-hosted woff2 via `@font-face` — no CDN.
Dark-only; no light theme.

|Group|Tokens|
|-|-|
|Surfaces|`--bg #05070c`; page glow `radial-gradient(900px 500px at 60% -180px, #0c1a30, #05070c 60%)`; `--panel #0d1626`; `--panel-deep #080d17`|
|Hairlines|`--line #17253f` (strong); `--line-row #101a2e`; `--line-row2 #0d1524`; `--line-ctrl #1c2a45`|
|Text|`--txt #e8f0ff`; `--txt-2 #7e93b8`; `--txt-3 #4a5f82`; `--txt-4 #3a4d6e`|
|Accents|`--accent #35c8ff`; `--good #3ddf8a`; `--warn #ffc93f` (credits); `--nova #8b96ff`; `--alert #ff5c6a`|
|Tier pairs|`--base #c6d3e6`/`--base-bg #1c2430` · `--gold #ffc93f`/`#382b06` · `--diamond #4fd4ff`/`#082a38` · `--rainbow #ff6ad5`/`#3a0a2c` · `--beskar #b8c4d4`/`#242c38`|
|Rarity (ROI-scoped exception, defined now)|common `#c6d3e6`, rare `#35c8ff`, epic `#b07aff`, legendary `#ffc93f`, mythic `#ff5c5c`|

Tier OWNS the color language; rarity is text-only metadata everywhere except the
future ROI view.

Shared recipes: `.pill` (radius 99px, 1px border in fg color, tinted bg);
angular-corner clip-path utility (6–10px notches,
e.g. `polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)`);
slim scrollbars (8px, `--line-ctrl` thumb).

`format.ts` (locked conventions): `fmtN` — K/M/B/T suffixes, ≥100 → integer, ≥10 →
1 decimal, else 2 decimals (`10K`, `2.95M`, `32.00T`); income `24/s`; payback `4.2h`;
`pad2` (`RB 09`); `parseNum` accepts `185.43M`-style input (for later ROI filters).

## Shell

**Sidebar (190px, full height, `rgba(6,10,18,.7)` bg, right hairline):**

- Brand: gradient "DT" mark (accent→#1272b8, clipped corner) + `TYCOON//TRKR`.
- Nav (README order): CHECKLIST, PLANNER, INVENTORY, DROIDEX, KEEPERS, ROI,
  SRB PRE-PLAN, REFERENCE. Active route: accent-tinted bg + 2px accent left border.
  SRB PRE-PLAN and REFERENCE are muted, non-clickable SOON stubs. All other entries
  link to the existing pages, which render inside the shell untouched (plain but
  usable) until their own redesign sub-projects.
- Bottom PROFILES block: current-profile card (avatar initial, name, ▾) opening a
  dropdown of the user's profiles plus other members' read-only profiles (replaces the
  old `<select>`). Dropdown footer holds username + logout.

**Header row:** view title · CYCLE 1/2 segmented toggle · REBIRTH `NN/27` −/+ stepper
in a notched box · search field (opens popover; shows ⌘K kbd hint) · HIDE DONE toggle
(◉/○) · `data v<date>` indicator (from reference version, faint, right side).

**Persistence:** cycle → optimistic `PATCH {cycle}`; rebirth stepper → optimistic
`PATCH {currentRebirth}` debounced ~400ms trailing (rapid clicks coalesce); hide-done →
`PATCH {prefs: {hideDone}}` merged into existing prefs. All reuse the store's
rollback-with-toast pattern. `currentRebirth` may be 0 in the DB; UI clamps display
and stepping to 01–27 (0 renders as 01).

**Read-only profiles:** all count controls and the cycle/rebirth header controls
disable; the hide-done toggle stays active but is local-only view state there
(never persisted to another member's prefs). Slim READ-ONLY badge next to the
view title.

**Layout mechanics:** fixed 100vh flex frame, `min-width: 1180px` (desktop-dense by
design); main region scrolls internally.

## Shared components

**TierChip** — props: tier, count, satisfying, disabled, inc/dec. Pill: tier letter
(B/G/D/R/BK) + count, tier fg/bg pair, 1px fg border. Green ring
`0 0 0 2px rgba(61,223,138,.4)` when `satisfying`. Click = +1;
contextmenu (preventDefault) = −1. Touch long-press deferred to phone-companion phase.

**TierLadder** — the 4c full ladder. 5 rows: tier label (tier fg, 60px) · status ·
`− n +` stepper (clamps ≥0). Status from the droid's earliest requirement at
rb ≥ currentRb in the active cycle: required tier → `RB 09` green; higher tiers →
`RB 09 ↑` green; all others → `SELLABLE` gray at 0.5 row opacity. No requirement
anywhere ahead → all rows SELLABLE. Steppers disabled on read-only profiles.

**SearchPopover** — mounted once in the layout; works on every view. Open: ⌘K/Ctrl+K,
Ctrl+`` ` ``, `/` (suppressed while typing in inputs/textareas), or header search field.
440px, fixed top 70px centered, accent border, 10px notch clip-path,
`rgba(2,4,8,.55)` backdrop; Esc/backdrop click closes. Case-insensitive substring
match on droid names → result chips (cap 12; active chip accent-tinted); ↑↓ moves the
active result (per the 6a mock; Tab-between-tiers stays out of scope). Active droid
block: name, `RARITY · TYPE` meta, verdict (`KEEP · RB##` gold / `SELLABLE` gray), and
its live TierLadder. No-results state: `NO DROID MATCHES "…"`. Footer hint bar:
`+/− ADJUST COUNTS — SYNCS TO CHECKLIST` + kbd badges.

**StatStrip** — generic band of 4 cells `{label, value, color}` on `--panel-deep`
separated by `--line` gaps.

**Store extensions (`tracker.svelte.ts`)** — `setCycle(n)`, `setRebirth(n)`
(debounced), `setHideDone(b)`; all optimistic with rollback + toast, no-ops on
read-only. Reactive `cycle`, `currentRebirth`, `hideDone` read from the active
profile row so every view shares one source.

**Game-lib addition** — `satisfyingIdx(rows, cycle, droid, tier)`: lowest owned tier
index ≥ required with n > 0, else −1 (drives ring + verdict). Pure, additive, unit
tested; existing fixed math untouched.

## Checklist view

Top→bottom: StatStrip → hint bar → scrolling rebirth blocks (current RB → 27, active
cycle only).

**StatStrip cells:** THIS REBIRTH COST (credits string, `--warn`) · DROIDS MET `n/3`
(`--good`) · CYCLE PROGRESS `round((currentRb−1)/27×100)`% (`--txt`) · NOVA @ THIS RB
(`--nova`, from `rebirthMeta.nova` via the reference API — not hardcoded; `—` when
none).

**Hint bar:** `TAP CHIP = +1 · RIGHT-CLICK = −1 · GREEN RING = TIER SATISFYING THE
REQUIREMENT` (faint mono, letter-spaced).

**Block header:** `RB##` accent · credit threshold gold · `n/3` met counter (green at
3/3, else `--txt-2`) · unlock text right-aligned faint.

**Row anatomy:** 170px name column (droid name Chakra 12px + `RARITY · TYPE` meta) ·
REQ pill (58px, tier fg/bg, tier name — constant, never changes on interaction) · one
TierChip per tier from required→Beskar, always visible even at count 0 · verdict
(86px, right-aligned): met → `✓ TIERNAME` `--good`; unmet → `KEEP · RB##` `--warn` ·
met rows at 0.6 opacity · `--line-row2` separators.

**▾ ladder expander (resolved discrepancy):** README locked-semantic #3 specifies a ▾
affordance per row expanding the 4c ladder; the prototype omitted it. Decision
(user-approved): implement it — ▾ at the row's right edge toggles an inline TierLadder
beneath the row (multiple rows may be open; reuses the search popover's component).
Rationale: it is on the locked list, it is the only in-checklist way to adjust
below-required tiers, and it replaces the previous design's interactive hover popover.

**Hide done:** filters met rows and collapses fully-met blocks.

**Counts-as:** met-state everywhere derives from `isMet`/`satisfyingIdx`
(higher tier satisfies lower requirement), never exact-tier match.

## Testing & verification

- **Unit (vitest):** `satisfyingIdx` cases (exact tier, higher tier, none, empty);
  `format.test.ts` for `fmtN` boundaries (999 → `999`, 1000 → `1.00K`, 10.5K → 1dp,
  ≥100 → integer, T range), `pad2`, `parseNum`.
- **E2E (Playwright, existing hermetic `dtt_test` harness):** chip click increments
  and persists across reload; right-click decrements; verdict flips to `✓`; hide-done
  hides met rows/blocks; rebirth stepper filters blocks and persists; ⌘K and `/` open
  search; search ladder stepper syncs to the checklist row; ▾ expands the inline
  ladder; old routes (planner, inventory, droids, keepers, roi) render inside the
  shell; read-only profile disables controls.
- `svelte-check` clean; existing unit/integration suites untouched and passing.
- Manual: dev server side-by-side with the prototype HTML for visual fidelity before
  the PR.

## Out of scope (later sub-projects)

Planner/ROI/SRB Pre-plan/overlay redesigns · droid art + asset pipeline ·
Inventory/Droidex/Keepers/Reference views · phone companion · touch long-press
decrement · search Tab-between-tiers · cycles 3–4 data · Iconics treatment.
