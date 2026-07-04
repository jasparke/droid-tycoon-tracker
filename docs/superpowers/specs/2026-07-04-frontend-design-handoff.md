# Frontend Design Handoff — Droid Tycoon Tracker

- Created: 2026-07-04T11:07:20-07:00
- Audience: the Claude design session that will own the new app's visual design
- Companion to: `2026-07-03-platform-design.md` (engineering spec — read it for routes,
  API, and data shapes; this doc covers what that one deliberately defers)

## What the design session owns vs. what is fixed

**Yours to design:** layout, typography, spacing, component styling, navigation chrome,
chart styling, light/dark treatment, motion. The app you receive is a functional skeleton
with semantic components and minimal styling — restyle freely.

**Fixed (logic or contract, do not rework):** the pure game math in `src/lib/game/`,
API shapes, route names, and the interaction semantics listed below. If a semantic feels
wrong, raise it — don't silently change it.

## Canonical color language: tier colors

The single most important convention. Everything in the app colors *by tier* (upgrade
level), not by rarity. Users have already learned this language. Values are CSS custom
properties — you may retune the exact colors, but the five-way distinction and its
meaning must survive, and the variables are the contract:

|Token|Prototype value|Meaning|
|-|-|-|
|`--base`|`#cfd8e6`|Base tier (grey)|
|`--gold`|`#ffcf3f`|Gold tier|
|`--diamond`|`#4fd0ff`|Diamond tier|
|`--rainbow`|`#ff6ad5`|Rainbow tier|
|`--beskar`|`#9aa6b8`|Beskar tier (top)|

Rarity (Common → Iconic) is text metadata, deliberately NOT color-coded, except tier
pills sometimes carry a tinted background (see prototype `.Base`…`.Beskar` classes).

## Prototype palette (starting point, not a mandate)

Dark theme: `--bg #05080f`, `--panel #0d1422`, `--panel2 #111c30`, `--line #1e2c44`,
`--txt #e7eefb`, `--muted #8095b3`, accents `--accent #22b3ff` / `--accent2 #1488d6`,
`--good #37d67a` (owned/met), `--nova #7b8cff` (nova crystals). The prototype is
dark-only; the rebuild may add a light theme if you design one.

## Assets

- **Droid art:** 68 droids × 5 tiers as webp, filename pattern
  `{NAME}_{Tier}.webp` where NAME is the droid name uppercased with all
  non-alphanumerics stripped (`normName`), and Base tier art is named `_Default`
  (e.g. `CYCLOGRAV_Rainbow.webp`, `MOUSE_Default.webp`).
- **Source:** `https://droidtrakr.com/droid-tycoon/assets/droids/` (community site).
  Prototype load order: IndexedDB blob cache → local `assets/droids/` folder → remote
  fetch (cached on success). The rebuild should self-host copies under app static
  assets so the design isn't hostage to a third-party host; keep attribution
  (README credits droidtrakr.com).
- **Iconography:** the only bespoke icon is an inline SVG upgrade-chip glyph
  (`CHIPICON` in the prototype). Everything else is text/emoji. Icon set choice is yours.

## Interaction semantics that must survive restyling

1. **Checklist rows:** right-side pill = REQUIRED tier (constant — never changes on
   interaction); droid name is colored by the OWNED tier (or default text color when
   unowned); tooltip carries both ("requires Beskar · have Rainbow"). This resolved a
   real user-confusion bug — do not re-merge these two signals into one badge.
2. **Droid popover** (hover any droid name): interactive, not a tooltip — it contains
   per-tier −/+ count controls. Appears after ~500ms, is placed once (doesn't follow the
   cursor), stays open while the pointer is over trigger or popover, closes after a
   ~250ms grace. Content refreshes live when counts change.
3. **Counts-as semantics:** owning a higher tier satisfies lower-tier requirements
   (a Beskar copy checks a Gold requirement) — met-state visuals must reflect `isMet`,
   not exact-tier match.
4. **Planner dedupe:** combined needs across selected rebirths show only the highest
   tier per droid; summary chips are tier-colored pills with owned state.
5. **Optimistic writes:** every count/plan edit applies instantly and visibly rolls
   back with a toast on server failure. Failure states need a designed treatment.

## Data display conventions

- Large numbers abbreviate (`10K`, `2.95M`, `4.5T`) — credit costs span 10^3 to 10^12.
- Income is per-second (`24/s`); chip costs use the chip glyph.
- "Data as of …" reference-version indicator should be visible but unobtrusive
  (spec: `data_versions`).

## ROI view (new — no prototype precedent, greenfield for design)

Table + scatter of payback time (buy cost ÷ income/s) per droid-tier. Hard constraint:
the cost-vs-income scatter must use log-log axes — the domain spans ~9 orders of
magnitude and linear axes render it useless. Filters: rarity, type, tier; owned rows
marked. Otherwise yours to shape.

## Views inventory

`/checklist` (dense, primary daily view) · `/planner` (multi-select + combined needs) ·
`/inventory` (owned droids + worth) · `/droids` (full reference) · `/keepers`
(don't-sell list) · `/roi` (new) · `/login`, `/register` (minimal) · Nova shop /
cosmetics / chip-cost reference panels (secondary, collapsible in prototype).
Multi-profile switcher and member visibility (read-only views of other members'
profiles) need navigation treatment the prototype never had.
