# Patch Content Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the tracker up to the game's latest patch content — CHOPPER, rebalanced chip costs, a rewritten (currently broken) nova-shop parser, a new crafting/companion tab, flawless ownership tracking, and crafting surfaces in the UI — ending with everything merged to `origin/main` and stale branches/worktrees cleaned up.

**Architecture:** Three layered PRs on top of `main`. **PR A** fixes and extends the sync pipeline: a header-anchored rewrite of `parsers/novaShop.ts` (the current positional parser silently mis-parses the live sheet), a new `parsers/craftingCompanions.ts`, loud validation guards, one migration (`0004`) carrying every new table for the whole update, and a regenerated `drizzle/seed-data.json`. **PR B** (after A merges) adds the flawless ownership axis: table → service → `PUT` endpoint → tracker store → `/droids` toggle column. **PR C** (parallel with B) adds read-only crafting surfaces to `/planner` and `/droids`, plus droid art and manifest housekeeping. **Phase D** is direct repo hygiene, no PR.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), TypeScript, drizzle-orm + drizzle-kit on PostgreSQL 16, postgres.js, `csv-parse`, vitest (unit/integration/route suites), Playwright (e2e), Node 22+.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Sheet authority — never patch sheet values.** The spreadsheet is correct unless Jason says otherwise. Anomalies ship verbatim, including: nova Workshop `Crafting Speed` L11 = **445** (breaks its own +15 step), duplicate craft-time cells (`LO` Basic == Gold == `0:07:31`; `B2-RP` Rainbow == Beskar == `6:26:25`; `B1 HEAVY` and `B2 HEAVY` both Galactic `3:38:06`), and Beskar craft times being **0.8×** Rainbow (non-monotonic across tiers). Do not "fix", round, or interpolate any of these. Do not add compensating logic.
- **Working directory.** All commands below are written to run from the `app/` directory of the repo checkout unless a path says otherwise (`scripts/`, `docs/` live at the repo root). The repo root is the git worktree you are working in.
- **One migration only.** Migration `0004` (created in Task A5) carries *all four* new tables for the entire update — `crafting_times`, `companion_buffs`, `iconic_companion_effects`, `flawless_owned`. PRs B and C add **no** migrations; the drizzle chain stays linear (`0003_condemned_omega_red` → `0004_*`).
- **Merge order.** A → (B ∥ C) → cleanup. B and C both branch from `main` *after* A merges. Squash-merge each PR to `main`.
- **Branches.** PR A: `feat/patch-sync-foundation`. PR B: `feat/flawless-ownership`. PR C: `feat/crafting-surfaces`. Never commit to `main` directly; never force-push; never merge locally.
- **Commit style** (from `git log`): `feat:`, `fix:`, `docs:`, `test:` prefixes, optional scope — e.g. `feat(sync): header-anchored nova shop parser`, `fix(data): correct stale Mythic chip costs to live sheet values`.
- **Executor grade.** Each task is tagged `[opus]` (parser/schema/validation judgment) or `[sonnet]` (UI, tests, manifest, cleanup). Dispatch accordingly.
- **First-run setup in a fresh worktree** — `node_modules` is not checked in:
  ```bash
  cd app && npm ci
  cd .. && docker compose -f docker-compose.dev.yml up -d db
  ```
  The `db` service creates both `dtt` and `dtt_test` (`scripts/dev-init.sql`). Integration and e2e suites require it running.
- **Test commands** (all from `app/`):
  | suite | command | needs DB |
  |-|-|-|
  | unit | `npm run test:unit` | no |
  | integration | `npm run test:int` | yes |
  | route | `npm run test:routes` | yes |
  | e2e | `npm run test:e2e` | yes |
  | types | `npm run check` | no |

  Baseline at `main`: 44 unit / 126 integration / 1 route / 10 e2e, `npm run check` clean. Every task must leave all suites green.
- **Live-sheet CSV exports** for data work are at `/Users/jason/.claude/jobs/657deff8/tmp/tab-<gid>.csv`:
  `1248391507` droid reference · `0` droidex/rebirths · `547464940` cosmetics · `1548395368` nova · `1131770079` crafting/companions. Re-export from `https://docs.google.com/spreadsheets/d/1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg/export?format=csv&gid=<gid>` if they are gone.
- **No placeholders in shipped code.** Every function in this plan is fully specified; if something in the sheet does not match, stop and report rather than inventing a fallback.

### Verified live-sheet facts (use these as expected values)

| Fact | Value |
|-|-|
| Droids | 70 (`+CHOPPER`, Iconic/Astromech, 15%/s) |
| Droid tier rows | 420 (70 × 6) |
| Nova shop rows | **175** (was 131) |
| Nova paint stages | 3 |
| Rebirth meta rows | 19 (RB 12–30); RB30 nova **254** (was 252) |
| Flawless spawn rows | 6 (`+Galactic 1/75`) |
| Chip cost rows | 6 rarities; Mythic = 4000 / 8000 / 20000 / 40000 / 70000 |
| Cosmetics | 65 (`+CHOPPER HAT`, `+CHOPPER PAINT`, both "CHOPPER EVENT") |
| Crafting time rows | 420 (70 × 6), **53 null** (48 Iconic + 5 unpublished) |
| Companion buff rows | 108 (3 kinds × 6 rarities × 6 tiers), 18 null (Iconic N/A) |
| Iconic companion effects | 8 |
| Rebirth reqs | 360 (unchanged) |

### Live nova tab geometry (gid 1548395368, logical rows after CSV quoting)

Row 1 = section banner, row 3 = item-name header, data from row 4.
`FEATURED` banner @col 0, LEVEL @0, items @1–5 · `CORE UPGRADES` banner @7, LEVEL @7, items @8–16 · `WORKSHOP UPGRADES` banner @18, LEVEL @18, items @19–27 · `COSMETICS` banner @29, LEVEL @29, paint @30 · `RB LEVEL` block @36–39.
The old parser hardcoded 0/1–3, 5/6–14, 16/17–25, 27/28, 34 — every one of them is now wrong, which is why it emits garbage instead of throwing.

### Live crafting tab geometry (gid 1131770079)

Header row index 2: `RARITY`@0 `DROID`@1 `TYPE`@2 `BASIC`@3 `GOLD`@4 `DIAMOND`@5 `RAINBOW`@6 `BESKAR`@7 `GALACTIC`@8. Column 9 is a blank separator. Right stack label column = 10, values 11–16. Blocks (label col 10): `WORKER COMPAINION DROIDS - CRAFTING SPEED BUFFS` @row 1, `ASTROMECH COMPAINION DROIDS - PICKAXE LEVEL BUFFS` @row 10, `BATTLE COMPAINION DROIDS - MAX HEALTH BUFFS` @row 19, `COMPAINION DROIDS - ICONIC DROIDS` @row 28 (header `DROID`/`BASIC` at row 29, 8 droid rows). Sheet quirks to tolerate: `COMPAINION` typo in all four headers, `"ICONIC "` with a trailing space in the rarity column, Iconic craft cells `N/A`, five genuinely blank Galactic/Rainbow cells.

---

## File Structure

**PR A**
- Modify `app/src/lib/server/sync/fetch.ts` — add the crafting gid.
- Rewrite `app/src/lib/server/sync/parsers/novaShop.ts` — header-anchored discovery.
- Rewrite `app/src/lib/server/sync/parsers/novaShop.test.ts` — live geometry, pre-shift geometry, loud-failure cases.
- Create `app/src/lib/server/sync/parsers/craftingCompanions.ts` + `.test.ts`.
- Modify `app/src/lib/server/sync/types.ts` — three new row types + `PayloadTables` fields.
- Modify `app/src/lib/server/sync/validate.ts` (+ `.test.ts`) — empty-table and geometry rejects.
- Modify `app/src/lib/server/sync/build.ts` (+ `.test.ts`), `canonical.js`, `diff.ts` (+ `.test.ts`) — plumbing.
- Modify `app/src/lib/server/sync/__fixtures__/tabs.ts` — new nova geometry, crafting tab, col-22 separator repair.
- Modify `app/src/lib/server/schema.ts`; create `app/drizzle/migrations/0004_*.sql` (+ meta).
- Modify `app/src/lib/server/services/sync.ts`, `reference.ts` (+ integration tests), `app/src/lib/server/testing/db.ts`.
- Modify `app/drizzle/seed.mjs`, `app/drizzle/backfill-payload.mjs`, `app/scripts/regen-seed-data.ts`.
- Regenerate `app/drizzle/seed-data.json`.

**PR B**
- Create `app/src/lib/game/flawless.ts` (+ `.test.ts`) — pure eligibility/progress helpers.
- Create `app/src/lib/server/services/flawless.ts` (+ integration test).
- Create `app/src/routes/api/profiles/[id]/flawless/[droid]/+server.ts`.
- Modify `app/src/routes/+layout.server.ts`, `app/src/lib/client/tracker.svelte.ts`, `app/src/routes/droids/+page.svelte`.
- Create `app/e2e/flawless.spec.ts`.

**PR C**
- Create `app/src/lib/game/crafting.ts` (+ `.test.ts`).
- Modify `app/src/routes/planner/+page.svelte`, `app/src/routes/droids/+page.svelte`.
- Create `app/e2e/crafting.spec.ts`.
- Modify `scripts/fetch-droid-art.mjs`, `docs/asset-manifest.json`; add art under `app/static/assets/droids/`.

---

# PHASE A — Sync foundation (PR A, branch `feat/patch-sync-foundation`)

## Task A1 [opus]: Header-anchored nova shop parser

**Files:**
- Rewrite: `app/src/lib/server/sync/parsers/novaShop.ts`
- Rewrite test: `app/src/lib/server/sync/parsers/novaShop.test.ts`
- Modify: `app/src/lib/server/sync/__fixtures__/tabs.ts` (the `NOVA_CSV` export only)

**Interfaces:**
- Consumes: `toRows(csv): string[][]` and `cell(row, i): string` from `../csv`; `unlockLabel(s): string` from `../normalize` (ALL CAPS → Title Case); types `NovaShopRow { category: string; item: string; level: number; cost: number }`, `RebirthMetaRow { rebirth: number; nova: number; creditMult: number; xpMult: number }`, `PaintStageRow { stage: number; crystalCost: number }` from `../types`.
- Produces: `parseNovaShop(csv: string): { novaShop: NovaShopRow[]; rebirthMeta: RebirthMetaRow[]; novaPaintStages: PaintStageRow[] }` — same signature as today, so `build.ts` needs no change for this task. Throws `Error` with a message starting `nova-shop header anchor failed:` on any geometry it cannot resolve.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/patch-sync-foundation
cd app && npm ci
```

- [ ] **Step 2: Replace the nova fixture with the live geometry**

In `app/src/lib/server/sync/__fixtures__/tabs.ts`, replace the whole `NOVA_CSV` export with this (width 40; the embedded newline in col 36 reproduces the sheet's multi-line INFORMATION cell, so physical rows ≠ logical rows):

```ts
export const NOVA_CSV = [
	row(40, { 7: 'banner' }),
	row(40, { 0: 'NOVA SHOP - FEATURED', 7: 'NOVA SHOP - CORE UPGRADES', 18: 'NOVA SHOP - WORKSHOP UPGRADES', 29: 'NOVA SHOP - COSMETICS' }),
	row(40, { 0: 'NOVA CRYSTAL COST', 8: 'NOVA CRYSTAL COST', 19: 'NOVA CRYSTAL COST', 29: 'NOVA CRYSTAL COST', 36: 'INFORMATION' }),
	row(40, { 0: 'LEVEL', 1: 'CRITICAL CHANCE', 2: 'CRITICAL AMOUNT', 3: 'COMPANION SLOT', 4: 'UPGRADE CHIP STATION', 5: 'DAILY CRYSTALS',
	          7: 'LEVEL', 8: 'MAX HEALTH', 11: 'FLAWLESS CHARM',
	          18: 'LEVEL', 19: 'LOUNGE SLOT', 23: 'CRAFTING SPEED',
	          29: 'LEVEL', 30: 'NOVA CRYSTAL BASE PAINT', 36: 'note\nwith newline' }),
	row(40, { 0: '1', 1: '60', 2: '30', 3: '250', 4: '120', 5: '30', 7: '1', 8: '1', 11: '500', 18: '1', 19: '1', 23: '3', 29: '1', 30: '30' }),
	row(40, { 0: '2', 1: '90', 2: '90', 7: '2', 8: '6', 18: '2', 19: '30', 23: '18', 29: '2', 30: '120', 36: 'NOVA CRYSTALS/RB LEVEL' }),
	row(40, { 0: '3', 1: '120', 2: '150', 7: '3', 8: '13', 18: '3', 19: '60', 23: '33', 29: '3', 30: '400',
	          36: 'RB LEVEL', 37: 'CRYSTAL QUANTITY', 38: 'CREDIT MULT', 39: 'XP MULT' }),
	row(40, { 36: 'RB 12', 37: '11 NOVA CRYSTALS', 38: '22%', 39: '110%' }),
	row(40, { 36: 'RB 13', 37: '16 NOVA CRYSTALS', 38: '32%', 39: '160%' })
].join('\n');
```

- [ ] **Step 3: Write the failing test file**

Replace the entire contents of `app/src/lib/server/sync/parsers/novaShop.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { parseNovaShop } from './novaShop';
import { NOVA_CSV } from '../__fixtures__/tabs';

function row(width: number, cells: Record<number, string>): string {
	const a = Array(width).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

// The sheet layout as it was BEFORE the two new Featured columns shifted everything right:
// FEATURED level@0 items@1-3, CORE level@5 items@6-14, WORKSHOP level@16 items@17-25,
// COSMETICS level@27 paint@28, RB block @34-37. Header anchoring must read it identically.
const PRE_SHIFT_CSV = [
	row(38, { 5: 'banner' }),
	row(38, { 0: 'NOVA SHOP - FEATURED', 5: 'NOVA SHOP - CORE UPGRADES', 16: 'NOVA SHOP - WORKSHOP UPGRADES', 27: 'NOVA SHOP - COSMETICS' }),
	row(38, { 0: 'NOVA CRYSTAL COST', 6: 'NOVA CRYSTAL COST', 17: 'NOVA CRYSTAL COST', 27: 'NOVA CRYSTAL COST', 34: 'INFORMATION' }),
	row(38, { 0: 'LEVEL', 1: 'CRITICAL CHANCE', 5: 'LEVEL', 6: 'MAX HEALTH', 9: 'FLAWLESS CHARM',
	          16: 'LEVEL', 17: 'LOUNGE SLOT', 27: 'LEVEL', 28: 'NOVA CRYSTAL BASE PAINT' }),
	row(38, { 0: '1', 1: '60', 5: '1', 6: '1', 9: '500', 16: '1', 17: '1', 27: '1', 28: '30' }),
	row(38, { 0: '2', 1: '90', 5: '2', 6: '6', 16: '2', 17: '30', 27: '2', 28: '120' }),
	row(38, { 0: '3', 1: '120', 5: '3', 6: '13', 16: '3', 17: '60', 27: '3', 28: '400',
	          34: 'RB LEVEL', 35: 'CRYSTAL QUANTITY', 36: 'CREDIT MULT', 37: 'XP MULT' }),
	row(38, { 34: 'RB 12', 35: '11 NOVA CRYSTALS', 36: '22%', 37: '110%' })
].join('\n');

describe('parseNovaShop — live (post-shift) geometry', () => {
	const out = parseNovaShop(NOVA_CSV);

	it('parses all three ladder categories from their banner text', () => {
		expect([...new Set(out.novaShop.map((n) => n.category))].sort()).toEqual([
			'Core upgrades', 'Featured', 'Workshop upgrades'
		]);
	});

	it('reads the two new Featured columns and the shifted Core/Workshop blocks', () => {
		expect(out.novaShop.filter((n) => n.item === 'Critical Amount')).toEqual([
			{ category: 'Featured', item: 'Critical Amount', level: 1, cost: 30 },
			{ category: 'Featured', item: 'Critical Amount', level: 2, cost: 90 },
			{ category: 'Featured', item: 'Critical Amount', level: 3, cost: 150 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Companion Slot')).toEqual([
			{ category: 'Featured', item: 'Companion Slot', level: 1, cost: 250 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Upgrade Chip Station')).toEqual([
			{ category: 'Featured', item: 'Upgrade Chip Station', level: 1, cost: 120 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Daily Crystals')).toEqual([
			{ category: 'Featured', item: 'Daily Crystals', level: 1, cost: 30 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Flawless Charm')).toEqual([
			{ category: 'Core upgrades', item: 'Flawless Charm', level: 1, cost: 500 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Crafting Speed')).toEqual([
			{ category: 'Workshop upgrades', item: 'Crafting Speed', level: 1, cost: 3 },
			{ category: 'Workshop upgrades', item: 'Crafting Speed', level: 2, cost: 18 },
			{ category: 'Workshop upgrades', item: 'Crafting Speed', level: 3, cost: 33 }
		]);
	});

	it('REGRESSION: never emits a structural header as an item', () => {
		// The pre-2026-08 positional parser read the DAILY CRYSTALS column as the Core level
		// column and the Core LEVEL header as an item — a silent success on wrong columns.
		expect(out.novaShop.some((n) => n.item === 'Level')).toBe(false);
		expect(out.novaShop.some((n) => n.item === 'Nova Crystal Cost')).toBe(false);
		expect(out.novaShop.every((n) => Number.isInteger(n.level) && n.level >= 1)).toBe(true);
		expect(out.novaShop.every((n) => Number.isInteger(n.cost) && n.cost >= 0)).toBe(true);
	});

	it('ladders stop at the first blank cost, not at the end of the level column', () => {
		expect(out.novaShop.filter((n) => n.item === 'Max Health')).toHaveLength(3);
		expect(out.novaShop).toHaveLength(19);
	});

	it('paint stages and rebirth meta come from their own anchors', () => {
		expect(out.novaPaintStages).toEqual([
			{ stage: 1, crystalCost: 30 }, { stage: 2, crystalCost: 120 }, { stage: 3, crystalCost: 400 }
		]);
		expect(out.rebirthMeta).toEqual([
			{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 },
			{ rebirth: 13, nova: 16, creditMult: 32, xpMult: 160 }
		]);
	});
});

describe('parseNovaShop — pre-shift geometry still parses (anchors, not positions)', () => {
	const out = parseNovaShop(PRE_SHIFT_CSV);
	it('finds the same items at completely different column indices', () => {
		expect(out.novaShop.filter((n) => n.item === 'Critical Chance')).toEqual([
			{ category: 'Featured', item: 'Critical Chance', level: 1, cost: 60 },
			{ category: 'Featured', item: 'Critical Chance', level: 2, cost: 90 },
			{ category: 'Featured', item: 'Critical Chance', level: 3, cost: 120 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Lounge Slot')).toHaveLength(3);
		expect(out.novaPaintStages).toHaveLength(3);
		expect(out.rebirthMeta).toEqual([{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 }]);
	});
});

describe('parseNovaShop — unknown geometry fails loudly', () => {
	it('throws when a section banner is missing', () => {
		const csv = NOVA_CSV.replace('NOVA SHOP - WORKSHOP UPGRADES', 'NOVA SHOP - WORKBENCH');
		expect(() => parseNovaShop(csv)).toThrow(/nova-shop header anchor failed.*WORKSHOP UPGRADES/);
	});
	it('throws when a section has no LEVEL column', () => {
		const csv = NOVA_CSV.split('\n');
		csv[3] = csv[3].replace(/^LEVEL,/, 'TIER,');
		expect(() => parseNovaShop(csv.join('\n'))).toThrow(/nova-shop header anchor failed/);
	});
	it('throws when the paint ladder header is gone', () => {
		const csv = NOVA_CSV.replace('NOVA CRYSTAL BASE PAINT', 'MYSTERY COLUMN');
		expect(() => parseNovaShop(csv)).toThrow(/nova-shop header anchor failed.*BASE PAINT/);
	});
	it('throws when the RB LEVEL block is gone', () => {
		// global: "RB LEVEL" also occurs inside the "NOVA CRYSTALS/RB LEVEL" caption above it
		const csv = NOVA_CSV.replace(/RB LEVEL/g, 'REBIRTH');
		expect(() => parseNovaShop(csv)).toThrow(/nova-shop header anchor failed.*RB LEVEL/);
	});
	it('throws when a section resolves to zero items', () => {
		const csv = NOVA_CSV.split('\n');
		// blank every Featured item header, leaving the banner and LEVEL in place
		csv[3] = csv[3].replace('CRITICAL CHANCE,CRITICAL AMOUNT,COMPANION SLOT,UPGRADE CHIP STATION,DAILY CRYSTALS', ',,,,');
		expect(() => parseNovaShop(csv.join('\n'))).toThrow(/nova-shop header anchor failed.*Featured/);
	});
});
```

- [ ] **Step 4: Run the test to watch it fail**

```bash
npm run test:int -- src/lib/server/sync/parsers/novaShop.test.ts
```

Expected: FAIL — the current positional parser returns wrong items and never throws.

- [ ] **Step 5: Rewrite the parser**

Replace the entire contents of `app/src/lib/server/sync/parsers/novaShop.ts` with:

```ts
import { toRows, cell } from '../csv';
import { unlockLabel } from '../normalize';
import type { NovaShopRow, RebirthMetaRow, PaintStageRow } from '../types';

// Every column index in this tab moved when the sheet added two Featured columns
// (2026-08 patch). Nothing here may be positional: sections are found by their banner
// text, item columns by the name row, and any layout we cannot resolve throws.
const LADDERS: { banner: string; category: string }[] = [
	{ banner: 'NOVA SHOP - FEATURED', category: 'Featured' },
	{ banner: 'NOVA SHOP - CORE UPGRADES', category: 'Core upgrades' },
	{ banner: 'NOVA SHOP - WORKSHOP UPGRADES', category: 'Workshop upgrades' }
];
const COSMETICS_BANNER = 'NOVA SHOP - COSMETICS';

function fail(what: string): never {
	throw new Error(`nova-shop header anchor failed: ${what}`);
}
const norm = (s: string) => s.trim().toUpperCase();

/** Row index of the banner row = the first row carrying any known section banner. */
function findBannerRow(r: string[][]): number {
	const wanted = new Set([...LADDERS.map((l) => l.banner), COSMETICS_BANNER]);
	for (let i = 0; i < r.length; i++) {
		if (r[i].some((c) => wanted.has(norm(c)))) return i;
	}
	return fail('no NOVA SHOP section banner found in any row');
}

/** Column of `banner` within the banner row. */
function anchorCol(bannerRow: string[], banner: string): number {
	const col = bannerRow.findIndex((c) => norm(c) === banner);
	return col >= 0 ? col : fail(`banner "${banner}" not found`);
}

/** Row index of the item-name header = first row after the banner with LEVEL under an anchor. */
function findHeaderRow(r: string[][], bannerRow: number, firstAnchor: number): number {
	for (let i = bannerRow + 1; i < r.length; i++) {
		if (norm(cell(r[i], firstAnchor)) === 'LEVEL') return i;
	}
	return fail('no LEVEL header row beneath the section banners');
}

/** First LEVEL column at or after `from`, bounded by `end`. */
function levelColFrom(header: string[], from: number, end: number, label: string): number {
	for (let c = from; c < end; c++) if (norm(cell(header, c)) === 'LEVEL') return c;
	return fail(`${label}: no LEVEL column between ${from} and ${end}`);
}

export function parseNovaShop(csv: string) {
	const r = toRows(csv);
	const bannerRow = findBannerRow(r);
	const banners = r[bannerRow];
	// every non-empty banner cell bounds the section to its left
	const boundaries = banners.map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
	const endOf = (anchor: number, width: number) =>
		boundaries.find((b) => b > anchor) ?? width;

	const firstAnchor = anchorCol(banners, LADDERS[0].banner);
	const headerRow = findHeaderRow(r, bannerRow, firstAnchor);
	const header = r[headerRow];

	const novaShop: NovaShopRow[] = [];
	for (const { banner, category } of LADDERS) {
		const anchor = anchorCol(banners, banner);
		const end = endOf(anchor, header.length);
		const levelCol = levelColFrom(header, anchor, end, category);
		const items: [number, string][] = [];
		for (let c = levelCol + 1; c < end; c++) {
			const name = cell(header, c).trim();
			if (name) items.push([c, unlockLabel(name)]); // sheet is ALL CAPS; DB uses "Max Health" style
		}
		if (!items.length) fail(`${category}: no item columns between ${levelCol + 1} and ${end}`);
		for (const [col, item] of items) {
			for (let i = headerRow + 1; i < r.length; i++) {
				const lvl = cell(r[i], levelCol).trim();
				const costRaw = cell(r[i], col).trim();
				if (!lvl || !costRaw) break; // ladder ends at the first blank level or cost
				novaShop.push({ category, item, level: parseInt(lvl, 10), cost: parseInt(costRaw.replace(/,/g, ''), 10) });
			}
		}
	}

	// Cosmetics block: a LEVEL column with the paint ladder immediately to its right.
	const cosAnchor = anchorCol(banners, COSMETICS_BANNER);
	const paintLevelCol = levelColFrom(header, cosAnchor, header.length, 'Cosmetics');
	const paintCol = paintLevelCol + 1;
	if (!/BASE PAINT/i.test(cell(header, paintCol))) {
		fail(`Cosmetics: expected a BASE PAINT column at ${paintCol}, found "${cell(header, paintCol)}"`);
	}
	const novaPaintStages: PaintStageRow[] = [];
	for (let i = headerRow + 1; i < r.length; i++) {
		const s = cell(r[i], paintLevelCol).trim();
		const c = cell(r[i], paintCol).trim();
		if (!s || !c) break;
		novaPaintStages.push({ stage: parseInt(s, 10), crystalCost: parseInt(c.replace(/,/g, ''), 10) });
	}
	if (!novaPaintStages.length) fail('Cosmetics: BASE PAINT ladder is empty');

	// Rebirth-meta block: anywhere in the sheet, located by its own RB LEVEL header.
	let rbRow = -1;
	let rbCol = -1;
	outer: for (let i = 0; i < r.length; i++) {
		for (let c = 0; c < r[i].length; c++) {
			if (norm(cell(r[i], c)) === 'RB LEVEL') { rbRow = i; rbCol = c; break outer; }
		}
	}
	if (rbRow < 0) fail('RB LEVEL block not found');
	for (const [offset, label] of [[1, 'CRYSTAL QUANTITY'], [2, 'CREDIT MULT'], [3, 'XP MULT']] as const) {
		if (norm(cell(r[rbRow], rbCol + offset)) !== label) {
			fail(`RB LEVEL block: expected "${label}" at column ${rbCol + offset}`);
		}
	}
	const rebirthMeta: RebirthMetaRow[] = [];
	for (let i = rbRow + 1; i < r.length; i++) {
		const m = /^RB\s+(\d+)$/i.exec(cell(r[i], rbCol).trim());
		if (!m) break;
		rebirthMeta.push({
			rebirth: parseInt(m[1], 10),
			nova: parseInt(cell(r[i], rbCol + 1).replace(/[^\d]/g, ''), 10),
			creditMult: parseInt(cell(r[i], rbCol + 2).replace(/%/g, ''), 10),
			xpMult: parseInt(cell(r[i], rbCol + 3).replace(/%/g, ''), 10)
		});
	}
	if (!rebirthMeta.length) fail('RB LEVEL block has no RB rows');

	return { novaShop, rebirthMeta, novaPaintStages };
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm run test:int -- src/lib/server/sync/parsers/novaShop.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 7: Verify against the real live export**

```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
import { parseNovaShop } from './src/lib/server/sync/parsers/novaShop';
const out = parseNovaShop(readFileSync('/Users/jason/.claude/jobs/657deff8/tmp/tab-1548395368.csv','utf8'));
console.log('novaShop', out.novaShop.length, 'paint', out.novaPaintStages.length, 'rbMeta', out.rebirthMeta.length);
console.log('RB30', JSON.stringify(out.rebirthMeta.at(-1)));
console.log('CraftSpeed L11', JSON.stringify(out.novaShop.find(n=>n.item==='Crafting Speed'&&n.level===11)));
console.log('CritChance L4', JSON.stringify(out.novaShop.find(n=>n.item==='Critical Chance'&&n.level===4)));
"
```

Expected exactly:
```
novaShop 175 paint 3 rbMeta 19
RB30 {"rebirth":30,"nova":254,"creditMult":508,"xpMult":2540}
CraftSpeed L11 {"category":"Workshop upgrades","item":"Crafting Speed","level":11,"cost":445}
CritChance L4 {"category":"Featured","item":"Critical Chance","level":4,"cost":150}
```
`445` is the sheet's own step-breaking value — ship it as-is (sheet authority).

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/sync/parsers/novaShop.ts src/lib/server/sync/parsers/novaShop.test.ts src/lib/server/sync/__fixtures__/tabs.ts
git commit -m "fix(sync): header-anchored nova shop parser

The positional parser silently mis-parsed the live tab after two Featured
columns shifted every section right, emitting garbage rows plus empty
paintStages/rebirthMeta. Sections are now located by banner text and items
by the name row; unresolvable geometry throws."
```

---

## Task A2 [opus]: Loud validation guards + droid-reference fixture repair

**Files:**
- Modify: `app/src/lib/server/sync/validate.ts`
- Modify: `app/src/lib/server/sync/validate.test.ts`
- Modify: `app/src/lib/server/sync/__fixtures__/tabs.ts` (the `DROID_CSV` export only)

**Interfaces:**
- Consumes: `PayloadTables`, `Flag { kind: 'reject'|'hold'|'report'; code: string; message: string; table?: string; key?: string }` from `./types`.
- Produces: `validate(t: PayloadTables, existingCountKeys): Flag[]` (unchanged signature) now emitting `empty_table`, `missing_shop_category`, `structural_item`, `bad_shop_level`, `bad_shop_cost` rejects. `rejectsOf(flags)` unchanged.

Note: this task adds guards only for tables that exist **today**. Task A4 extends the same `NEVER_EMPTY` list with the three crafting tables once they are on `PayloadTables`.

- [ ] **Step 1: Repair the droid-reference fixture's missing col-22 separator rows**

The right-stack blocks in the real sheet are separated by rows whose column 22 is blank; that blank is what terminates each block's row loop in `droidReference.ts`. The fixture omits them, so the chip-cost loop runs straight into the next block's label and manufactures junk rarities. Replace the whole `DROID_CSV` export in `app/src/lib/server/sync/__fixtures__/tabs.ts` with:

```ts
export const DROID_CSV = [
	row(34, { 3: 'banner', 22: 'banner' }),
	row(34, { 3: 'BASE', 6: 'GOLD', 9: 'DIAMOND', 12: 'RAINBOW', 15: 'BESKAR', 18: 'GALACTIC', 22: 'UPGRADE COSTS' }),
	row(34, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'COST', 4: 'INCOME', 5: 'VALUE', 22: 'RARITY', 23: 'BASE -> GOLD', 24: 'GOLD -> DIAMOND', 25: 'DIAMOND -> RAINBOW', 26: 'RAINBOW -> BESKAR', 27: 'BESKAR -> GALACTIC' }),
	row(34, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '950', 4: '2/s', 5: '665', 6: '3.8k', 7: '4/s', 8: '2.66k', 18: '19.00k', 19: '48/s', 22: 'COMMON', 23: '5', 24: '25', 25: '40', 26: '80', 27: '120' }),
	row(34, { 22: 'RARE', 23: '30', 24: '60', 25: '100', 26: '250', 27: '400' }),
	row(34, { 22: 'EPIC', 23: '120', 24: '180', 25: '240', 26: '3,000', 27: '6,000' }),
	row(34, { 22: 'LEGENDARY', 23: '400', 24: '1,200', 25: '3,000', 26: '7,500', 27: '20,000' }),
	row(34, { 22: 'MYTHIC', 23: '4,000', 24: '8,000', 25: '20,000', 26: '40,000', 27: '70,000' }),
	row(34, { 22: 'ICONIC', 23: 'N/A', 24: 'N/A', 25: 'N/A', 26: 'N/A', 27: 'N/A' }),
	row(34, {}),                          // separator: blank col 22 ends the UPGRADE COSTS block
	row(34, { 22: 'DROID SELL VALUE' }),
	row(34, { 1: 'R2-D2', 2: 'ASTROMECH', 3: 'N/A', 4: '25%/s', 22: 'RARITY', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row(34, { 22: 'COMMON', 23: '4', 24: '7', 25: '10', 26: '13', 27: '16' }),
	row(34, {}),                          // separator: ends the DROID SELL VALUE block
	row(34, { 22: 'FLAWLESS SPAWN PROBABILITY' }),
	row(34, { 22: 'DEFAULT', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row(34, { 22: '1/1000', 23: '1/500', 24: '1/250', 25: '1/125', 26: '1/100', 27: '1/75' })
].join('\n');
```

This also gives the fixture the live Mythic chip costs and the new Galactic flawless odds (`1/75`).

- [ ] **Step 2: Write the failing validation tests**

In `app/src/lib/server/sync/validate.test.ts`, first update `base()` so a clean payload is actually clean under the new guards — replace its `novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: []` line with:

```ts
			novaShop: [{ category: 'Featured', item: 'Critical Chance', level: 1, cost: 60 },
				{ category: 'Core upgrades', item: 'Max Health', level: 1, cost: 1 },
				{ category: 'Workshop upgrades', item: 'Lounge Slot', level: 1, cost: 1 }],
			cosmetics: [], droidSellValues: [], flawlessSpawn: [],
			novaPaintStages: [{ stage: 1, crystalCost: 30 }]
```

Then append these cases inside the existing `describe('validate', ...)` block:

```ts
	it('rejects an empty novaShop / rebirthMeta / novaPaintStages (silent geometry drift)', () => {
		for (const table of ['novaShop', 'rebirthMeta', 'novaPaintStages'] as const) {
			const t = base();
			(t[table] as unknown[]) = [];
			const rejects = rejectsOf(validate(t, []));
			expect(rejects.some((f) => f.code === 'empty_table' && f.table === table)).toBe(true);
		}
	});
	it('rejects a missing shop category', () => {
		const t = base();
		t.novaShop = t.novaShop.filter((n) => n.category !== 'Workshop upgrades');
		expect(rejectsOf(validate(t, [])).some((f) => f.code === 'missing_shop_category')).toBe(true);
	});
	it('rejects a structural header parsed as a shop item', () => {
		const t = base();
		t.novaShop.push({ category: 'Core upgrades', item: 'Level', level: 30, cost: 1 });
		expect(rejectsOf(validate(t, [])).some((f) => f.code === 'structural_item')).toBe(true);
	});
	it('rejects a non-positive shop level and a negative cost', () => {
		const t = base();
		t.novaShop.push({ category: 'Featured', item: 'Critical Chance', level: 0, cost: 5 });
		t.novaShop.push({ category: 'Featured', item: 'Critical Amount', level: 1, cost: -5 });
		const codes = rejectsOf(validate(t, [])).map((f) => f.code);
		expect(codes).toContain('bad_shop_level');
		expect(codes).toContain('bad_shop_cost');
	});
```

- [ ] **Step 3: Run the tests to watch them fail**

```bash
npm run test:int -- src/lib/server/sync/validate.test.ts
```

Expected: FAIL — the new cases find no such flags.

- [ ] **Step 4: Add the guards to `validate.ts`**

In `app/src/lib/server/sync/validate.ts`, add these constants just below `REQUIRED_CHIP_RARITIES`:

```ts
// Tables that are never legitimately empty. A geometry drift used to parse "successfully"
// into nothing (or into garbage) — an empty table is now a hard reject, not a quiet sync.
const NEVER_EMPTY = ['novaShop', 'rebirthMeta', 'novaPaintStages'] as const;
const SHOP_CATEGORIES = ['Featured', 'Core upgrades', 'Workshop upgrades'];
// 'Level' / 'Nova Crystal Cost' are structural headers; seeing one as an item name means the
// parser read a header column as a data column (the pre-2026-08 positional-parser failure).
const STRUCTURAL_ITEMS = new Set(['Level', 'Nova Crystal Cost']);
```

and insert this block immediately before the `// orphan report` comment near the end of `validate()`:

```ts
	for (const table of NEVER_EMPTY) {
		if (t[table].length === 0) {
			flags.push({ kind: 'reject', code: 'empty_table', message: `${table} parsed to zero rows — sheet geometry drift?`, table });
		}
	}
	const shopCats = new Set(t.novaShop.map((n) => n.category));
	if (t.novaShop.length) {
		for (const c of SHOP_CATEGORIES) {
			if (!shopCats.has(c)) flags.push({ kind: 'reject', code: 'missing_shop_category', message: `no rows for shop category "${c}"`, table: 'novaShop', key: c });
		}
	}
	for (const n of t.novaShop) {
		const key = `${n.category}/${n.item}/${n.level}`;
		if (STRUCTURAL_ITEMS.has(n.item)) flags.push({ kind: 'reject', code: 'structural_item', message: `"${n.item}" is a header, not a shop item — column misalignment`, table: 'novaShop', key });
		if (!Number.isInteger(n.level) || n.level < 1) flags.push({ kind: 'reject', code: 'bad_shop_level', message: `${key}: level must be a positive integer`, table: 'novaShop', key });
		if (!Number.isInteger(n.cost) || n.cost < 0) flags.push({ kind: 'reject', code: 'bad_shop_cost', message: `${key}: cost=${n.cost}`, table: 'novaShop', key });
	}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm run test:int -- src/lib/server/sync/validate.test.ts src/lib/server/sync/build.test.ts src/lib/server/sync/parsers/
```

Expected: PASS. `build.test.ts` still asserts a `rebirth_count` reject — that is by design (the fixture carries a partial rebirth set), do not "fix" it.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/sync/validate.ts src/lib/server/sync/validate.test.ts src/lib/server/sync/__fixtures__/tabs.ts
git commit -m "feat(sync): reject empty and structurally impossible reference tables

Empty novaShop/rebirthMeta/novaPaintStages, a missing shop category, or a
header parsed as an item now fail the ingest loudly. Also repairs the
droid-reference fixture's missing col-22 separator rows, which let the
chip-cost loop run into the next block."
```

---

## Task A3 [opus]: Crafting + companions parser

**Files:**
- Create: `app/src/lib/server/sync/parsers/craftingCompanions.ts`
- Create: `app/src/lib/server/sync/parsers/craftingCompanions.test.ts`
- Modify: `app/src/lib/server/sync/types.ts` (row interfaces only; `PayloadTables` is extended in A4)
- Modify: `app/src/lib/server/sync/__fixtures__/tabs.ts` (add `CRAFTING_CSV`)

**Interfaces:**
- Consumes: `toRows`, `cell` from `../csv`; `rarity(s): string` from `../normalize` (trims + Title-cases, so `"ICONIC "` → `Iconic`); `resolveDroid(name): string` from `../aliases` (`BB-8` → `BB8`); `TIERS`, `Tier` from `$lib/game/tiers`.
- Produces:
  - `hmsToSeconds(s: string): number | null` — `"1:52:48"` → `6768`; `""`/`"N/A"` → `null`; anything else throws.
  - `buffValue(s: string): number | null` — `"20%"` → `20`, `"+3"` → `3`, `"N/A"`/`""` → `null`; anything else throws.
  - `parseCraftingCompanions(csv: string): { craftingTimes: CraftingTimeRow[]; companionBuffs: CompanionBuffRow[]; iconicCompanionEffects: IconicCompanionEffectRow[] }`. Throws `Error` starting `crafting-companions header anchor failed:` on unresolvable geometry.
- New types in `../types`:
  ```ts
  export interface CraftingTimeRow { droid: string; tier: Tier; seconds: number | null; }
  export interface CompanionBuffRow { kind: string; rarity: string; tier: Tier; value: number | null; }
  export interface IconicCompanionEffectRow { droid: string; effect: string; }
  ```

- [ ] **Step 1: Add the row types**

In `app/src/lib/server/sync/types.ts`, add after the `PaintStageRow` line:

```ts
export interface CraftingTimeRow { droid: string; tier: Tier; seconds: number | null; }        // null = blank (unpublished) or Iconic N/A
export interface CompanionBuffRow { kind: string; rarity: string; tier: Tier; value: number | null; } // Worker=%, Astromech=+levels, Battle=+health
export interface IconicCompanionEffectRow { droid: string; effect: string; }                   // free text, verbatim
```

- [ ] **Step 2: Add the crafting fixture**

In `app/src/lib/server/sync/__fixtures__/tabs.ts`, add this export after `NOVA_CSV` (width 17; note `COMPAINION` and the trailing space in `'ICONIC '` are the sheet's, reproduced deliberately):

```ts
export const CRAFTING_CSV = [
	row(17, { 3: 'banner', 10: 'banner' }),
	row(17, { 3: 'CRAFTING TIME - NO BUFF', 10: 'WORKER COMPAINION DROIDS - CRAFTING SPEED BUFFS' }),
	row(17, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'BASIC', 4: 'GOLD', 5: 'DIAMOND', 6: 'RAINBOW', 7: 'BESKAR', 8: 'GALACTIC',
	          10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '0:00:33', 4: '0:02:14', 5: '0:03:54', 6: '0:05:35', 7: '0:04:28', 8: '0:08:22',
	          10: 'COMMON', 11: '20%', 12: '40%', 13: '60%', 14: '80%', 15: '100%', 16: '100%' }),
	row(17, { 1: 'HAUL-R', 2: 'BATTLE', 3: '0:08:23', 4: '0:33:35', 5: '0:58:46', 6: '1:23:58', 7: '1:07:10',
	          10: 'ICONIC', 11: 'N/A', 12: 'N/A', 13: 'N/A', 14: 'N/A', 15: 'N/A', 16: 'N/A' }),
	row(17, { 0: 'ICONIC ', 1: 'BB-8', 2: 'ASTROMECH', 3: 'N/A' }),
	row(17, { 10: 'ASTROMECH COMPAINION DROIDS - PICKAXE LEVEL BUFFS' }),
	row(17, { 10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 10: 'COMMON', 11: '+1', 12: '+2', 13: '+3', 14: '+4', 15: '+5', 16: '+6' }),
	row(17, {}),
	row(17, { 10: 'BATTLE COMPAINION DROIDS - MAX HEALTH BUFFS' }),
	row(17, { 10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 10: 'COMMON', 11: '+20', 12: '+60', 13: '+100', 14: '+140', 15: '+180', 16: '+220' }),
	row(17, {}),
	row(17, { 10: 'COMPAINION DROIDS - ICONIC DROIDS' }),
	row(17, { 10: 'DROID', 11: 'BASIC' }),
	row(17, { 10: 'BB-8', 11: '100% UPGRADE CHIPS' }),
	row(17, { 10: 'CHOPPER', 11: '+50% CRIT CHANCE & DAMAGE' })
].join('\n');
```

and extend the gid map at the bottom of the file:

```ts
export const CSV_BY_GID = { '1248391507': DROID_CSV, '0': REBIRTH_CSV, '547464940': COSMETIC_CSV, '1548395368': NOVA_CSV, '1131770079': CRAFTING_CSV };
```

- [ ] **Step 3: Write the failing test file**

Create `app/src/lib/server/sync/parsers/craftingCompanions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCraftingCompanions, hmsToSeconds, buffValue } from './craftingCompanions';
import { CRAFTING_CSV } from '../__fixtures__/tabs';

describe('hmsToSeconds', () => {
	it('converts H:MM:SS', () => {
		expect(hmsToSeconds('0:00:33')).toBe(33);
		expect(hmsToSeconds('1:52:48')).toBe(6768);
		expect(hmsToSeconds('29:55:00')).toBe(107700);
	});
	it('maps blanks and N/A to null', () => {
		expect(hmsToSeconds('')).toBeNull();
		expect(hmsToSeconds('   ')).toBeNull();
		expect(hmsToSeconds('N/A')).toBeNull();
	});
	it('throws on anything else', () => {
		expect(() => hmsToSeconds('1:2:3')).toThrow(/unparseable craft duration/);
		expect(() => hmsToSeconds('90m')).toThrow(/unparseable craft duration/);
	});
});

describe('buffValue', () => {
	it('reads percentages and plus-prefixed integers', () => {
		expect(buffValue('20%')).toBe(20);
		expect(buffValue('+3')).toBe(3);
		expect(buffValue('+220')).toBe(220);
	});
	it('maps N/A and blanks to null', () => {
		expect(buffValue('N/A')).toBeNull();
		expect(buffValue('')).toBeNull();
	});
	it('throws on anything else', () => {
		expect(() => buffValue('lots')).toThrow(/unparseable companion buff/);
	});
});

describe('parseCraftingCompanions', () => {
	const out = parseCraftingCompanions(CRAFTING_CSV);

	it('emits one row per droid per tier, nulling blanks and Iconic N/A', () => {
		expect(out.craftingTimes).toHaveLength(18); // 3 droids x 6 tiers
		expect(out.craftingTimes.filter((c) => c.droid === 'MOUSE')).toEqual([
			{ droid: 'MOUSE', tier: 'Base', seconds: 33 },
			{ droid: 'MOUSE', tier: 'Gold', seconds: 134 },
			{ droid: 'MOUSE', tier: 'Diamond', seconds: 234 },
			{ droid: 'MOUSE', tier: 'Rainbow', seconds: 335 },
			{ droid: 'MOUSE', tier: 'Beskar', seconds: 268 },
			{ droid: 'MOUSE', tier: 'Galactic', seconds: 502 }
		]);
		// HAUL-R's Galactic cell is blank in the sheet — unpublished, not zero
		expect(out.craftingTimes.find((c) => c.droid === 'HAUL-R' && c.tier === 'Galactic')).toEqual(
			{ droid: 'HAUL-R', tier: 'Galactic', seconds: null }
		);
		// Iconic rows are N/A across the board and resolve through the BB-8 -> BB8 alias
		expect(out.craftingTimes.filter((c) => c.droid === 'BB8').every((c) => c.seconds === null)).toBe(true);
	});

	it('parses the three COMPAINION buff blocks with their own units', () => {
		// Worker block has 2 rarity rows (Common, Iconic), Astromech and Battle 1 each: 4 x 6 tiers
		expect(out.companionBuffs).toHaveLength(24);
		expect(out.companionBuffs.filter((b) => b.kind === 'Worker' && b.rarity === 'Common')).toEqual([
			{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Gold', value: 40 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Diamond', value: 60 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Rainbow', value: 80 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Beskar', value: 100 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Galactic', value: 100 }
		]);
		expect(out.companionBuffs.filter((b) => b.kind === 'Worker' && b.rarity === 'Iconic').every((b) => b.value === null)).toBe(true);
		expect(out.companionBuffs.find((b) => b.kind === 'Astromech' && b.rarity === 'Common' && b.tier === 'Galactic')).toEqual(
			{ kind: 'Astromech', rarity: 'Common', tier: 'Galactic', value: 6 }
		);
		expect(out.companionBuffs.find((b) => b.kind === 'Battle' && b.rarity === 'Common' && b.tier === 'Beskar')).toEqual(
			{ kind: 'Battle', rarity: 'Common', tier: 'Beskar', value: 180 }
		);
	});

	it('reads iconic companion effects as free text, aliased to DB droid names', () => {
		expect(out.iconicCompanionEffects).toEqual([
			{ droid: 'BB8', effect: '100% UPGRADE CHIPS' },
			{ droid: 'CHOPPER', effect: '+50% CRIT CHANCE & DAMAGE' }
		]);
	});

	it('tolerates the sheet\'s "ICONIC " trailing space in the rarity column', () => {
		expect(out.craftingTimes.some((c) => c.droid === 'BB8')).toBe(true);
	});

	it('fails loudly when the left grid header is gone', () => {
		const csv = CRAFTING_CSV.replace('RARITY,DROID,TYPE', 'RARITY,NAME,TYPE');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed/);
	});
	it('fails loudly when a tier column is missing from the left grid', () => {
		const csv = CRAFTING_CSV.replace('BASIC,GOLD,DIAMOND,RAINBOW,BESKAR,GALACTIC,,RARITY', 'BASIC,GOLD,DIAMOND,RAINBOW,BESKAR,,,RARITY');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed.*GALACTIC/);
	});
	it('fails loudly when a COMPAINION buff block disappears', () => {
		const csv = CRAFTING_CSV.replace('BATTLE COMPAINION DROIDS - MAX HEALTH BUFFS', 'BATTLE DROID NOTES');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed.*Battle/);
	});
	it('fails loudly when the iconic effects block disappears', () => {
		const csv = CRAFTING_CSV.replace('COMPAINION DROIDS - ICONIC DROIDS', 'ICONIC NOTES');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed.*ICONIC/);
	});
});
```

- [ ] **Step 4: Run the test to watch it fail**

```bash
npm run test:int -- src/lib/server/sync/parsers/craftingCompanions.test.ts
```

Expected: FAIL — `Cannot find module './craftingCompanions'`.

- [ ] **Step 5: Write the parser**

Create `app/src/lib/server/sync/parsers/craftingCompanions.ts`:

```ts
import { toRows, cell } from '../csv';
import { rarity as normRarity } from '../normalize';
import { resolveDroid } from '../aliases';
import { TIERS, type Tier } from '$lib/game/tiers';
import type { CraftingTimeRow, CompanionBuffRow, IconicCompanionEffectRow } from '../types';

// This tab spells the tiers BASIC..GALACTIC and misspells "COMPANION" as "COMPAINION" in all
// four block headers; the ICONIC rarity label carries a trailing space. All three are the
// sheet's own text — matched here, never corrected (sheet authority).
const TIER_WORD: Record<Tier, string> = {
	Base: 'BASIC', Gold: 'GOLD', Diamond: 'DIAMOND', Rainbow: 'RAINBOW', Beskar: 'BESKAR', Galactic: 'GALACTIC'
};
const BUFF_BLOCKS: { re: RegExp; kind: string }[] = [
	{ re: /^WORKER COMPAINION DROIDS\b/i, kind: 'Worker' },
	{ re: /^ASTROMECH COMPAINION DROIDS\b/i, kind: 'Astromech' },
	{ re: /^BATTLE COMPAINION DROIDS\b/i, kind: 'Battle' }
];
const ICONIC_BLOCK = /^COMPAINION DROIDS - ICONIC DROIDS\b/i;

function fail(what: string): never {
	throw new Error(`crafting-companions header anchor failed: ${what}`);
}
const norm = (s: string) => s.trim().toUpperCase();

export function hmsToSeconds(s: string): number | null {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return null;   // blank = unpublished, N/A = Iconic
	const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(t);
	if (!m) throw new Error(`unparseable craft duration: ${s}`);
	return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

export function buffValue(s: string): number | null {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return null;
	const m = /^\+?(\d+)%?$/.exec(t);
	if (!m) throw new Error(`unparseable companion buff: ${s}`);
	return parseInt(m[1], 10);
}

/** Column of the right-hand stack's label cells, found by whichever buff block appears first. */
function findLabelCol(r: string[][]): number {
	for (const row of r) {
		for (let c = 0; c < row.length; c++) {
			if (BUFF_BLOCKS.some((b) => b.re.test(row[c].trim()))) return c;
		}
	}
	return fail('no COMPAINION buff block found in any column');
}

/** Map Tier -> column. The six tier headers must sit contiguously at `from`..`from+5`.
 *  A loose "first column with this word" search would happily match the *other* grid's
 *  tier header when one column goes missing, which is exactly the silent mis-parse this
 *  tab's rewrite exists to prevent. */
function tierCols(header: string[], from: number, label: string): Record<Tier, number> {
	const out = {} as Record<Tier, number>;
	TIERS.forEach((tier, i) => {
		const col = from + i;
		if (norm(cell(header, col)) !== TIER_WORD[tier]) {
			fail(`${label}: expected tier column ${TIER_WORD[tier]} at ${col}, found "${cell(header, col)}"`);
		}
		out[tier] = col;
	});
	return out;
}

export function parseCraftingCompanions(csv: string) {
	const r = toRows(csv);

	// ---- left grid: per-droid craft durations ----
	const gridHeader = r.findIndex(
		(row) => norm(cell(row, 0)) === 'RARITY' && norm(cell(row, 1)) === 'DROID' && norm(cell(row, 2)) === 'TYPE'
	);
	if (gridHeader < 0) fail('left grid RARITY,DROID,TYPE header row not found');
	const gridCols = tierCols(r[gridHeader], 3, 'craft grid');

	const craftingTimes: CraftingTimeRow[] = [];
	for (let i = gridHeader + 1; i < r.length; i++) {
		const name = resolveDroid(cell(r[i], 1).trim());   // BB-8 -> BB8
		if (!name) continue;                                // separator / right-stack-only row
		for (const tier of TIERS) {
			craftingTimes.push({ droid: name, tier, seconds: hmsToSeconds(cell(r[i], gridCols[tier])) });
		}
	}
	if (!craftingTimes.length) fail('craft grid produced no rows');

	// ---- right stack: three buff tables + the iconic-effects table ----
	const labelCol = findLabelCol(r);
	const label = (i: number) => cell(r[i] ?? [], labelCol).trim();

	const companionBuffs: CompanionBuffRow[] = [];
	for (const { re, kind } of BUFF_BLOCKS) {
		const head = r.findIndex((row) => re.test(cell(row, labelCol).trim()));
		if (head < 0) fail(`${kind} buff block header not found`);
		const hdr = head + 1;
		if (norm(label(hdr)) !== 'RARITY') fail(`${kind} buff block: expected a RARITY header at row ${hdr}`);
		const cols = tierCols(r[hdr], labelCol + 1, `${kind} buffs`);
		let rows = 0;
		for (let i = hdr + 1; i < r.length && label(i); i++) {
			const rar = normRarity(label(i));            // trims "ICONIC " -> "Iconic"
			for (const tier of TIERS) {
				companionBuffs.push({ kind, rarity: rar, tier, value: buffValue(cell(r[i], cols[tier])) });
			}
			rows++;
		}
		if (!rows) fail(`${kind} buff block has no rarity rows`);
	}

	const iconicHead = r.findIndex((row) => ICONIC_BLOCK.test(cell(row, labelCol).trim()));
	if (iconicHead < 0) fail('COMPAINION DROIDS - ICONIC DROIDS block not found');
	const iconicHdr = iconicHead + 1;
	if (norm(label(iconicHdr)) !== 'DROID') fail(`iconic effects block: expected a DROID header at row ${iconicHdr}`);
	const iconicCompanionEffects: IconicCompanionEffectRow[] = [];
	for (let i = iconicHdr + 1; i < r.length && label(i); i++) {
		iconicCompanionEffects.push({ droid: resolveDroid(label(i)), effect: cell(r[i], labelCol + 1).trim() });
	}
	if (!iconicCompanionEffects.length) fail('iconic effects block has no droid rows');

	return { craftingTimes, companionBuffs, iconicCompanionEffects };
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm run test:int -- src/lib/server/sync/parsers/craftingCompanions.test.ts
```

Expected: PASS.

- [ ] **Step 7: Verify against the real live export**

```bash
npx tsx -e "
import { readFileSync } from 'node:fs';
import { parseCraftingCompanions } from './src/lib/server/sync/parsers/craftingCompanions';
const o = parseCraftingCompanions(readFileSync('/Users/jason/.claude/jobs/657deff8/tmp/tab-1131770079.csv','utf8'));
console.log('craftingTimes', o.craftingTimes.length, 'nulls', o.craftingTimes.filter(c=>c.seconds===null).length);
console.log('companionBuffs', o.companionBuffs.length, 'nulls', o.companionBuffs.filter(b=>b.value===null).length);
console.log('iconicEffects', o.iconicCompanionEffects.length, JSON.stringify(o.iconicCompanionEffects.at(-1)));
console.log('droids', new Set(o.craftingTimes.map(c=>c.droid)).size);
console.log('B1 HEAVY Galactic', JSON.stringify(o.craftingTimes.find(c=>c.droid==='B1 HEAVY'&&c.tier==='Galactic')));
"
```

Expected exactly:
```
craftingTimes 420 nulls 53
companionBuffs 108 nulls 18
iconicEffects 8 {"droid":"CHOPPER","effect":"+50% CRIT CHANCE & DAMAGE"}
droids 70
B1 HEAVY Galactic {"droid":"B1 HEAVY","tier":"Galactic","seconds":13086}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/sync/parsers/craftingCompanions.ts src/lib/server/sync/parsers/craftingCompanions.test.ts src/lib/server/sync/types.ts src/lib/server/sync/__fixtures__/tabs.ts
git commit -m "feat(sync): parse the Droid Crafting Times + Companion Buffs tab

Header-anchored: craft durations (H:MM:SS -> seconds, blanks and Iconic N/A
-> null), three companion-buff tables, and the iconic companion effects.
Tolerates the sheet's COMPAINION headers and trailing-space ICONIC label."
```

---

## Task A4 [opus]: Wire the three new tables through the payload pipeline

**Files:**
- Modify: `app/src/lib/server/sync/fetch.ts` (+ check `fetch.test.ts` expectations)
- Modify: `app/src/lib/server/sync/types.ts` (`PayloadTables`)
- Modify: `app/src/lib/server/sync/build.ts`, `app/src/lib/server/sync/build.test.ts`
- Modify: `app/src/lib/server/sync/canonical.js`, `app/src/lib/server/sync/diff.ts`, `app/src/lib/server/sync/diff.test.ts`
- Modify: `app/src/lib/server/sync/validate.ts`, `app/src/lib/server/sync/validate.test.ts`
- Modify: `app/src/lib/server/sync/__fixtures__/tabs.ts` (`validTables()`)
- Modify: `app/src/lib/server/services/sync.ts` (`EMPTY_TABLES` only; write paths land in A6)

**Interfaces:**
- Consumes: `parseCraftingCompanions` from A3, `parseNovaShop` from A1.
- Produces: `PayloadTables` gains `craftingTimes: CraftingTimeRow[]`, `companionBuffs: CompanionBuffRow[]`, `iconicCompanionEffects: IconicCompanionEffectRow[]`. Canonical/diff primary keys: `craftingTimes: ['droid','tier']`, `companionBuffs: ['kind','rarity','tier']`, `iconicCompanionEffects: ['droid']`. `buildPayload` signature is unchanged.

- [ ] **Step 1: Add the crafting gid to the fetch list**

In `app/src/lib/server/sync/fetch.ts`:

```ts
// Inventory Manager (200719463) and Contact Info are deliberately excluded — player-facing
// calculators with formulas and #VALUE! cells, not reference data.
export const GIDS = ['1248391507', '0', '547464940', '1548395368', '1131770079'] as const;
```

Then check `fetch.test.ts` for a hardcoded tab count or gid list and update it to five gids if present:

```bash
grep -n "GIDS\|1548395368\|toHaveLength" src/lib/server/sync/fetch.test.ts
```

- [ ] **Step 2: Extend `PayloadTables`**

In `app/src/lib/server/sync/types.ts`, add to the `PayloadTables` interface:

```ts
	craftingTimes: CraftingTimeRow[];
	companionBuffs: CompanionBuffRow[];
	iconicCompanionEffects: IconicCompanionEffectRow[];
```

- [ ] **Step 3: Run the type check to enumerate every construction site**

```bash
npm run check
```

Expected: FAIL, with errors at `build.ts`, `services/sync.ts` (`EMPTY_TABLES`), `__fixtures__/tabs.ts` (`validTables`), `diff.test.ts`, `validate.test.ts`. That error list is your worklist for the next steps.

- [ ] **Step 4: Wire `build.ts`**

In `app/src/lib/server/sync/build.ts`, add the import and parse call, extend `tables`, and add the cross-table roster checks:

```ts
import { parseCraftingCompanions } from './parsers/craftingCompanions';
```

```ts
	const cf = parseCraftingCompanions(csvByGid['1131770079']);

	const tables: PayloadTables = {
		droids: dr.droids, droidTiers: dr.droidTiers, chipCosts: dr.chipCosts,
		droidSellValues: dr.droidSellValues, flawlessSpawn: dr.flawlessSpawn,
		rebirthReqs: rb.rebirthReqs, cosmetics: cos.cosmetics,
		novaShop: nv.novaShop, rebirthMeta: nv.rebirthMeta, novaPaintStages: nv.novaPaintStages,
		craftingTimes: cf.craftingTimes, companionBuffs: cf.companionBuffs,
		iconicCompanionEffects: cf.iconicCompanionEffects
	};
```

and immediately after the existing `rebirthReqs` roster loop:

```ts
	// same no-FK reasoning as droidTiers: an unparsed/renamed droid would land as dead rows
	for (const c of tables.craftingTimes) {
		if (!roster.has(c.droid)) {
			flags.push({ kind: 'hold', code: 'unknown_droid', message: `craft time for "${c.droid}" (${c.tier}) has no roster entry`, table: 'craftingTimes', key: `${c.droid}/${c.tier}` });
		}
	}
	for (const e of tables.iconicCompanionEffects) {
		if (!roster.has(e.droid)) {
			flags.push({ kind: 'hold', code: 'unknown_droid', message: `iconic companion effect for "${e.droid}" has no roster entry`, table: 'iconicCompanionEffects', key: e.droid });
		}
	}
```

- [ ] **Step 5: Add the primary keys to `canonical.js` and `diff.ts`**

`canonical.js` — extend the `PK` map (`serialize` throws for any table without one, so this is load-bearing):

```js
	novaPaintStages: ['stage'],
	craftingTimes: ['droid', 'tier'],
	companionBuffs: ['kind', 'rarity', 'tier'],
	iconicCompanionEffects: ['droid']
```

`diff.ts` — extend its `PK` map identically:

```ts
	cosmetics: ['category', 'name'], droidSellValues: ['rarity', 'tier'], flawlessSpawn: ['tier'], novaPaintStages: ['stage'],
	craftingTimes: ['droid', 'tier'], companionBuffs: ['kind', 'rarity', 'tier'], iconicCompanionEffects: ['droid']
```

- [ ] **Step 6: Extend the never-empty guard**

In `app/src/lib/server/sync/validate.ts`:

```ts
const NEVER_EMPTY = ['novaShop', 'rebirthMeta', 'novaPaintStages', 'craftingTimes', 'companionBuffs', 'iconicCompanionEffects'] as const;
```

and add, right after the nova item loop:

```ts
	for (const c of t.craftingTimes) {
		if (c.seconds !== null && (!Number.isInteger(c.seconds) || c.seconds <= 0)) {
			flags.push({ kind: 'reject', code: 'bad_craft_time', message: `${c.droid}/${c.tier}: seconds=${c.seconds}`, table: 'craftingTimes', key: `${c.droid}/${c.tier}` });
		}
	}
```

- [ ] **Step 7: Fix the three fixture/test construction sites**

`app/src/lib/server/sync/__fixtures__/tabs.ts` — in `validTables()`, replace the `novaShop: []` fragment of the return object with:

```ts
		novaShop: [{ category: 'Featured', item: 'Critical Chance', level: 1, cost: 60 },
			{ category: 'Core upgrades', item: 'Max Health', level: 1, cost: 1 },
			{ category: 'Workshop upgrades', item: 'Lounge Slot', level: 1, cost: 1 }],
		cosmetics: [{ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' }],
		droidSellValues: [{ rarity: 'Common', tier: 'Gold', multiplier: 4 }],
		flawlessSpawn: [{ tier: 'Base', oneIn: 1000 }], novaPaintStages: [{ stage: 1, crystalCost: 30 }],
		craftingTimes: [{ droid: 'MOUSE', tier: 'Base', seconds: 33 }],
		companionBuffs: [{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 }],
		iconicCompanionEffects: [{ droid: 'BB8', effect: '100% UPGRADE CHIPS' }]
```

(Delete the old `cosmetics`/`droidSellValues`/`flawlessSpawn`/`novaPaintStages` lines it replaces — the rows above are the same values.)

`app/src/lib/server/sync/diff.test.ts` — extend the `empty` literal:

```ts
const empty: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [], craftingTimes: [], companionBuffs: [], iconicCompanionEffects: [] };
```

`app/src/lib/server/sync/validate.test.ts` — extend `base()`'s return. Task A2 left it ending with `novaPaintStages: [{ stage: 1, crystalCost: 30 }]`; add a comma there and append:

```ts
			novaPaintStages: [{ stage: 1, crystalCost: 30 }],
			craftingTimes: [{ droid: 'IG', tier: 'Base', seconds: 6200 }],
			companionBuffs: [{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 }],
			iconicCompanionEffects: [{ droid: 'BB8', effect: '100% UPGRADE CHIPS' }]
```

`app/src/lib/server/services/sync.ts` — extend `EMPTY_TABLES`:

```ts
const EMPTY_TABLES: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [], craftingTimes: [], companionBuffs: [], iconicCompanionEffects: [] };
```

- [ ] **Step 8: Update `build.test.ts` for the fifth tab**

```ts
		expect(Object.keys(a.payload.meta.tabChecksums).sort()).toEqual(['0', '1131770079', '1248391507', '1548395368', '547464940']);
		expect(a.payload.meta.rowCounts.craftingTimes).toBeGreaterThan(0);
		expect(a.payload.meta.rowCounts.companionBuffs).toBeGreaterThan(0);
```

- [ ] **Step 9: Run the type check and the sync suites**

```bash
npm run check && npm run test:int -- src/lib/server/sync
```

Expected: `check` clean; all sync tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/sync src/lib/server/services/sync.ts
git commit -m "feat(sync): carry crafting times, companion buffs and iconic effects in the payload

Adds gid 1131770079 to the fetch set, the three tables to PayloadTables,
their canonical/diff primary keys, roster holds for unknown droids, and
never-empty rejects."
```

---

## Task A5 [opus]: Migration 0004 + schema

**Files:**
- Modify: `app/src/lib/server/schema.ts`
- Create (generated): `app/drizzle/migrations/0004_*.sql`, `app/drizzle/migrations/meta/0004_snapshot.json`, journal entry
- Modify: `app/src/lib/server/testing/db.ts`

**Interfaces:**
- Produces drizzle tables `craftingTimes`, `companionBuffs`, `iconicCompanionEffects` (reference zone) and `flawlessOwned` (user zone). `flawlessOwned` uses **row presence as the boolean** — a row means "owned" — mirroring the existing `plans` table. (The spec says "boolean"; presence carries the same information without a redundant `owned=false` state. PR B's endpoint deletes the row for `owned: false`.)
- `flawless_owned` must **not** be added to `REF_TABLES` in `services/sync.ts` — it is user data and must survive every sync apply.

- [ ] **Step 1: Add the tables to the schema**

In `app/src/lib/server/schema.ts`, append to the reference-zone section (after `novaPaintStages`):

```ts
export const craftingTimes = pgTable('crafting_times', {
	droid: text('droid').notNull(),
	tier: text('tier').notNull(),
	seconds: integer('seconds')             // null = blank in the sheet (unpublished) or Iconic N/A
}, (t) => [primaryKey({ columns: [t.droid, t.tier] })]);

export const companionBuffs = pgTable('companion_buffs', {
	kind: text('kind').notNull(),           // Worker | Astromech | Battle (matches droids.type casing)
	rarity: text('rarity').notNull(),
	tier: text('tier').notNull(),
	value: integer('value')                 // Worker = crafting-speed %, Astromech = +pickaxe levels, Battle = +max health; null = Iconic N/A
}, (t) => [primaryKey({ columns: [t.kind, t.rarity, t.tier] })]);

export const iconicCompanionEffects = pgTable('iconic_companion_effects', {
	droid: text('droid').primaryKey(),
	effect: text('effect').notNull()        // free text, verbatim from the sheet
});
```

and to the user zone (after `plans`):

```ts
// Flawless ownership is an axis, not a tier: row presence = owned (same idiom as `plans`),
// no cycle axis, eligible for non-Iconic droids only. Never truncated by a sync apply.
export const flawlessOwned = pgTable('flawless_owned', {
	profileId: integer('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
	droid: text('droid').notNull()
}, (t) => [primaryKey({ columns: [t.profileId, t.droid] })]);
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
ls drizzle/migrations
```

Expected: a new `0004_<adjective>_<noun>.sql` plus `meta/0004_snapshot.json` and a fourth journal entry. Record the generated name — later steps refer to it as `0004_*`. Do **not** hand-write the SQL; the meta snapshot must stay in sync.

- [ ] **Step 3: Verify the generated SQL is exactly the four new tables**

```bash
cat drizzle/migrations/0004_*.sql
```

Expected content (order may vary): `CREATE TABLE "companion_buffs"` (kind/rarity/tier text NOT NULL, value integer, composite PK), `CREATE TABLE "crafting_times"` (droid/tier text NOT NULL, seconds integer, composite PK), `CREATE TABLE "flawless_owned"` (profile_id integer NOT NULL, droid text NOT NULL, composite PK, plus an `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade`), `CREATE TABLE "iconic_companion_effects"` (droid text PRIMARY KEY, effect text NOT NULL). If it contains any `DROP`, `ALTER COLUMN`, or a change to an existing table, **stop** — the schema file drifted from `0003` and that must be understood before proceeding.

- [ ] **Step 4: Apply it to both databases**

```bash
node drizzle/migrate.mjs
DATABASE_URL=postgres://dtt:dtt@localhost:5432/dtt_test node drizzle/migrate.mjs
```

Expected: no errors. (The integration suite migrates `dtt_test` itself via `testing/db.ts`, but applying it up front makes the next step's failure unambiguous.)

- [ ] **Step 5: Extend the test seed helpers**

In `app/src/lib/server/testing/db.ts`:

```ts
export async function resetUserZone(sql: postgres.Sql) {
	await sql`truncate users, sessions, profiles, counts, plans, flawless_owned restart identity cascade`;
}
```

and in `seedMinimalReference`, extend the truncate list and add rows for the new tables:

```ts
	await sql`truncate droids, droid_tiers, rebirth_reqs, chip_costs, rebirth_meta, nova_shop, cosmetics, droid_sell_values, flawless_spawn, nova_paint_stages, crafting_times, companion_buffs, iconic_companion_effects, sync_previews, data_versions restart identity cascade`;
```

```ts
	await sql`insert into crafting_times (droid, tier, seconds) values
		('MOUSE','Base',33), ('MOUSE','Gold',134), ('CB','Base',35), ('CB','Galactic',null)`;
	await sql`insert into companion_buffs (kind, rarity, tier, value) values
		('Worker','Common','Base',20), ('Astromech','Common','Base',1),
		('Battle','Common','Base',20), ('Worker','Iconic','Base',null)`;
	await sql`insert into iconic_companion_effects (droid, effect) values
		('R2-D2','2x ASSIGNED ASTROMECH MISSION REWARD'), ('CB-23','SECRET ASTROMECH MISSION')`;
```

(Insert these before the `data_versions` insert so the fixture version row stays last.)

- [ ] **Step 6: Run the integration suite**

```bash
npm run test:int
```

Expected: PASS (126 tests still green; the new tables exist but nothing reads them yet).

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/schema.ts src/lib/server/testing/db.ts drizzle/migrations
git commit -m "feat(db): migration 0004 — crafting times, companion buffs, iconic effects, flawless ownership

One migration for the whole patch update so PRs B and C stay migration-free.
flawless_owned is user data (row presence = owned) and is never truncated by
a sync apply."
```

---

## Task A6 [sonnet]: Sync apply, seed and backfill write paths

**Files:**
- Modify: `app/src/lib/server/services/sync.ts`
- Modify: `app/drizzle/seed.mjs`
- Modify: `app/drizzle/backfill-payload.mjs`
- Modify: `app/src/lib/server/services/sync.integration.test.ts`

**Interfaces:**
- Consumes: `PayloadTables` (A4), the drizzle tables (A5), `validTables()` / `validBuilt()` from `__fixtures__/tabs.ts`.
- Produces: `applyPayload` writes `crafting_times`, `companion_buffs`, `iconic_companion_effects`; `REF_TABLES` (the truncate list) includes those three and **excludes** `flawless_owned`.

- [ ] **Step 1: Write the failing integration assertion**

In `app/src/lib/server/services/sync.integration.test.ts`, find the test that stages and applies `validBuilt()` (search for `applyPayload`) and add, after its existing assertions:

```ts
		const craft = await sql`select droid, tier, seconds from crafting_times order by droid, tier`;
		expect(craft).toEqual([{ droid: 'MOUSE', tier: 'Base', seconds: 33 }]);
		const buffs = await sql`select kind, rarity, tier, value from companion_buffs`;
		expect(buffs).toEqual([{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 }]);
		const effects = await sql`select droid, effect from iconic_companion_effects`;
		expect(effects).toEqual([{ droid: 'BB8', effect: '100% UPGRADE CHIPS' }]);
```

Add one more test to the same file proving user data survives a sync:

```ts
	it('a sync apply does not touch flawless ownership (user zone)', async () => {
		const uid = (await createTestUser(db, 'flawless-survivor')).id;
		const pid = (await createProfile(db, uid, { name: 'main' })).id;
		await sql`insert into flawless_owned (profile_id, droid) values (${pid}, 'MOUSE')`;
		const built = validBuilt();
		const staged = await stagePayload(sql, built);
		await applyPayload(sql, { baseVersionId: staged.baseVersionId, payloadChecksum: staged.payloadChecksum, acknowledgedHolds: [] });
		const rows = await sql`select droid from flawless_owned where profile_id = ${pid}`;
		expect(rows).toEqual([{ droid: 'MOUSE' }]);
	});
```

Match the file's existing imports and setup helpers (`createTestUser`, `createProfile`, `stagePayload`, `applyPayload`, `validBuilt`); add any that are missing to the import list.

- [ ] **Step 2: Run it to watch it fail**

```bash
npm run test:int -- src/lib/server/services/sync.integration.test.ts
```

Expected: FAIL — `relation "crafting_times"` is empty / rows not written.

- [ ] **Step 3: Extend the apply path**

In `app/src/lib/server/services/sync.ts`:

```ts
// flawless_owned is deliberately absent: it is user data, not reference data, and must
// survive every apply.
const REF_TABLES = ['droids', 'droid_tiers', 'rebirth_reqs', 'chip_costs', 'rebirth_meta', 'nova_shop', 'cosmetics', 'droid_sell_values', 'flawless_spawn', 'nova_paint_stages', 'crafting_times', 'companion_buffs', 'iconic_companion_effects'];
```

and after the `nova_paint_stages` insert inside the transaction:

```ts
		await insertRows(tx, 'crafting_times', t.craftingTimes);
		await insertRows(tx, 'companion_buffs', t.companionBuffs);
		await insertRows(tx, 'iconic_companion_effects', t.iconicCompanionEffects);
```

- [ ] **Step 4: Extend the seeder**

In `app/drizzle/seed.mjs`, add to the truncate list and the insert loops:

```js
	await tx`truncate droids, droid_tiers, rebirth_reqs, chip_costs, rebirth_meta, nova_shop, cosmetics, droid_sell_values, flawless_spawn, nova_paint_stages, crafting_times, companion_buffs, iconic_companion_effects`;
```

```js
	for (const r of d.craftingTimes ?? [])
		await tx`insert into crafting_times ${tx({ droid: r.droid, tier: r.tier, seconds: r.seconds })}`;
	for (const r of d.companionBuffs ?? [])
		await tx`insert into companion_buffs ${tx({ kind: r.kind, rarity: r.rarity, tier: r.tier, value: r.value })}`;
	for (const r of d.iconicCompanionEffects ?? [])
		await tx`insert into iconic_companion_effects ${tx({ droid: r.droid, effect: r.effect })}`;
```

and extend the `tables` object used for the checksum/payload:

```js
		droidSellValues: d.droidSellValues ?? [], flawlessSpawn: d.flawlessSpawn ?? [], novaPaintStages: d.novaPaintStages ?? [],
		craftingTimes: d.craftingTimes ?? [], companionBuffs: d.companionBuffs ?? [], iconicCompanionEffects: d.iconicCompanionEffects ?? []
```

- [ ] **Step 5: Extend the backfill script**

In `app/drizzle/backfill-payload.mjs`, add the three tables to its parallel select and to the assembled `tables` object, mirroring the existing entries exactly (same camelCase keys as `PayloadTables`, same `select ... from <table>` style, column aliases in camelCase where the DB name is snake_case — `crystal_cost as "crystalCost"` is the existing precedent).

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm run test:int -- src/lib/server/services/sync.integration.test.ts && npm run check
```

Expected: PASS + clean type check.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/services/sync.ts src/lib/server/services/sync.integration.test.ts drizzle/seed.mjs drizzle/backfill-payload.mjs
git commit -m "feat(sync): write crafting/companion tables on apply, seed and backfill

flawless_owned stays out of the truncate set — a regression test asserts a
sync apply leaves user ownership untouched."
```

---

## Task A7 [sonnet]: Reference service + `/api/reference`

**Files:**
- Modify: `app/src/lib/server/services/reference.ts`
- Modify: `app/src/lib/server/services/reference.integration.test.ts`

**Interfaces:**
- Consumes: drizzle tables from A5, `seedMinimalReference` rows from A5 Step 5.
- Produces: `getReference(db)` return value gains `craftingTimes`, `companionBuffs`, `iconicCompanionEffects` arrays. `/api/reference/+server.ts` needs no change (it serializes whatever `getReference` returns), and `+layout.server.ts` passes it straight through to `page.data.reference` for PR C.

- [ ] **Step 1: Write the failing test**

Append to `app/src/lib/server/services/reference.integration.test.ts`, inside the existing `describe`:

```ts
	it('serves the crafting and companion reference tables', async () => {
		const ref = await getReference(db);
		expect(ref.craftingTimes).toEqual(expect.arrayContaining([
			{ droid: 'MOUSE', tier: 'Base', seconds: 33 },
			{ droid: 'CB', tier: 'Galactic', seconds: null }
		]));
		expect(ref.companionBuffs).toEqual(expect.arrayContaining([
			{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 },
			{ kind: 'Worker', rarity: 'Iconic', tier: 'Base', value: null }
		]));
		expect(ref.iconicCompanionEffects.map((e) => e.droid).sort()).toEqual(['CB-23', 'R2-D2']);
	});
```

- [ ] **Step 2: Run it to watch it fail**

```bash
npm run test:int -- src/lib/server/services/reference.integration.test.ts
```

Expected: FAIL — `ref.craftingTimes` is undefined.

- [ ] **Step 3: Extend the service**

Rewrite `app/src/lib/server/services/reference.ts` as:

```ts
import { desc } from 'drizzle-orm';
import type { Db } from '../db';
import {
	droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, droidSellValues,
	flawlessSpawn, novaPaintStages, craftingTimes, companionBuffs, iconicCompanionEffects, dataVersions
} from '../schema';

export async function getReference(db: Db) {
	const [d, dt, rr, cc, rm, ns, cos, sv, fs, ps, ct, cb, ice, ver] = await Promise.all([
		db.select().from(droids), db.select().from(droidTiers), db.select().from(rebirthReqs),
		db.select().from(chipCosts), db.select().from(rebirthMeta), db.select().from(novaShop),
		db.select().from(cosmetics), db.select().from(droidSellValues), db.select().from(flawlessSpawn),
		db.select().from(novaPaintStages), db.select().from(craftingTimes), db.select().from(companionBuffs),
		db.select().from(iconicCompanionEffects), db.select().from(dataVersions).orderBy(desc(dataVersions.id)).limit(1)
	]);
	return {
		version: ver[0] ?? null, droids: d, droidTiers: dt, rebirthReqs: rr, chipCosts: cc,
		rebirthMeta: rm, novaShop: ns, cosmetics: cos, droidSellValues: sv, flawlessSpawn: fs,
		novaPaintStages: ps, craftingTimes: ct, companionBuffs: cb, iconicCompanionEffects: ice
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:int -- src/lib/server/services/reference.integration.test.ts && npm run check
```

Expected: PASS + clean type check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/reference.ts src/lib/server/services/reference.integration.test.ts
git commit -m "feat(api): expose crafting times, companion buffs and iconic effects on /api/reference"
```

---

## Task A8 [opus]: Regenerate `seed-data.json` from the live sheet

**Files:**
- Modify: `app/scripts/regen-seed-data.ts`
- Regenerate: `app/drizzle/seed-data.json`
- Verify: `app/src/lib/server/sync/aliases.ts` (no change expected), `docs/asset-manifest.json` conventions (read-only here)

**Interfaces:**
- Consumes: `buildPayload`, `rejectsOf`.
- Produces: `regen-seed-data.ts` reading five gids and failing on any hold not in an explicit allowlist (`ALLOWED_HOLDS`, empty at merge time). `seed-data.json` gains `craftingTimes` (420), `companionBuffs` (108), `iconicCompanionEffects` (8) and carries every content delta.

- [ ] **Step 1: Update the regen script**

Replace the header comment's gid list and the `GIDS` constant in `app/scripts/regen-seed-data.ts`, and make holds fatal:

```ts
// <csv-dir> must contain gid_<gid>.csv for the five synced tabs:
//   gid_0.csv           DroidexRebirths
//   gid_1248391507.csv  Droid Reference Sheet (costs/values)
//   gid_547464940.csv   Cosmetics
//   gid_1548395368.csv  Nova Crystals + Shop Reference
//   gid_1131770079.csv  Droid Crafting Times + Companion Buffs
```

```ts
const GIDS = ['0', '1248391507', '547464940', '1548395368', '1131770079'];

// Holds are "an admin must look at this" signals. Regenerating the committed seed is not an
// admin session, so an unexpected hold aborts. Add a key here (with a comment saying why and
// when it should clear) only when the sheet state is knowingly accepted.
const ALLOWED_HOLDS = new Set<string>([]);
```

and replace the flag-reporting block with:

```ts
const { payload, flags } = buildPayload(csvByGid, [], 'regen-seed-data', new Date().toISOString());
for (const f of flags.filter((f) => f.kind === 'report')) console.warn(`[report] ${f.code}: ${f.message}`);

const holds = flags.filter((f) => f.kind === 'hold');
const unexpected = holds.filter((f) => !ALLOWED_HOLDS.has(f.key ?? ''));
for (const f of holds) console.warn(`[hold] ${f.code}: ${f.message}`);
if (unexpected.length) {
	console.error(`\n${unexpected.length} unexpected hold(s) — refusing to regenerate the seed.`);
	console.error('Investigate the sheet, then either fix the parser/aliases or add the key to ALLOWED_HOLDS with a reason:');
	for (const f of unexpected) console.error(`  ${f.key ?? '(no key)'}  ${f.code}: ${f.message}`);
	process.exit(1);
}
const rejects = rejectsOf(flags);
if (rejects.length) {
	for (const f of rejects) console.error(`[reject] ${f.code}: ${f.message}`);
	process.exit(1);
}
```

- [ ] **Step 2: Stage the five CSV exports under the exact expected filenames**

```bash
mkdir -p /Users/jason/.claude/jobs/657deff8/tmp/seed-csv
for gid in 0 1248391507 547464940 1548395368 1131770079; do
  cp /Users/jason/.claude/jobs/657deff8/tmp/tab-$gid.csv /Users/jason/.claude/jobs/657deff8/tmp/seed-csv/gid_$gid.csv
done
ls /Users/jason/.claude/jobs/657deff8/tmp/seed-csv
```

Expected: exactly `gid_0.csv gid_1131770079.csv gid_1248391507.csv gid_1548395368.csv gid_547464940.csv`. If those exports are stale or missing, re-fetch each from `https://docs.google.com/spreadsheets/d/1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg/export?format=csv&gid=<gid>` into the same filenames.

- [ ] **Step 3: Run the regeneration**

```bash
npx tsx scripts/regen-seed-data.ts /Users/jason/.claude/jobs/657deff8/tmp/seed-csv
```

Expected stdout (row counts), exactly:
```
droids: 70
droidTiers: 420
rebirthReqs: 360
chipCosts: 6
rebirthMeta: 19
novaShop: 175
cosmetics: 65
droidSellValues: 25
flawlessSpawn: 6
novaPaintStages: 3
craftingTimes: 420
companionBuffs: 108
iconicCompanionEffects: 8
```
Expected exit code 0 with **no** `[hold]` lines: the IG sell corrections landed upstream, so the standing ratio holds should clear. If a hold appears, read it — a real ratio violation is a sheet fact to accept via `ALLOWED_HOLDS` (with a comment), a droid-name hold means an alias is missing. Never edit the CSV.

- [ ] **Step 4: Verify the content deltas landed**

```bash
python3 - <<'PY'
import json
d = json.load(open('drizzle/seed-data.json'))
names = {x['name'] for x in d['droids']}
assert 'CHOPPER' in names and 'BB8' in names and 'BB-8' not in names, 'droid naming'
print('CHOPPER', [x for x in d['droids'] if x['name']=='CHOPPER'])
print('RB30', [r for r in d['rebirthMeta'] if r['rebirth']==30])
print('Mythic chips', [c for c in d['chipCosts'] if c['rarity']=='Mythic'])
print('Galactic flawless', [f for f in d['flawlessSpawn'] if f['tier']=='Galactic'])
print('HOV-R Beskar', [t for t in d['droidTiers'] if t['droid']=='HOV-R' and t['tier']=='Beskar'])
print('2BB Galactic', [t for t in d['droidTiers'] if t['droid']=='2BB' and t['tier']=='Galactic'])
print('CHOPPER cosmetics', [c for c in d['cosmetics'] if 'CHOPPER' in c['name']])
print('CraftSpeed L11', [n for n in d['novaShop'] if n['item']=='Crafting Speed' and n['level']==11])
print('LO craft', [c for c in d['craftingTimes'] if c['droid']=='LO' and c['tier'] in ('Base','Gold')])
PY
```

Expected: CHOPPER present as `{"name":"CHOPPER","rarity":"Iconic","type":"Astromech","incomePct":15,...}`; RB30 nova `254`; Mythic chips `4000/8000/20000/40000/70000`; Galactic flawless `oneIn: 75`; HOV-R Beskar income `744`; 2BB Galactic sell `420000`; two CHOPPER cosmetics with requirement `CHOPPER EVENT`; Crafting Speed L11 cost `445`; `LO` Base and Gold both `451` seconds (the sheet's duplicate — ship as-is).

- [ ] **Step 5: Confirm CHOPPER needs no alias and matches the art convention**

```bash
grep -n "CHOPPER" src/lib/server/sync/aliases.ts || echo "no alias needed (name is CHOPPER in every tab)"
python3 -c "
import json; m=json.load(open('../docs/asset-manifest.json'))
print(m['meta']['conventions']['normName']); print(m['meta']['conventions']['droidArtFilename'])
print('expected CHOPPER art file: CHOPPER_Default.webp')
"
grep -n "BB-8" src/lib/server/sync/aliases.ts
```

Expected: no CHOPPER alias (the sheet writes `CHOPPER` in the reference, droidex and crafting tabs; `normName('CHOPPER')` is already `CHOPPER`, so the art file is `CHOPPER_Default.webp` with no special case). The `'BB-8': 'BB8'` alias line must still be present — it is what keeps user counts keyed on `BB8` working.

- [ ] **Step 6: Re-seed a database and run every suite**

```bash
node drizzle/seed.mjs
DATABASE_URL=postgres://dtt:dtt@localhost:5432/dtt_test node drizzle/seed.mjs
npm run test:unit && npm run test:int && npm run test:routes && npm run check
```

Expected: `seeded` twice, all suites PASS, type check clean.

- [ ] **Step 7: Commit**

```bash
git add drizzle/seed-data.json scripts/regen-seed-data.ts
git commit -m "feat(data): resync seed from the live sheet (CHOPPER, chip rebalance, crafting tab)

70 droids (+CHOPPER), 175 nova shop rows, RB30 nova 254, Mythic chips
4000/8000/20000/40000/70000, Galactic flawless 1/75, +2 CHOPPER cosmetics,
and the new crafting/companion tables. regen-seed-data now reads five tabs
and aborts on any hold outside an explicit allowlist. Sheet anomalies
(Crafting Speed L11=445, duplicate craft times, non-monotonic Beskar
durations) ship verbatim per sheet authority."
```

---

## Task A9 [sonnet]: Full verification sweep + open PR A

**Files:** none modified (verification only).

- [ ] **Step 1: Run every suite from a clean state**

```bash
docker compose -f ../docker-compose.dev.yml up -d db
npm run check
npm run test:unit
npm run test:int
npm run test:routes
npm run test:e2e
```

Expected: type check clean; unit 44+; integration ≥126 plus the new cases; route 1; e2e 10. Record the actual counts — they go in the PR body.

- [ ] **Step 2: Confirm the migration chain is linear**

```bash
cat drizzle/migrations/meta/_journal.json | python3 -c "import json,sys; print([e['tag'] for e in json.load(sys.stdin)['entries']])"
```

Expected: `['0000_colorful_nitro', '0001_cold_glorian', '0002_mysterious_wolf_cub', '0003_condemned_omega_red', '0004_<name>']` — exactly five entries, no gaps.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/patch-sync-foundation
gh pr create --title "Sync foundation: nova parser rewrite, crafting tab, patch data" --body "$(cat <<'EOF'
## What

- **Fixes a live data-corruption defect.** `parsers/novaShop.ts` used hardcoded column indices. Two new Featured columns shifted the whole tab, so against the live sheet it did not throw — it emitted garbage rows plus empty paintStages/rebirthMeta. Rewritten with header-anchored discovery: sections by banner text, items by the name row, no positional constants.
- **Loud failure.** `validate.ts` now rejects empty `novaShop`/`rebirthMeta`/`novaPaintStages`/crafting tables, a missing shop category, and a structural header parsed as an item. Unresolvable geometry throws in the parsers.
- **New tab.** `parsers/craftingCompanions.ts` reads gid `1131770079`: per-droid craft durations (H:MM:SS → seconds, blanks and Iconic N/A → null), three companion-buff tables, and the iconic companion effects.
- **Migration 0004** — `crafting_times`, `companion_buffs`, `iconic_companion_effects`, `flawless_owned`. One migration for the whole patch update; PRs B and C are migration-free.
- **Data resync.** 70 droids (+CHOPPER), 175 nova shop rows (was 131), RB30 nova 254, Mythic chips 4000/8000/20000/40000/70000, Galactic flawless 1/75, +2 CHOPPER cosmetics.

## Sheet authority

Anomalies ship verbatim: nova Crafting Speed L11 = 445 (breaks its +15 step), duplicate craft-time cells (LO Basic == Gold, B2-RP Rainbow == Beskar), Beskar craft times 0.8× Rainbow (non-monotonic). These are real sheet values, not parser bugs.

## Tests

Parser units incl. a pre-shift-geometry case (proves anchoring, not positions) and five loud-failure cases; crafting parser units for duration/blank/N-A/COMPAINION/"ICONIC " handling; integration coverage for apply + reference; a regression test that a sync apply leaves `flawless_owned` untouched.
EOF
)"
```

- [ ] **Step 4: Request review, then merge**

Use `superpowers:requesting-code-review`. After approval, squash-merge to `main`. Do not start B or C before this merge lands.

---

# PHASE B — Flawless ownership (PR B, branch `feat/flawless-ownership`, branches from `main` **after A merges**)

## Task B1 [sonnet]: Flawless eligibility helpers

**Files:**
- Create: `app/src/lib/game/flawless.ts`
- Create: `app/src/lib/game/flawless.test.ts`

**Interfaces:**
- Produces:
  - `isFlawlessEligible(d: { rarity: string }): boolean` — true for every non-Iconic droid.
  - `eligibleFlawless<T extends { name: string; rarity: string }>(droids: T[]): T[]` — filtered, input order preserved.
  - `flawlessProgress(owned: readonly string[], droids: { name: string; rarity: string }[]): { owned: number; total: number }` — `owned` counts only names that are eligible and known, so a stale row can never push the numerator past the denominator.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/flawless-ownership
cd app && npm ci
```

- [ ] **Step 2: Write the failing test**

Create `app/src/lib/game/flawless.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isFlawlessEligible, eligibleFlawless, flawlessProgress } from './flawless';

const roster = [
	{ name: 'MOUSE', rarity: 'Common' },
	{ name: 'IG', rarity: 'Mythic' },
	{ name: 'R2-D2', rarity: 'Iconic' },
	{ name: 'CHOPPER', rarity: 'Iconic' }
];

describe('flawless eligibility', () => {
	it('excludes Iconic droids — flawless is an ownership axis, not a tier', () => {
		expect(isFlawlessEligible({ rarity: 'Common' })).toBe(true);
		expect(isFlawlessEligible({ rarity: 'Iconic' })).toBe(false);
		expect(eligibleFlawless(roster).map((d) => d.name)).toEqual(['MOUSE', 'IG']);
	});
	it('counts progress against the eligible roster only', () => {
		expect(flawlessProgress(['MOUSE'], roster)).toEqual({ owned: 1, total: 2 });
		expect(flawlessProgress([], roster)).toEqual({ owned: 0, total: 2 });
	});
	it('ignores owned rows for unknown or ineligible droids', () => {
		expect(flawlessProgress(['MOUSE', 'R2-D2', 'GONE'], roster)).toEqual({ owned: 1, total: 2 });
	});
	it('does not double count duplicates', () => {
		expect(flawlessProgress(['MOUSE', 'MOUSE'], roster)).toEqual({ owned: 1, total: 2 });
	});
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm run test:unit -- src/lib/game/flawless.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the module**

Create `app/src/lib/game/flawless.ts`:

```ts
// Flawless is an ownership axis, not a tier: the sheet excludes it from the 380-file droid
// universe and every non-Iconic droid (62 of 70) has a flawless variant. Iconics do not.
export function isFlawlessEligible(d: { rarity: string }): boolean {
	return d.rarity !== 'Iconic';
}

export function eligibleFlawless<T extends { name: string; rarity: string }>(droids: T[]): T[] {
	return droids.filter(isFlawlessEligible);
}

export function flawlessProgress(
	owned: readonly string[],
	droids: { name: string; rarity: string }[]
): { owned: number; total: number } {
	const eligible = new Set(eligibleFlawless(droids).map((d) => d.name));
	const have = new Set(owned.filter((n) => eligible.has(n)));
	return { owned: have.size, total: eligible.size };
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npm run test:unit -- src/lib/game/flawless.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/flawless.ts src/lib/game/flawless.test.ts
git commit -m "feat(game): flawless eligibility and progress helpers"
```

---

## Task B2 [sonnet]: Flawless service

**Files:**
- Create: `app/src/lib/server/services/flawless.ts`
- Create: `app/src/lib/server/services/flawless.integration.test.ts`

**Interfaces:**
- Consumes: `assertOwner(db, userId, profileId)` from `./profiles` (throws 404 `not_found` / 403 `not_owner`), `ApiError(status, code, message)`, drizzle tables `flawlessOwned`, `droids`.
- Produces:
  - `setFlawless(db: Db, userId: number, profileId: number, droid: string, owned: boolean): Promise<{ owned: boolean }>` — 422 `unknown_droid` for a name not in the roster, 422 `not_flawless_eligible` for an Iconic, idempotent in both directions.
  - `listFlawless(db: Db, profileId: number): Promise<string[]>` — droid names, ascending.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/server/services/flawless.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { testDb, resetUserZone, seedMinimalReference, createTestUser } from '../testing/db';
import { createProfile } from './profiles';
import { setFlawless, listFlawless } from './flawless';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number, pid: number;

beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await createTestUser(db, 'fl')).id;
	pid = (await createProfile(db, uid, { name: 'main' })).id;
});

describe('setFlawless', () => {
	it('marks, lists and clears ownership', async () => {
		await setFlawless(db, uid, pid, 'MOUSE', true);
		await setFlawless(db, uid, pid, 'CB', true);
		expect(await listFlawless(db, pid)).toEqual(['CB', 'MOUSE']);
		await setFlawless(db, uid, pid, 'MOUSE', false);
		expect(await listFlawless(db, pid)).toEqual(['CB']);
	});
	it('is idempotent in both directions', async () => {
		await setFlawless(db, uid, pid, 'MOUSE', true);
		await setFlawless(db, uid, pid, 'MOUSE', true);
		expect(await listFlawless(db, pid)).toEqual(['MOUSE']);
		await setFlawless(db, uid, pid, 'MOUSE', false);
		await setFlawless(db, uid, pid, 'MOUSE', false);
		expect(await listFlawless(db, pid)).toEqual([]);
	});
	it('rejects an unknown droid with 422', async () => {
		await expect(setFlawless(db, uid, pid, 'NOT-A-DROID', true)).rejects.toMatchObject({
			status: 422, code: 'unknown_droid'
		});
	});
	it('rejects an Iconic droid — Iconics have no flawless variant', async () => {
		await expect(setFlawless(db, uid, pid, 'R2-D2', true)).rejects.toMatchObject({
			status: 422, code: 'not_flawless_eligible'
		});
	});
	it('stranger cannot write (403)', async () => {
		const other = (await createTestUser(db, 'stranger')).id;
		await expect(setFlawless(db, other, pid, 'MOUSE', true)).rejects.toMatchObject({ status: 403 });
	});
});
```

- [ ] **Step 2: Run it to watch it fail**

```bash
npm run test:int -- src/lib/server/services/flawless.integration.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `app/src/lib/server/services/flawless.ts`:

```ts
import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { flawlessOwned, droids } from '../schema';
import { ApiError } from '../api-error';
import { assertOwner } from './profiles';
import { isFlawlessEligible } from '$lib/game/flawless';

// Row presence = owned (same idiom as `plans`); owned:false deletes.
export async function setFlawless(db: Db, userId: number, profileId: number, droid: string, owned: boolean) {
	await assertOwner(db, userId, profileId);
	const d = await db.query.droids.findFirst({ where: eq(droids.name, droid) });
	if (!d) throw new ApiError(422, 'unknown_droid', `Unknown droid: ${droid}`);
	if (!isFlawlessEligible(d)) {
		throw new ApiError(422, 'not_flawless_eligible', `${droid} is Iconic — it has no flawless variant`);
	}
	if (owned) {
		await db.insert(flawlessOwned).values({ profileId, droid }).onConflictDoNothing();
	} else {
		await db.delete(flawlessOwned).where(and(eq(flawlessOwned.profileId, profileId), eq(flawlessOwned.droid, droid)));
	}
	return { owned };
}

export async function listFlawless(db: Db, profileId: number): Promise<string[]> {
	const rows = await db
		.select({ droid: flawlessOwned.droid })
		.from(flawlessOwned)
		.where(eq(flawlessOwned.profileId, profileId))
		.orderBy(asc(flawlessOwned.droid));
	return rows.map((r) => r.droid);
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npm run test:int -- src/lib/server/services/flawless.integration.test.ts && npm run check
```

Expected: PASS + clean type check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/services/flawless.ts src/lib/server/services/flawless.integration.test.ts
git commit -m "feat(api): flawless ownership service"
```

---

## Task B3 [sonnet]: PUT endpoint, layout load and tracker axis

**Files:**
- Create: `app/src/routes/api/profiles/[id]/flawless/[droid]/+server.ts`
- Modify: `app/src/routes/+layout.server.ts`
- Modify: `app/src/lib/client/tracker.svelte.ts`

**Interfaces:**
- Consumes: `guard`, `requireUser`, `intParam`, `decodeParam` from `$lib/server/respond`; `setFlawless` from B2.
- Produces:
  - `PUT /api/profiles/[id]/flawless/[droid]` with body `{ owned: boolean }` → `{ owned }`. Droid segment is URL-encoded by the client (names contain spaces and hyphens), decoded with `decodeParam` exactly like the counts endpoint.
  - `+layout.server.ts` returns `flawlessByProfile: Record<number, string[]>`.
  - Tracker gains `flawlessOwned(droid: string): boolean`, `setFlawlessOwned(droid: string, owned: boolean): Promise<void>` (optimistic, rolls back and toasts on failure), `flawlessList(): string[]`.

- [ ] **Step 1: Add the endpoint**

Create `app/src/routes/api/profiles/[id]/flawless/[droid]/+server.ts` (mirrors the counts endpoint exactly):

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser, intParam, decodeParam } from '$lib/server/respond';
import { setFlawless } from '$lib/server/services/flawless';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = (await request.json().catch(() => ({}))) ?? {};
		const res = await setFlawless(
			db, user.id, intParam(params.id, 'id'),
			decodeParam(params.droid, 'droid'), body.owned === true
		);
		return json(res);
	});
```

- [ ] **Step 2: Load ownership in the layout**

In `app/src/routes/+layout.server.ts`, add `flawlessOwned` to the schema import, add the query to the `Promise.all`, group it, and return it:

```ts
import { counts, plans, flawlessOwned } from '$lib/server/schema';
```

```ts
	const [reference, profiles, allCounts, allPlans, allFlawless] = await Promise.all([
		getReference(db),
		listAllProfiles(db),
		db.select().from(counts),
		db.select().from(plans),
		db.select().from(flawlessOwned)
	]);
```

```ts
	const flawlessByProfile: Record<number, string[]> = {};
	for (const f of allFlawless) (flawlessByProfile[f.profileId] ??= []).push(f.droid);
	return { user: locals.user, reference, profiles, countsByProfile, plansByCycle: plansTmp, flawlessByProfile };
```

- [ ] **Step 3: Add the tracker axis**

In `app/src/lib/client/tracker.svelte.ts`, extend `TrackerData`:

```ts
export type TrackerData = {
	user: { id: number };
	profiles: ProfileRow[];
	countsByProfile: Record<number, CountRow[]>;
	plansByCycle: Record<number, Record<number, number[]>>;
	flawlessByProfile: Record<number, string[]>;
};
```

add to the `$state` object:

```ts
		flawless: structuredClone(data.flawlessByProfile ?? {}) as Record<number, string[]>,
```

add to `applyServerData`, next to the counts/plans re-seed:

```ts
			state.flawless = structuredClone(next.flawlessByProfile ?? {});
```

and add these methods to the returned object (after `setCount`):

```ts
		flawlessList: () => state.flawless[state.activeId ?? -1] ?? [],
		flawlessOwned: (droid: string) => (state.flawless[state.activeId ?? -1] ?? []).includes(droid),
		async setFlawlessOwned(droid: string, owned: boolean) {
			const pid = state.activeId;
			if (pid == null || !editable()) return;
			const list = (state.flawless[pid] ??= []);
			const had = list.includes(droid);
			if (owned && !had) list.push(droid);
			else if (!owned && had) list.splice(list.indexOf(droid), 1);
			try {
				await apiFetch(`/api/profiles/${pid}/flawless/${encodeURIComponent(droid)}`, {
					method: 'PUT', body: JSON.stringify({ owned })
				});
			} catch (e) {
				// rollback to the pre-edit membership
				const now = state.flawless[pid] ?? [];
				const idx = now.indexOf(droid);
				if (had && idx < 0) now.push(droid);
				else if (!had && idx >= 0) now.splice(idx, 1);
				toast(`Save failed: ${(e as Error).message}`);
			}
		},
```

- [ ] **Step 4: Type-check**

```bash
npm run check
```

Expected: clean. (`+layout.svelte` casts `data` to `never` when building the tracker, so the new field flows through without a change there.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/profiles/\[id\]/flawless src/routes/+layout.server.ts src/lib/client/tracker.svelte.ts
git commit -m "feat(api): PUT /api/profiles/:id/flawless/:droid + tracker flawless axis"
```

---

## Task B4 [sonnet]: Droidex flawless column + `x/62` metric + e2e

**Files:**
- Modify: `app/src/routes/droids/+page.svelte`
- Create: `app/e2e/flawless.spec.ts`

**Interfaces:**
- Consumes: `flawlessProgress`, `isFlawlessEligible` from `$lib/game/flawless`; tracker `flawlessOwned` / `setFlawlessOwned` from B3.
- Produces: a `data-testid="flawless-metric"` element rendering `owned/total` (62 with live data), and a per-row `button.flawless` with accessible name `` `${droid} flawless` ``.

- [ ] **Step 1: Add the column and the metric**

In `app/src/routes/droids/+page.svelte`, add to the `<script>` block:

```ts
	import { flawlessProgress, isFlawlessEligible } from '$lib/game/flawless';
	const flawless = $derived(flawlessProgress(t.flawlessList(), ref.droids));
```

replace the `<h1>` line with:

```svelte
<h1>All Droids</h1>
<p class="metrics">
	Flawless <strong data-testid="flawless-metric">{flawless.owned}/{flawless.total}</strong>
	<span class="hint">— an ownership axis, excluded from the droid tier total</span>
</p>
```

add the header cell after `<th>Own</th>`:

```svelte
<th>Flawless</th>
```

and the body cell after the `Own` `<td>`:

```svelte
					<td>
						{#if isFlawlessEligible(d)}
							<button class="flawless" class:owned={t.flawlessOwned(d.name)} disabled={!t.editable()}
								aria-pressed={t.flawlessOwned(d.name)} title="{d.name} flawless"
								onclick={() => t.setFlawlessOwned(d.name, !t.flawlessOwned(d.name))}>✦</button>
						{:else}
							<span class="na" title="Iconic droids have no flawless variant">—</span>
						{/if}
					</td>
```

and append the styles (visually distinct from the tier `+` buttons — this is an axis, not a tier):

```svelte
<style>
	.metrics { margin: 0 0 0.5rem; }
	.hint { opacity: 0.6; font-size: 0.85em; }
	.flawless {
		border: 1px solid var(--accent, #7fd7ff);
		background: transparent;
		color: var(--accent, #7fd7ff);
		border-radius: 999px;
		width: 1.75rem;
		line-height: 1.5rem;
		cursor: pointer;
	}
	.flawless.owned { background: var(--accent, #7fd7ff); color: var(--panel-deep, #0a1322); }
	.flawless:disabled { opacity: 0.4; cursor: default; }
	.na { opacity: 0.35; }
</style>
```

- [ ] **Step 2: Write the e2e test**

Create `app/e2e/flawless.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signInWithProfile } from './support/auth';

test('droidex flawless toggle persists and moves the x/62 metric', async ({ page }) => {
	await signInWithProfile(page);
	await page.goto('/droids');

	const metric = page.getByTestId('flawless-metric');
	await expect(metric).toHaveText('0/62');

	const toggle = page.locator('button.flawless').first();
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/flawless/') && r.request().method() === 'PUT' && r.ok()),
		toggle.click()
	]);
	await expect(metric).toHaveText('1/62');
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	await page.reload();
	await expect(page.getByTestId('flawless-metric')).toHaveText('1/62');

	// toggling off returns to zero
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/flawless/') && r.ok()),
		page.locator('button.flawless').first().click()
	]);
	await expect(page.getByTestId('flawless-metric')).toHaveText('0/62');
});

test('iconic droids have no flawless toggle', async ({ page }) => {
	await signInWithProfile(page);
	await page.goto('/droids');
	const chopperRow = page.locator('tr', { hasText: 'CHOPPER' }).first();
	await expect(chopperRow.locator('button.flawless')).toHaveCount(0);
	await expect(chopperRow.locator('span.na')).toHaveCount(1);
});
```

- [ ] **Step 3: Run the e2e suite**

```bash
npm run test:e2e -- flawless.spec.ts
```

Expected: both tests PASS. `0/62` depends on the regenerated seed from PR A (70 droids, 8 Iconic); if the metric reads a different denominator, the database was seeded from a stale `seed-data.json` — re-run `node drizzle/seed.mjs` against `dtt_test` rather than changing the assertion.

- [ ] **Step 4: Run every suite**

```bash
npm run check && npm run test:unit && npm run test:int && npm run test:routes && npm run test:e2e
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/routes/droids/+page.svelte e2e/flawless.spec.ts
git commit -m "feat(droids): flawless ownership toggle column and x/62 collection metric"
```

---

## Task B5 [sonnet]: Open PR B

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/flawless-ownership
gh pr create --title "Flawless ownership tracking" --body "$(cat <<'EOF'
## What

Flawless is an ownership axis, not a tier — the sheet excludes it from the 380-file droid universe, and every non-Iconic droid (62 of 70) has a flawless variant.

- `flawless_owned` (created by migration 0004 in PR A) — row presence = owned, mirroring `plans`. No cycle axis; a sync apply never truncates it (regression test in PR A).
- `PUT /api/profiles/:id/flawless/:droid` with `{ owned: boolean }`, following the counts-endpoint conventions (guard / requireUser / intParam / decodeParam). 422 for an unknown droid or an Iconic.
- Layout load returns `flawlessByProfile`; the tracker store gains an optimistic `setFlawlessOwned` with rollback + toast.
- `/droids` gains a visually distinct round toggle column and a separate `x/62` metric.

## Tests

Unit: eligibility + progress (including stale/duplicate owned rows). Integration: service CRUD, idempotency, 422/403 paths. e2e: toggle persists across reload, metric moves, Iconic rows have no toggle.
EOF
)"
```

- [ ] **Step 2: Review and merge**

Use `superpowers:requesting-code-review`, then squash-merge to `main`.

---

# PHASE C — Crafting surfaces (PR C, branch `feat/crafting-surfaces`, parallel with B)

## Task C1 [sonnet]: Crafting time helpers

**Files:**
- Create: `app/src/lib/game/crafting.ts`
- Create: `app/src/lib/game/crafting.test.ts`

**Interfaces:**
- Produces:
  - `type CraftTimeRow = { droid: string; tier: Tier; seconds: number | null }`
  - `craftSeconds(rows: CraftTimeRow[], droid: string, tier: Tier): number | null` — `null` when unknown or unpublished.
  - `formatHms(seconds: number): string` — `"H:MM:SS"`, hours uncapped (`107700` → `"29:55:00"`).
  - `planCraftTotal(rows, needs, isOwned): { seconds: number; unknown: number }` — Σ base craft time over the needs not yet owned; `unknown` counts remaining needs whose craft time is null/missing so the UI can say so instead of under-reporting.

These are **base (unbuffed)** times. Companion-buff math is explicitly out of scope.

- [ ] **Step 1: Create the branch**

```bash
git checkout main && git pull --ff-only
git checkout -b feat/crafting-surfaces
cd app && npm ci
```

- [ ] **Step 2: Write the failing test**

Create `app/src/lib/game/crafting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { craftSeconds, formatHms, planCraftTotal, type CraftTimeRow } from './crafting';

const rows: CraftTimeRow[] = [
	{ droid: 'MOUSE', tier: 'Base', seconds: 33 },
	{ droid: 'MOUSE', tier: 'Gold', seconds: 134 },
	{ droid: 'HAUL-R', tier: 'Galactic', seconds: null },
	{ droid: 'IG', tier: 'Base', seconds: 6200 }
];

describe('craftSeconds', () => {
	it('finds a published time', () => {
		expect(craftSeconds(rows, 'MOUSE', 'Gold')).toBe(134);
	});
	it('returns null for unpublished and unknown combinations', () => {
		expect(craftSeconds(rows, 'HAUL-R', 'Galactic')).toBeNull();
		expect(craftSeconds(rows, 'MOUSE', 'Beskar')).toBeNull();
		expect(craftSeconds(rows, 'NOBODY', 'Base')).toBeNull();
	});
});

describe('formatHms', () => {
	it('matches the sheet format and does not cap hours at 24', () => {
		expect(formatHms(33)).toBe('0:00:33');
		expect(formatHms(134)).toBe('0:02:14');
		expect(formatHms(6768)).toBe('1:52:48');
		expect(formatHms(107700)).toBe('29:55:00');
		expect(formatHms(0)).toBe('0:00:00');
	});
});

describe('planCraftTotal', () => {
	const needs = [
		{ droid: 'MOUSE', tier: 'Gold' as const },
		{ droid: 'IG', tier: 'Base' as const },
		{ droid: 'HAUL-R', tier: 'Galactic' as const }
	];
	it('sums only the needs that are not yet owned', () => {
		expect(planCraftTotal(rows, needs, () => false)).toEqual({ seconds: 6334, unknown: 1 });
		expect(planCraftTotal(rows, needs, (d) => d === 'IG')).toEqual({ seconds: 134, unknown: 1 });
		expect(planCraftTotal(rows, needs, () => true)).toEqual({ seconds: 0, unknown: 0 });
	});
	it('is zero for an empty plan', () => {
		expect(planCraftTotal(rows, [], () => false)).toEqual({ seconds: 0, unknown: 0 });
	});
});
```

- [ ] **Step 3: Run it to watch it fail**

```bash
npm run test:unit -- src/lib/game/crafting.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the module**

Create `app/src/lib/game/crafting.ts`:

```ts
import type { Tier } from './tiers';

// Base (unbuffed) craft durations, straight from the sheet's CRAFTING TIME - NO BUFF grid.
// Companion buffs are reference display only — no buff math here, by design.
export type CraftTimeRow = { droid: string; tier: Tier; seconds: number | null };

export function craftSeconds(rows: CraftTimeRow[], droid: string, tier: Tier): number | null {
	return rows.find((r) => r.droid === droid && r.tier === tier)?.seconds ?? null;
}

export function formatHms(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Σ base craft time over the planned crafts still outstanding for this cycle.
 *  `unknown` counts outstanding needs the sheet has not published a time for. */
export function planCraftTotal(
	rows: CraftTimeRow[],
	needs: { droid: string; tier: Tier }[],
	isOwned: (droid: string, tier: Tier) => boolean
): { seconds: number; unknown: number } {
	let seconds = 0;
	let unknown = 0;
	for (const n of needs) {
		if (isOwned(n.droid, n.tier)) continue;
		const s = craftSeconds(rows, n.droid, n.tier);
		if (s === null) unknown++;
		else seconds += s;
	}
	return { seconds, unknown };
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npm run test:unit -- src/lib/game/crafting.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/crafting.ts src/lib/game/crafting.test.ts
git commit -m "feat(game): base craft-time lookup, H:MM:SS formatting and per-cycle totals"
```

---

## Task C2 [sonnet]: Planner craft times + per-cycle total

**Files:**
- Modify: `app/src/routes/planner/+page.svelte`
- Create: `app/e2e/crafting.spec.ts`

**Interfaces:**
- Consumes: `craftSeconds`, `formatHms`, `planCraftTotal` from C1; `ref.craftingTimes` from `/api/reference` (PR A); `isMet` from `$lib/game/inventory`.
- Produces: `data-testid="craft-total"` on the planner's per-cycle total.

- [ ] **Step 1: Add craft times to the planner**

In `app/src/routes/planner/+page.svelte`, add to the `<script>`:

```ts
	import { craftSeconds, formatHms, planCraftTotal, type CraftTimeRow } from '$lib/game/crafting';
```

```ts
	const craftTimes = $derived((ref.craftingTimes ?? []) as CraftTimeRow[]);
	const craftTotal = $derived(
		planCraftTotal(craftTimes, needs, (droid, tier) => isMet(t.countRows(), cycle, droid, tier))
	);
```

replace the combined-needs heading and list with:

```svelte
<h2>Combined needs ({needs.length} droids for {selected.size} rebirths)</h2>
<p class="craft-total">
	Base craft time remaining:
	<strong data-testid="craft-total">{formatHms(craftTotal.seconds)}</strong>
	{#if craftTotal.unknown}<span class="hint">+{craftTotal.unknown} with no published time</span>{/if}
	<span class="hint">— unbuffed, sum over the crafts still outstanding this cycle</span>
</p>
<ul>
	{#each needs as n}
		{@const have = isMet(t.countRows(), cycle, n.droid, n.tier)}
		{@const secs = craftSeconds(craftTimes, n.droid, n.tier)}
		<li class="tier-{n.tier}">
			<DroidImg name={n.droid} size={20} /> {n.droid} [{n.tier}]
			<span class="craft">{secs === null ? '—' : formatHms(secs)}</span>
			{have ? '✓ owned' : ''}
		</li>
	{/each}
</ul>
```

and append:

```svelte
<style>
	.craft-total { margin: 0 0 0.5rem; }
	.craft { font-variant-numeric: tabular-nums; opacity: 0.85; }
	.hint { opacity: 0.6; font-size: 0.85em; }
</style>
```

- [ ] **Step 2: Write the e2e test**

Create `app/e2e/crafting.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { signInWithProfile } from './support/auth';

test('planner shows base craft times and a per-cycle total', async ({ page }) => {
	await signInWithProfile(page);
	await page.goto('/planner');

	// nothing planned yet
	await expect(page.getByTestId('craft-total')).toHaveText('0:00:00');

	// select the first rebirth → needs appear with per-row craft times
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/plans/') && r.request().method() === 'PUT' && r.ok()),
		page.locator('label input[type=checkbox]').first().check()
	]);
	const firstNeed = page.locator('li .craft').first();
	await expect(firstNeed).toHaveText(/^\d+:[0-5]\d:[0-5]\d$/);
	await expect(page.getByTestId('craft-total')).toHaveText(/^\d+:[0-5]\d:[0-5]\d$/);
	await expect(page.getByTestId('craft-total')).not.toHaveText('0:00:00');
});
```

- [ ] **Step 3: Run it**

```bash
npm run test:e2e -- crafting.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/planner/+page.svelte e2e/crafting.spec.ts
git commit -m "feat(planner): base craft time per need and a per-cycle outstanding total"
```

---

## Task C3 [sonnet]: Companion buff tables + iconic effects on `/droids`

**Files:**
- Modify: `app/src/routes/droids/+page.svelte`

**Interfaces:**
- Consumes: `ref.companionBuffs` (`{ kind, rarity, tier, value }`) and `ref.iconicCompanionEffects` (`{ droid, effect }`) from `/api/reference`; `TIERS` from `$lib/game/tiers`.
- Produces: reference-only display. No buff math anywhere.

Note: PR B also edits this file (the flawless column). Whichever merges second rebases; the two changes touch different regions (B: table header/body cells + metric; C: new sections appended after the table).

- [ ] **Step 1: Add the reference sections**

In `app/src/routes/droids/+page.svelte`, add to the `<script>`:

```ts
	const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Iconic'];
	const BUFF_KINDS = [
		{ kind: 'Worker', title: 'Worker companions — crafting speed', unit: '%' },
		{ kind: 'Astromech', title: 'Astromech companions — pickaxe level', unit: '' },
		{ kind: 'Battle', title: 'Battle companions — max health', unit: '' }
	];
	const buffs = $derived(ref.companionBuffs ?? []);
	const buff = (kind: string, rarity: string, tier: Tier) =>
		buffs.find((b: { kind: string; rarity: string; tier: string }) => b.kind === kind && b.rarity === rarity && b.tier === tier)?.value ?? null;
	const buffRarities = $derived(
		RARITY_ORDER.filter((r) => buffs.some((b: { rarity: string }) => b.rarity === r))
	);
	const iconicEffects = $derived(ref.iconicCompanionEffects ?? []);
```

and append after the closing `</table>`:

```svelte
<h2>Companion buffs</h2>
{#each BUFF_KINDS as k}
	<h3>{k.title}</h3>
	<table>
		<thead><tr><th>Rarity</th>{#each TIERS as tier}<th class="tier-{tier}">{tier}</th>{/each}</tr></thead>
		<tbody>
			{#each buffRarities as rarity}
				<tr>
					<td>{rarity}</td>
					{#each TIERS as tier}
						{@const v = buff(k.kind, rarity, tier)}
						<td>{v === null ? 'N/A' : `${k.unit === '%' ? v + '%' : '+' + v}`}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/each}

<h2>Iconic companion effects</h2>
<table>
	<thead><tr><th>Droid</th><th>Effect</th></tr></thead>
	<tbody>
		{#each iconicEffects as e}
			<tr><td><DroidImg name={e.droid} size={20} /> {e.droid}</td><td>{e.effect}</td></tr>
		{/each}
	</tbody>
</table>
```

- [ ] **Step 2: Type-check and eyeball the page**

```bash
npm run check
npm run dev
```

Open `http://localhost:5173/droids`. Expected: three 6×6 buff tables (Worker in `%`, Astromech and Battle as `+N`, the Iconic row reading `N/A` across), then eight iconic effect rows ending with `CHOPPER — +50% CRIT CHANCE & DAMAGE`. Stop the dev server when done.

- [ ] **Step 3: Commit**

```bash
git add src/routes/droids/+page.svelte
git commit -m "feat(droids): companion buff reference tables and iconic companion effects"
```

---

## Task C4 [sonnet]: CHOPPER art + Galactic upstream re-check

**Files:**
- Modify: `scripts/fetch-droid-art.mjs`
- Add (if fetched): files under `app/static/assets/droids/`

**Interfaces:**
- Consumes: `app/drizzle/seed-data.json` (the 70-droid roster from PR A) — so this task must run on a branch cut **after** A merged.
- The script already classifies responses **by bytes, not status**: droidtrakr answers 200 with a ~13 KB SPA HTML body for missing assets, which `isWebp()` rejects and the script logs as a skip. Do not weaken that; do not judge availability by HTTP status.

- [ ] **Step 1: Add Galactic to the probed tier set**

In `scripts/fetch-droid-art.mjs`:

```js
const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar', 'Galactic'];
```

The `fileTier` helper already maps only `Base` → `Default`, so `Galactic` files are probed as `{normName}_Galactic.webp`.

- [ ] **Step 2: Run the fetch from the repo root**

```bash
cd .. && node scripts/fetch-droid-art.mjs; echo "exit=$?"
```

Expected: exit 0. Files already on disk are skipped with no network call. New arrivals are saved; genuine misses are logged skips. A non-zero exit means a network/5xx/conversion failure — report it, do not retry blindly or "work around" it.

- [ ] **Step 3: Record what actually changed**

```bash
ls app/static/assets/droids | wc -l
ls app/static/assets/droids | grep -c Galactic
ls app/static/assets/droids/CHOPPER_Default.webp 2>/dev/null || echo "CHOPPER art not available upstream"
git status --short app/static/assets/droids | head -20
```

Baseline before this task: 317 files, 0 Galactic. Write down the new numbers — Task C5 needs them, verbatim, for the manifest.

- [ ] **Step 4: Independently verify any Galactic hit is a real image**

For each new `*_Galactic.webp` (skip if none):

```bash
for f in $(git status --short app/static/assets/droids | awk '{print $2}'); do
  printf '%s ' "$f"; file -b "$f"; stat -f%z "$f"; shasum -a 256 "$f" | cut -c1-16
done
```

Expected: `RIFF (little-endian data), Web/P image`, a plausible size, and **not** the 13085-byte HTML fallback (sha256 `81f61d6c…`). Anything matching that fallback signature must be deleted, not committed.

- [ ] **Step 5: Commit (only if files changed)**

```bash
git add scripts/fetch-droid-art.mjs app/static/assets/droids
git commit -m "feat(art): probe the Galactic tier and self-host CHOPPER art

Content-verified: droidtrakr answers 200 with a ~13 KB SPA HTML body for
missing assets, so the fetch classifies by RIFF/WEBP magic, never by status."
```

If nothing but the script changed, commit the script alone with `chore(art): probe the Galactic tier in the art fetch` and record in the PR body that upstream still publishes no Galactic art.

---

## Task C5 [sonnet]: Refresh the asset manifest to the 380-file universe

**Files:**
- Modify: `docs/asset-manifest.json`

**Interfaces:**
- The required universe is **380** files: 62 non-Iconic droids × 6 tiers (372) + 8 Iconic droids × 1 (8). `categories[0].files` enumerates the files **present on disk** (today's 317 entries equal `ls app/static/assets/droids` exactly) — keep that invariant.

- [ ] **Step 1: Rebuild the manifest's droid-art category from disk + seed data**

Run from the repo root:

```bash
python3 - <<'PY'
import json, os
root = '.'
seed = json.load(open('app/drizzle/seed-data.json'))
man = json.load(open('docs/asset-manifest.json'))
norm = lambda n: ''.join(c for c in n.upper() if c.isalnum())
meta = {d['name']: d for d in seed['droids']}
tiers = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar', 'Galactic']
required = []
for d in seed['droids']:
    for t in (['Base'] if d['rarity'] == 'Iconic' else tiers):
        required.append((d['name'], t))
by_file = {f"{norm(n)}_{'Default' if t == 'Base' else t}.webp": (n, t) for n, t in required}
on_disk = sorted(os.listdir('app/static/assets/droids'))
unknown = [f for f in on_disk if f not in by_file]
assert not unknown, f'files on disk outside the required universe: {unknown}'
cat = man['categories'][0]
cat['files'] = [{
    'filename': f, 'droid': by_file[f][0], 'normName': norm(by_file[f][0]), 'tier': by_file[f][1],
    'rarity': meta[by_file[f][0]]['rarity'], 'type': meta[by_file[f][0]]['type'],
    'remoteUrl': cat['remoteBaseUrl'] + f, 'localTarget': 'app/static/assets/droids/' + f
} for f in on_disk]
cat['count'] = len(required)
cat['grid'] = '62 tiered droids x 6 tiers (Base, Gold, Diamond, Rainbow, Beskar, Galactic) + 8 Iconic droids x 1 (Iconics are single-tier)'
man['summary']['totalRequiredFiles'] = len(required)
json.dump(man, open('docs/asset-manifest.json', 'w'), indent=2)
open('docs/asset-manifest.json', 'a').write('\n')
print('required', len(required), 'present', len(on_disk), 'missing', len(required) - len(on_disk))
PY
```

Expected: `required 380 present <N> missing <380-N>` where `<N>` is the count from Task C4 Step 3. The assertion protects against a stray file — if it fires, investigate rather than deleting.

- [ ] **Step 2: Update the prose fields by hand**

In `docs/asset-manifest.json`, using the real numbers from Step 1:
- `meta.generated` → today's date (`2026-08-03` or later — use `date +%F`).
- `meta.purpose` → replace the "379 files incl. Galactic … 317/379" sentence with the 380/`<N>` numbers and CHOPPER's addition.
- `categories[0].status` and `summary.categories[0].status` → `"self-hosted <N>/380: …"` stating what remains outstanding and why (still no upstream source for Galactic, if C4 found none).
- `categories[0].notes` → keep the Iconic single-tier explanation, add CHOPPER to the Iconic list, and drop the stale "Sole gap: R2D2_Default.webp" sentence (that gap closed in PR #11).
- `categories[0].verified` → a new `date` and a `note` recording exactly what Task C4 observed (which names were probed, what droidtrakr returned, whether the 13085-byte fallback signature still appears).

- [ ] **Step 3: Validate the JSON and the invariant**

```bash
python3 -c "
import json, os
m = json.load(open('docs/asset-manifest.json'))
files = [f['filename'] for f in m['categories'][0]['files']]
disk = sorted(os.listdir('app/static/assets/droids'))
assert files == disk, 'manifest files must equal what is on disk'
assert m['categories'][0]['count'] == 380 == m['summary']['totalRequiredFiles']
print('ok', len(files), 'of', m['categories'][0]['count'])
"
```

Expected: `ok <N> of 380`.

- [ ] **Step 4: Commit**

```bash
git add docs/asset-manifest.json
git commit -m "docs: refresh asset manifest to the 380-file universe (+CHOPPER)"
```

---

## Task C6 [sonnet]: Full verification + open PR C

- [ ] **Step 1: Run every suite**

```bash
cd app
npm run check && npm run test:unit && npm run test:int && npm run test:routes && npm run test:e2e
```

Expected: all green.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/crafting-surfaces
gh pr create --title "Crafting surfaces: planner craft times, companion reference, art + manifest" --body "$(cat <<'EOF'
## What

- `/planner`: base (unbuffed) craft time per planned need, plus a per-cycle total defined as Σ(base craft time × crafts still outstanding this cycle). Needs with no published time are surfaced as a separate count rather than silently dropped.
- `/droids`: three companion-buff reference tables (Worker %, Astromech +pickaxe, Battle +max health; Iconic rows N/A) and the eight iconic companion effects.
- Art: the fetch script now probes the Galactic tier; CHOPPER art attempted. Availability is judged by RIFF/WEBP magic, never by HTTP status — droidtrakr answers 200 with a ~13 KB SPA HTML body for missing assets.
- `docs/asset-manifest.json` refreshed to the 380-file universe (62 x 6 + 8 Iconic) with the stale meta fields corrected.

## Out of scope

Companion-buff math in the planner and any loadout feature — buffs are reference display only.

## Tests

Unit: craft lookup, H:MM:SS formatting (hours uncapped), per-cycle totals with owned/unknown handling. e2e: planner renders per-need times and a moving total.
EOF
)"
```

- [ ] **Step 3: Review and merge**

Use `superpowers:requesting-code-review`, then squash-merge to `main`. If PR B merged first, rebase on `main` and re-run the suites before merging — both PRs touch `src/routes/droids/+page.svelte`.

---

# PHASE D — Repo hygiene (direct, no PR)

## Task D1 [sonnet]: Verify and clean stale worktrees and merged branches

**Files:** none — repository state only.

**Important:** at the time this plan was written, `git branch` in `/Users/jason/Projects/DroidTycoon/droid-tycoon-tracker` showed only `main` and `worktree-patch-content-update`, and `git worktree list` showed only the main checkout and `patch-content-update`. **The 15 branches and the three mismatched worktree directories described in the design are already gone.** Treat this task as verification with conditional cleanup — do not "restore" anything to delete it, and never delete a branch that verification says is unmerged.

- [ ] **Step 1: Inventory the current state**

```bash
cd /Users/jason/Projects/DroidTycoon/droid-tycoon-tracker
git worktree list
git branch -vv
ls -la .claude/worktrees/ 2>/dev/null
```

Record the output. If the only entries are `main`, the PR branches from this update, and the `patch-content-update` worktree, Steps 2–4 are no-ops — go to Step 5.

- [ ] **Step 2: Remove stale worktrees, resolving by branch not directory name**

Three directories historically held a branch other than their name suggested (`standalone-planner-deploy` → `feat/authentik-oidc-sso`, `oidc-sso-partb` → `feat/oidc-callback-hardening`, `platform-impl` → `hardening`), so always read the branch from `git worktree list` before acting. For each stale worktree still listed:

```bash
git worktree remove <path>
```

Only `planner-colored-names` (dirty with ~13 MB of superseded untracked scratch, verified against `main`) is authorized for:

```bash
git worktree remove --force .claude/worktrees/planner-colored-names
```

Then:

```bash
git worktree prune
git worktree list
```

- [ ] **Step 3: Confirm each branch is merged before deleting it**

```bash
for b in design-handoff feat/authentik-oidc-sso feat/authentik-oidc-sso-partb feat/oidc-callback-hardening \
         feat/planner-per-cycle-inventory worktree-asset-manifest worktree-mythic-chip-costs \
         worktree-post-galactic-followups worktree-r2d2-art worktree-standalone-planner-deploy \
         droid-art-thumbnails hardening worktree-game-data-handoff worktree-planner-colored-names \
         worktree-tracker-redesign-spec; do
  if git show-ref --verify --quiet "refs/heads/$b"; then
    if git merge-base --is-ancestor "$b" origin/main; then echo "MERGED   $b"; else echo "UNMERGED $b"; fi
  else
    echo "ABSENT   $b"
  fi
done
```

Expected today: `ABSENT` for all 15. Delete only the ones reported `MERGED`; report any `UNMERGED` to Jason and stop rather than forcing.

- [ ] **Step 4: Delete the merged branches**

```bash
git branch -d <each MERGED branch>
```

Use `-d` (not `-D`) so git refuses anything that is not actually merged.

- [ ] **Step 5: Clean up this update's own branches after all three PRs merge**

```bash
git checkout main && git pull --ff-only
git fetch --prune
for b in feat/patch-sync-foundation feat/flawless-ownership feat/crafting-surfaces; do
  git merge-base --is-ancestor "$b" origin/main 2>/dev/null && git branch -d "$b"
done
```

Note the squash-merge gotcha: a squash-merged branch is **not** an ancestor of `main`, so `-d` will refuse it and `--is-ancestor` returns false. Verify content equivalence instead before using `-D`:

```bash
git diff --stat origin/main <branch>   # empty output = fully contained in main
```

Empty diff → safe to `git branch -D <branch>`. Non-empty → stop and report.

- [ ] **Step 6: Report the final state**

```bash
git worktree list && git branch -vv && git status --short
```

Report what was removed, what was already gone, and anything left standing with the reason.

---

## Done criteria

- PRs A, B and C squash-merged to `origin/main`, in that dependency order.
- `npm run check`, `test:unit`, `test:int`, `test:routes`, `test:e2e` green on `main` after each merge.
- `app/drizzle/seed-data.json` carries 70 droids, 175 nova shop rows, 420 crafting times, 108 companion buffs, 8 iconic effects, RB30 nova 254, Mythic chips 4000/8000/20000/40000/70000, Galactic flawless 1/75, 65 cosmetics.
- Migration journal ends at `0004_*` with exactly five entries.
- `docs/asset-manifest.json` states a 380-file universe with a present count matching `ls app/static/assets/droids`.
- No stale worktrees; no merged-but-undeleted local branches.
