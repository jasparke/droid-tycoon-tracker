# Spreadsheet Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually-triggered, human-gated pipeline that ingests the community Google Sheet into the app's reference zone, previewing every change as a diff and applying it atomically.

**Architecture:** Pure per-tab CSV parsers + normalizers produce a canonical normalized payload; validators classify issues as reject/hold/report; a preview stages the server-built payload in `sync_previews`; apply replays only a staged payload (by checksum, with per-hold acknowledgment) inside one truncate-then-insert transaction guarded by an optimistic-concurrency version lock. Everything lives inside the existing SvelteKit app — no new service.

**Tech Stack:** SvelteKit (Node), Postgres 16, Drizzle ORM, postgres.js, Vitest, `csv-parse`.

**Spec:** `docs/superpowers/specs/2026-07-05-spreadsheet-autosync-design.md` (read it first).

## Global Constraints

- **Reference-zone writers only.** Never ingest player state: Droidex checkboxes, cosmetics `OWNED`, `TOTAL COLLECTED`, `counts`, `plans`.
- **All-or-nothing tab ingest.** A fetch/parse/validate failure on any tab aborts the whole preview; no half-read reference zone.
- **Canonical serializer is the single source of truth** for checksum, no-op detection, and diff. Every payload (parser output, DB backfill, seed) is produced by the same `canonical.js`. Equality is compared on the SHA-256 `checksum`, never on raw jsonb.
- **Apply never trusts a client payload.** Apply references a server-staged payload by checksum; unknown checksum → 422. Every hold-class flag must be explicitly acknowledged → else 422.
- **Auth:** any authenticated member (`requireUser(locals)`), same as `GET /api/reference`.
- **Error convention:** throw `ApiError(status, code, message)`; handlers wrapped in `guard(async () => …)`; success via SvelteKit `json(...)`.
- **Sheet id** `1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg`; per-tab CSV: `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>`. Gids: droid-reference `1248391507`, rebirths `0`, cosmetics `547464940`, nova `1548395368`.
- **Tier vocabulary** (`src/lib/game/tiers.ts`): `Base, Gold, Diamond, Rainbow, Beskar`. Tier-word map: `BASE|BASIC|DEFAULT→Base`, `GOLD|DIAMOND|RAINBOW|BESKAR` 1:1.
- **Test commands** (run from `app/`): unit `npm run test:unit` (vitest `src/lib/game`); server/int `npm run test:int` (vitest `src/lib/server --no-file-parallelism`, needs `dtt_test` DB); single file `npx vitest run <path>`. Sync pure-logic tests live under `src/lib/server/sync/` and run in the `test:int` lane (they simply don't touch the DB).

## Deviation from spec (flagged for review)

The spec calls for `data_versions.payload jsonb NOT NULL` with a two-phase backfill. Enforcing NOT NULL cleanly fights the SQL-only startup-migrate flow (the backfill must run *between* two schema steps). **This plan instead adds `payload jsonb` nullable in Drizzle, enforces "every version has a payload" as a code invariant** (all three writers — seed, apply, rollback — set it via the canonical serializer) **plus an integration test that no version is ever written with a null payload, and a one-time backfill script for the legacy prototype row.** Same guarantee, no migration-ordering dance. If Jason wants a hard DB constraint, add `ALTER TABLE data_versions ALTER COLUMN payload SET NOT NULL` to `backfill-payload.mjs` after it fills the legacy row (accepting a documented schema/DB drift).

## File structure

```
app/src/lib/server/sync/
  canonical.js / canonical.d.ts   # deterministic serialize() + checksumOf() — shared with .mjs scripts
  types.ts                        # PayloadTables, Payload, Flag, Diff types
  normalize.ts                    # pure value normalizers (magnitude, income, chips, oneIn, nc, tier word, rarity/type)
  aliases.ts                      # DROID_ALIASES + resolveDroid()
  csv.ts                          # csv-parse/sync wrapper → string[][]
  fetch.ts                        # fetchTabs(): 4 CSV strings, all-or-nothing
  parsers/droidReference.ts       # → droids, droidTiers, chipCosts, droidSellValues, flawlessSpawn
  parsers/rebirths.ts             # → rebirthReqs
  parsers/cosmetics.ts            # → cosmetics
  parsers/novaShop.ts             # → novaShop, rebirthMeta, novaPaintStages
  validate.ts                     # validate(tables, existingCounts) → {rejects, holds, reports}
  diff.ts                         # diffTables(prev, next) → per-table added/removed/changed
  build.ts                        # buildPayload(): fetch→parse→normalize→validate→assemble+checksum
app/src/lib/server/services/sync.ts   # stagePreview, applyPayload, rollback, listVersions
app/src/routes/api/sync/{preview,apply,rollback,versions}/+server.ts
app/drizzle/backfill-payload.mjs      # one-time legacy-row payload fill
app/drizzle/seed.mjs                  # MODIFY: write canonical payload
app/src/lib/server/schema.ts          # MODIFY: new columns + tables
app/src/lib/server/testing/db.ts      # MODIFY: fixtures seed new tables
app/src/lib/server/services/reference.ts  # MODIFY: serve new tables + income_pct/buy_nc
```

---

### Task 1: Schema changes, migration, and test fixtures

**Files:**
- Modify: `app/src/lib/server/schema.ts`
- Modify: `app/src/lib/server/testing/db.ts`
- Create: migration under `app/drizzle/migrations/` (generated)

**Interfaces:**
- Produces: Drizzle tables `droidSellValues`, `flawlessSpawn`, `novaPaintStages`, `syncPreviews`; `droids.incomePct`/`droids.buyNc`; nullable `chipCosts` cost columns; `dataVersions.payload`.

- [ ] **Step 1: Edit `schema.ts`.** Add to the `droids` table and relax/add the rest:

```ts
export const droids = pgTable('droids', {
	name: text('name').primaryKey(),
	rarity: text('rarity').notNull(),
	type: text('type').notNull(),
	incomePct: numeric('income_pct'),      // Iconic %/s (droid-level; Iconics have no tier grid)
	buyNc: integer('buy_nc')                // CB-23's 75 nova-crystal Base cost
});

export const chipCosts = pgTable('chip_costs', {
	rarity: text('rarity').primaryKey(),
	toGold: integer('to_gold'),             // nullable now: Iconic row is all-N/A
	toDiamond: integer('to_diamond'),
	toRainbow: integer('to_rainbow'),
	toBeskar: integer('to_beskar')
});

export const dataVersions = pgTable('data_versions', {
	id: serial('id').primaryKey(),
	ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
	source: text('source').notNull(),
	checksum: text('checksum').notNull(),
	payload: jsonb('payload')               // code-invariant: always written (see plan deviation note)
});

export const droidSellValues = pgTable('droid_sell_values', {
	rarity: text('rarity').notNull(),
	tier: text('tier').notNull(),           // Gold|Diamond|Rainbow|Beskar (no Base column in sheet)
	multiplier: integer('multiplier').notNull()
}, (t) => [primaryKey({ columns: [t.rarity, t.tier] })]);

export const flawlessSpawn = pgTable('flawless_spawn', {
	tier: text('tier').primaryKey(),        // Base|Gold|Diamond|Rainbow|Beskar
	oneIn: integer('one_in').notNull()      // probability = 1/oneIn
});

export const novaPaintStages = pgTable('nova_paint_stages', {
	stage: integer('stage').primaryKey(),   // global ladder: 1→30, 2→120, 3→400
	crystalCost: integer('crystal_cost').notNull()
});

export const syncPreviews = pgTable('sync_previews', {
	checksum: text('checksum').primaryKey(),
	baseVersionId: integer('base_version_id').notNull(),
	payload: jsonb('payload').notNull(),
	flags: jsonb('flags').notNull(),
	builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow()
});
```

Add `numeric` to the `drizzle-orm/pg-core` import at the top of the file.

- [ ] **Step 2: Generate the migration.**

Run: `cd app && npm run db:generate`
Expected: a new `drizzle/migrations/0001_*.sql` adding the columns/tables and dropping the four `chip_costs` NOT NULLs. Inspect it: it must `ADD COLUMN ... payload jsonb` (no NOT NULL), `ALTER COLUMN to_gold DROP NOT NULL` (×4), and `CREATE TABLE` the four new tables.

- [ ] **Step 3: Apply against the test DB and verify.**

Run: `cd app && DATABASE_URL_TEST=postgres://dtt:dtt@localhost:5432/dtt_test node drizzle/migrate.mjs`
(Uses `DATABASE_URL`; set it to the test DB for this check, or run `npm run db:migrate` against dev then re-check.)
Expected: `migrations applied`, no error.

- [ ] **Step 4: Extend `testing/db.ts` fixtures.** In `seedMinimalReference`, extend the truncate list and add rows for the new tables + Iconic-shaped data:

```ts
export async function seedMinimalReference(sql: postgres.Sql) {
	await sql`truncate droids, droid_tiers, rebirth_reqs, chip_costs, rebirth_meta, nova_shop, cosmetics, droid_sell_values, flawless_spawn, nova_paint_stages, sync_previews, data_versions restart identity cascade`;
	await sql`insert into droids (name, rarity, type, income_pct, buy_nc) values
		('MOUSE','Common','Worker',null,null),
		('CB','Common','Astromech',null,null),
		('R2-D2','Iconic','Astromech',25,null),
		('CB-23','Iconic','Astromech',15,75)`;
	await sql`insert into droid_tiers (droid, tier, buy, income, sell) values
		('MOUSE','Base',950,2,665), ('CB','Base',1000,2,700),
		('R2-D2','Base',null,null,null), ('CB-23','Base',null,null,null)`;
	await sql`insert into rebirth_reqs (cycle, rebirth, droid, tier, credits, unlock) values
		(1,1,'CB','Base','10K','Worker Slot'), (1,2,'MOUSE','Gold','150K',null)`;
	await sql`insert into chip_costs (rarity, to_gold, to_diamond, to_rainbow, to_beskar) values
		('Common',5,25,40,80), ('Iconic',null,null,null,null)`;
	await sql`insert into rebirth_meta (rebirth, nova, credit_mult, xp_mult) values (12,11,22,110)`;
	await sql`insert into droid_sell_values (rarity, tier, multiplier) values ('Common','Gold',4), ('Common','Beskar',13)`;
	await sql`insert into flawless_spawn (tier, one_in) values ('Base',1000), ('Beskar',100)`;
	await sql`insert into nova_paint_stages (stage, crystal_cost) values (1,30), (2,120), (3,400)`;
	await sql`insert into data_versions (source, checksum, payload) values ('test-fixture','deadbeef','{}'::jsonb)`;
}
```

- [ ] **Step 5: Update the existing reference test's fixture-count assertions.** The extended fixture now seeds 4 droids and 4 `droid_tiers` (was 2 and 3), so the existing `reference.integration.test.ts` hardcoded assertions break. Update the two lines:

```ts
expect(ref.droids.map((d) => d.name).sort()).toEqual(['CB', 'CB-23', 'MOUSE', 'R2-D2']);
expect(ref.droidTiers.length).toBe(4);
```

Run: `cd app && npx vitest run src/lib/server/services/reference.integration.test.ts`
Expected: PASS (the remaining assertions — chipCosts, rebirthMeta, version — are unaffected).

- [ ] **Step 6: Commit.**

```bash
git add app/src/lib/server/schema.ts app/src/lib/server/testing/db.ts app/src/lib/server/services/reference.integration.test.ts app/drizzle/migrations
git commit -m "feat(sync): schema for reference tables, iconic columns, payload + preview staging"
```

---

### Task 2: Canonical serializer

**Files:**
- Create: `app/src/lib/server/sync/canonical.js`, `app/src/lib/server/sync/canonical.d.ts`
- Test: `app/src/lib/server/sync/canonical.test.ts`

**Interfaces:**
- Produces: `serialize(tables): string` (deterministic JSON), `checksumOf(tables): string` (sha256 hex of `serialize`). Both consumed by `build.ts`, `services/sync.ts`, `seed.mjs`, `backfill-payload.mjs`.

- [ ] **Step 1: Write the failing test** (`canonical.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { serialize, checksumOf } from './canonical.js';

const A = { droids: [{ name: 'B', rarity: 'Rare', type: 'Worker' }, { name: 'A', rarity: 'Common', type: 'Battle' }], chipCosts: [] };
const B = { chipCosts: [], droids: [{ type: 'Battle', rarity: 'Common', name: 'A' }, { rarity: 'Rare', type: 'Worker', name: 'B' }] };

describe('canonical serialize', () => {
	it('is order-independent across keys and array element order (by PK)', () => {
		expect(serialize(A)).toBe(serialize(B));
		expect(checksumOf(A)).toBe(checksumOf(B));
	});
	it('produces a 64-char hex checksum', () => {
		expect(checksumOf(A)).toMatch(/^[0-9a-f]{64}$/);
	});
	it('distinguishes different data', () => {
		const C = { droids: [{ name: 'A', rarity: 'Epic', type: 'Battle' }], chipCosts: [] };
		expect(checksumOf(A)).not.toBe(checksumOf(C));
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/canonical.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `canonical.js`:**

```js
import { createHash } from 'node:crypto';

// Sort key for each reference table = its primary-key tuple.
const PK = {
	droids: ['name'],
	droidTiers: ['droid', 'tier'],
	rebirthReqs: ['cycle', 'rebirth', 'droid', 'tier'],
	chipCosts: ['rarity'],
	rebirthMeta: ['rebirth'],
	novaShop: ['category', 'item', 'level'],
	cosmetics: ['category', 'name'],
	droidSellValues: ['rarity', 'tier'],
	flawlessSpawn: ['tier'],
	novaPaintStages: ['stage']
};

function cmp(a, b, keys) {
	for (const k of keys) {
		const x = a[k], y = b[k];
		if (x < y) return -1;
		if (x > y) return 1;
	}
	return 0;
}

// Deterministic replacer: object keys emitted in sorted order.
function sortValue(v) {
	if (Array.isArray(v)) return v.map(sortValue);
	if (v && typeof v === 'object') {
		const out = {};
		for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
		return out;
	}
	return v;
}

export function serialize(tables) {
	const norm = {};
	for (const name of Object.keys(tables).sort()) {
		const rows = tables[name];
		const keys = PK[name];
		const sorted = keys ? [...rows].sort((a, b) => cmp(a, b, keys)) : rows;
		norm[name] = sorted.map(sortValue);
	}
	return JSON.stringify(norm);
}

export function checksumOf(tables) {
	return createHash('sha256').update(serialize(tables)).digest('hex');
}
```

- [ ] **Step 4: Write `canonical.d.ts`:**

```ts
export function serialize(tables: Record<string, unknown[]>): string;
export function checksumOf(tables: Record<string, unknown[]>): string;
```

- [ ] **Step 5: Run to verify it passes.** Run the same command — Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add app/src/lib/server/sync/canonical.js app/src/lib/server/sync/canonical.d.ts app/src/lib/server/sync/canonical.test.ts
git commit -m "feat(sync): canonical serializer + checksum (single source of truth)"
```

---

### Task 3: Payload types + normalization primitives + aliases

**Files:**
- Create: `app/src/lib/server/sync/types.ts`, `normalize.ts`, `aliases.ts`
- Test: `app/src/lib/server/sync/normalize.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `PayloadTables` (fields: `droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, droidSellValues, flawlessSpawn, novaPaintStages`), `Payload` (`{ meta, tables }`), `Flag` (`{ kind: 'reject'|'hold'|'report'; code: string; message: string; table?: string; key?: string }`), `DiffResult`.
  - `normalize.ts`: `magnitude(s): number`, `income(s): { value: number|null; pct: number|null }`, `chips(s): number|null`, `oneIn(s): number`, `nc(s): number`, `tierWord(s): Tier`, `rarity(s): string`, `dtype(s): string`, `stripSuffix(s, suffix): string`.
  - `aliases.ts`: `DROID_ALIASES: Record<string,string>`, `resolveDroid(name): string`.

- [ ] **Step 1: Write the failing test** (`normalize.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { magnitude, income, chips, oneIn, nc, tierWord, rarity, dtype } from './normalize';
import { resolveDroid } from './aliases';

describe('normalize', () => {
	it('magnitude suffixes (both cases, decimals)', () => {
		expect(magnitude('3.8k')).toBe(3800);
		expect(magnitude('1.06m')).toBe(1_060_000);
		expect(magnitude('2.00T')).toBe(2_000_000_000_000);
		expect(magnitude('228m')).toBe(228_000_000);
	});
	it('income: credits/s vs percentage vs N/A', () => {
		expect(income('4.08k/s')).toEqual({ value: 4080, pct: null });
		expect(income('2/s')).toEqual({ value: 2, pct: null });
		expect(income('15%/s')).toEqual({ value: null, pct: 15 });
		expect(income('N/A')).toEqual({ value: null, pct: null });
	});
	it('chips strips suffix + commas; N/A → null', () => {
		expect(chips('30,000 CHIPS')).toBe(30000);
		expect(chips('5 CHIPS')).toBe(5);
		expect(chips('N/A')).toBeNull();
	});
	it('oneIn / nc / tierWord / rarity / dtype', () => {
		expect(oneIn('1/1000')).toBe(1000);
		expect(nc('75 NC')).toBe(75);
		expect(tierWord('DEFAULT')).toBe('Base');
		expect(tierWord('BASIC')).toBe('Base');
		expect(tierWord('BESKAR')).toBe('Beskar');
		expect(rarity('ICONIC ')).toBe('Iconic');
		expect(dtype('BATTLE')).toBe('Battle');
	});
	it('resolveDroid maps the five known misspellings', () => {
		expect(resolveDroid('MONO-WALKER')).toBe('MONO-WLKR');
		expect(resolveDroid('BB-9')).toBe('BB9');
		expect(resolveDroid('MOUSE')).toBe('MOUSE');
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/normalize.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `aliases.ts`:**

```ts
export const DROID_ALIASES: Record<string, string> = {
	'BB-9': 'BB9',
	'MONO-WALKER': 'MONO-WLKR',
	'MONO-WALKR': 'MONO-WLKR',
	'OPTI-STRIKE': 'OPTI-STRK',
	'MECHA DROID': 'MECHA-DROID'
};

export function resolveDroid(name: string): string {
	const n = name.trim();
	return DROID_ALIASES[n] ?? n;
}
```

- [ ] **Step 4: Implement `normalize.ts`:**

```ts
import type { Tier } from '$lib/game/tiers';

const MAG: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

export function magnitude(s: string): number {
	const t = s.trim().replace(/,/g, '');
	const m = /^(-?\d+(?:\.\d+)?)([kmbt])?$/i.exec(t);
	if (!m) throw new Error(`unparseable magnitude: ${s}`);
	const n = parseFloat(m[1]);
	return m[2] ? Math.round(n * MAG[m[2].toLowerCase()]) : n;
}

export function income(s: string): { value: number | null; pct: number | null } {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return { value: null, pct: null };
	const body = t.replace(/\/s$/i, '');
	if (body.endsWith('%')) return { value: null, pct: parseFloat(body.slice(0, -1)) };
	return { value: magnitude(body), pct: null };
}

export function chips(s: string): number | null {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return null;
	return parseInt(t.replace(/chips/i, '').replace(/,/g, '').trim(), 10);
}

export function oneIn(s: string): number {
	const m = /^\s*\d+\s*\/\s*(\d+)\s*$/.exec(s);
	if (!m) throw new Error(`unparseable probability: ${s}`);
	return parseInt(m[1], 10);
}

export function nc(s: string): number {
	const m = /^\s*(\d+)\s*NC\s*$/i.exec(s);
	if (!m) throw new Error(`unparseable NC cost: ${s}`);
	return parseInt(m[1], 10);
}

const TIER_WORDS: Record<string, Tier> = {
	BASE: 'Base', BASIC: 'Base', DEFAULT: 'Base',
	GOLD: 'Gold', DIAMOND: 'Diamond', RAINBOW: 'Rainbow', BESKAR: 'Beskar'
};
export function tierWord(s: string): Tier {
	const t = TIER_WORDS[s.trim().toUpperCase()];
	if (!t) throw new Error(`unknown tier word: ${s}`);
	return t;
}

export function rarity(s: string): string {
	const t = s.trim().toLowerCase();
	return t.charAt(0).toUpperCase() + t.slice(1);
}
export const dtype = rarity; // same casing rule: BATTLE → Battle
```

- [ ] **Step 5: Implement `types.ts`:**

```ts
import type { Tier } from '$lib/game/tiers';
export type { Tier } from '$lib/game/tiers';   // re-export so sync modules import Tier from '../types'

export interface DroidRow { name: string; rarity: string; type: string; incomePct: number | null; buyNc: number | null; }
export interface DroidTierRow { droid: string; tier: Tier; buy: number | null; income: number | null; sell: number | null; }
export interface RebirthReqRow { cycle: number; rebirth: number; droid: string; tier: Tier; credits: string; unlock: string | null; }
export interface ChipCostRow { rarity: string; toGold: number | null; toDiamond: number | null; toRainbow: number | null; toBeskar: number | null; }
export interface RebirthMetaRow { rebirth: number; nova: number; creditMult: number; xpMult: number; }
export interface NovaShopRow { category: string; item: string; level: number; cost: number; }
export interface CosmeticRow { category: string; name: string; requirement: string; }
export interface SellValueRow { rarity: string; tier: Tier; multiplier: number; }
export interface FlawlessRow { tier: Tier; oneIn: number; }
export interface PaintStageRow { stage: number; crystalCost: number; }

export interface PayloadTables {
	droids: DroidRow[];
	droidTiers: DroidTierRow[];
	rebirthReqs: RebirthReqRow[];
	chipCosts: ChipCostRow[];
	rebirthMeta: RebirthMetaRow[];
	novaShop: NovaShopRow[];
	cosmetics: CosmeticRow[];
	droidSellValues: SellValueRow[];
	flawlessSpawn: FlawlessRow[];
	novaPaintStages: PaintStageRow[];
}

export interface OrphanRow { droid: string; tier: string; profileId: number; }
export interface PayloadMeta {
	source: string; fetchedAt: string;
	tabChecksums: Record<string, string>;
	rowCounts: Record<string, number>;
	orphanReport: OrphanRow[];
}
export interface Payload { meta: PayloadMeta; tables: PayloadTables; }

export type FlagKind = 'reject' | 'hold' | 'report';
export interface Flag { kind: FlagKind; code: string; message: string; table?: string; key?: string; }

export interface RowChange { key: string; before: unknown; after: unknown; }
export interface TableDiff { added: unknown[]; removed: unknown[]; changed: RowChange[]; }
export type DiffResult = Record<string, TableDiff>;
```

- [ ] **Step 6: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add app/src/lib/server/sync/types.ts app/src/lib/server/sync/normalize.ts app/src/lib/server/sync/aliases.ts app/src/lib/server/sync/normalize.test.ts
git commit -m "feat(sync): payload types, normalization primitives, alias map"
```

---

### Task 4: CSV wrapper

**Files:**
- Create: `app/src/lib/server/sync/csv.ts`
- Test: `app/src/lib/server/sync/csv.test.ts`
- Modify: `app/package.json` (add `csv-parse`)

**Interfaces:**
- Produces: `toRows(csv: string): string[][]` — full RFC-4180 parse, preserving embedded newlines inside quoted cells, returning a rectangular-enough matrix (rows are cell arrays; short rows are NOT padded — callers index defensively via `cell(row, i)`), plus `cell(row: string[], i: number): string` returning `''` for out-of-range.

- [ ] **Step 1: Add the dependency.** Run: `cd app && npm i csv-parse` — Expected: `csv-parse` in `dependencies`.

- [ ] **Step 2: Write the failing test** (`csv.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { toRows, cell } from './csv';

describe('csv', () => {
	it('parses rows and preserves embedded newline in a quoted cell', () => {
		const src = 'a,b,c\n1,"two\nlines",3\n';
		const rows = toRows(src);
		expect(rows[0]).toEqual(['a', 'b', 'c']);
		expect(rows[1][1]).toBe('two\nlines');
	});
	it('cell() is safe past the end of a short row', () => {
		expect(cell(['x'], 5)).toBe('');
		expect(cell(['x', 'y'], 1)).toBe('y');
	});
});
```

- [ ] **Step 3: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/csv.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement `csv.ts`:**

```ts
import { parse } from 'csv-parse/sync';

export function toRows(csv: string): string[][] {
	return parse(csv, { relax_column_count: true, skip_empty_lines: false }) as string[][];
}

export function cell(row: string[], i: number): string {
	return i < row.length ? row[i] : '';
}
```

- [ ] **Step 5: Run to verify it passes.** Run the Step-3 command — Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add app/src/lib/server/sync/csv.ts app/src/lib/server/sync/csv.test.ts app/package.json app/package-lock.json
git commit -m "feat(sync): CSV wrapper (embedded-newline-safe) + csv-parse dep"
```

---

### Task 5: Parser — droid reference tab

Feeds `droids`, `droidTiers`, `chipCosts`, `droidSellValues`, `flawlessSpawn` from gid `1248391507`. Header row at CSV index 2. Left grid: col0 rarity (sparse, section label), col1 name, col2 type, cols 3/4/5 Base buy/income/value, 6/7/8 Gold, 9/10/11 Diamond, 12/13/14 Rainbow, 15/16/17 Beskar. Iconic droids: cost `N/A` or `75 NC`, income `%/s`, tier cols blank → 5 all-null `droidTiers` rows + droid-level `incomePct`/`buyNc`. Right stack (col19 label, 20–23 values): chip costs rows 3–8 (Iconic all-N/A), sell value rows 12–17 (header `RARITY|GOLD|DIAMOND|RAINBOW|BESKAR`, Iconic N/A → skip), flawless row 21 under header row 20 (`DEFAULT|GOLD|DIAMOND|RAINBOW|BESKAR`).

**Files:**
- Create: `app/src/lib/server/sync/parsers/droidReference.ts`
- Test: `app/src/lib/server/sync/parsers/droidReference.test.ts`

**Interfaces:**
- Consumes: `toRows`, `cell`, normalize helpers, `resolveDroid`, `TIERS`.
- Produces: `parseDroidReference(csv: string): { droids, droidTiers, chipCosts, droidSellValues, flawlessSpawn }` (each an array of the matching `types.ts` row type). Throws `Error` on a failed header anchor.

- [ ] **Step 1: Write the failing test** with a trimmed fixture exercising a Mythic droid, the corrupt-shaped `IG`, an Iconic with `%/s`, CB-23's `75 NC`, chip comma-thousands, and the sell/flawless blocks. (Left grid cols 0–17 and right stack cols 19–23 share rows; the fixture below is a 4-cell-per-region matrix built as CSV.)

```ts
import { describe, it, expect } from 'vitest';
import { parseDroidReference } from './droidReference';

// rows: 0 banner, 1 section titles, 2 header, 3+ data. 24 columns.
// Left header @row2 cols0-17; right stack labels @rows1-2 col19+.
function row(cells: Record<number, string>): string {
	const a = Array(24).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR', 19: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 19: 'UPGRADE COSTS' }),
	row({ 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'COST', 4: 'INCOME', 5: 'VALUE',
	      19: 'RARITY', 20: 'BASE -> GOLD', 21: 'GOLD -> DIAMOND', 22: 'DIAMOND -> RAINBOW', 23: 'RAINBOW -> BESKAR' }),
	row({ 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '950', 4: '2/s', 5: '665',
	      6: '3.8k', 7: '8/s', 8: '2.66k', 19: 'COMMON', 20: '5 CHIPS', 21: '25 CHIPS', 22: '40 CHIPS', 23: '80 CHIPS' }),
	row({ 1: 'IG', 2: 'BATTLE', 3: '228m', 4: '5.80k/s', 5: '239.40m',
	      6: '1.37b', 7: '23.2k/s', 8: '959.00m', 19: 'MYTHIC', 20: '6000 CHIPS', 21: '13000 CHIPS', 22: '30,000 CHIPS', 23: '75,000 CHIPS' }),
	row({ 19: 'ICONIC', 20: 'N/A', 21: 'N/A', 22: 'N/A', 23: 'N/A' }),
	row({ 19: '' }),
	row({ 19: 'DROID SELL VALUE' }),
	row({ 0: 'ICONIC ', 1: 'CB-23', 2: 'ASTROMECH', 3: '75 NC', 4: '15%/s', 5: '',
	      19: 'RARITY', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row({ 1: 'R2-D2', 2: 'ASTROMECH', 3: 'N/A', 4: '25%/s', 19: 'COMMON', 20: '4', 21: '7', 22: '10', 23: '13' }),
	row({ 19: 'ICONIC', 20: 'N/A', 21: 'N/A', 22: 'N/A', 23: 'N/A' }),
	row({ 19: '' }),
	row({ 19: 'FLAWLESS SPAWN PROBABILITY' }),
	row({ 19: 'DEFAULT', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row({ 19: '1/1000', 20: '1/500', 21: '1/250', 22: '1/125', 23: '1/100' })
].join('\n');

describe('parseDroidReference', () => {
	const out = parseDroidReference(csv);
	it('parses non-iconic droid + tiers with magnitude scaling', () => {
		expect(out.droids.find((d) => d.name === 'MOUSE')).toMatchObject({ rarity: 'Common', type: 'Worker', incomePct: null, buyNc: null });
		const ig = out.droidTiers.filter((t) => t.droid === 'IG');
		expect(ig.find((t) => t.tier === 'Base')).toMatchObject({ buy: 228_000_000, income: 5800, sell: 239_400_000 });
		expect(ig.find((t) => t.tier === 'Gold')).toMatchObject({ buy: 1_370_000_000 });
	});
	it('iconic: percentage income → droid-level, 75 NC → buyNc, tier rows all null', () => {
		expect(out.droids.find((d) => d.name === 'CB-23')).toMatchObject({ rarity: 'Iconic', incomePct: 15, buyNc: 75 });
		expect(out.droids.find((d) => d.name === 'R2-D2')).toMatchObject({ incomePct: 25, buyNc: null });
		const cbTiers = out.droidTiers.filter((t) => t.droid === 'CB-23');
		expect(cbTiers).toHaveLength(5);
		expect(cbTiers.every((t) => t.buy === null && t.income === null && t.sell === null)).toBe(true);
	});
	it('chip costs incl. Iconic all-null row and comma thousands', () => {
		expect(out.chipCosts.find((c) => c.rarity === 'Mythic')).toMatchObject({ toGold: 6000, toDiamond: 13000, toRainbow: 30000, toBeskar: 75000 });
		expect(out.chipCosts.find((c) => c.rarity === 'Iconic')).toMatchObject({ toGold: null, toBeskar: null });
	});
	it('sell values (4 tiers, no Base; Iconic skipped) + flawless (5 tiers, DEFAULT→Base)', () => {
		expect(out.droidSellValues.filter((s) => s.rarity === 'Common')).toEqual([
			{ rarity: 'Common', tier: 'Gold', multiplier: 4 },
			{ rarity: 'Common', tier: 'Diamond', multiplier: 7 },
			{ rarity: 'Common', tier: 'Rainbow', multiplier: 10 },
			{ rarity: 'Common', tier: 'Beskar', multiplier: 13 }
		]);
		expect(out.droidSellValues.some((s) => s.rarity === 'Iconic')).toBe(false);
		expect(out.flawlessSpawn).toEqual([
			{ tier: 'Base', oneIn: 1000 }, { tier: 'Gold', oneIn: 500 }, { tier: 'Diamond', oneIn: 250 },
			{ tier: 'Rainbow', oneIn: 125 }, { tier: 'Beskar', oneIn: 100 }
		]);
	});
	it('rejects when a header anchor moved', () => {
		const broken = csv.replace('RARITY,DROID,TYPE', 'RARITY,NAME,TYPE');
		expect(() => parseDroidReference(broken)).toThrow(/header/i);
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/parsers/droidReference.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `droidReference.ts`.** Anchor headers, then read fixed offsets. Iconic detection = income cell ends with `%`.

```ts
import { toRows, cell } from '../csv';
import { magnitude, income, chips, oneIn, rarity as normRarity, dtype, tierWord } from '../normalize';
import { resolveDroid } from '../aliases';
import { TIERS, type Tier } from '$lib/game/tiers';
import type { DroidRow, DroidTierRow, ChipCostRow, SellValueRow, FlawlessRow } from '../types';

const TIER_COLS: Record<Tier, [number, number, number]> = {
	Base: [3, 4, 5], Gold: [6, 7, 8], Diamond: [9, 10, 11], Rainbow: [12, 13, 14], Beskar: [15, 16, 17]
};

function assertHeader(cond: boolean, what: string): void {
	if (!cond) throw new Error(`droid-reference header anchor failed: ${what}`);
}
function numOrNull(s: string): number | null {
	const t = s.trim();
	return !t || t.toUpperCase() === 'N/A' ? null : magnitude(t);
}

export function parseDroidReference(csv: string) {
	const r = toRows(csv);
	const h = r[2];
	assertHeader(cell(h, 0) === 'RARITY' && cell(h, 1) === 'DROID' && cell(h, 2) === 'TYPE', 'left grid RARITY,DROID,TYPE');

	const droids: DroidRow[] = [];
	const droidTiers: DroidTierRow[] = [];
	let curRarity = '';
	for (let i = 3; i < r.length; i++) {
		const row = r[i];
		const name = cell(row, 1).trim();
		if (!name) continue;               // separator / right-stack-only row
		if (cell(row, 0).trim()) curRarity = normRarity(cell(row, 0));
		const inc = income(cell(row, 4));
		const iconic = inc.pct !== null;
		const buyRaw = cell(row, 3).trim();
		droids.push({
			name, rarity: curRarity, type: dtype(cell(row, 2)),
			incomePct: inc.pct,
			buyNc: /NC/i.test(buyRaw) ? parseInt(buyRaw, 10) : null
		});
		for (const tier of TIERS) {
			if (iconic) { droidTiers.push({ droid: name, tier, buy: null, income: null, sell: null }); continue; }
			const [cB, cI, cV] = TIER_COLS[tier];
			droidTiers.push({
				droid: name, tier,
				buy: numOrNull(cell(row, cB)),
				income: income(cell(row, cI)).value,
				sell: numOrNull(cell(row, cV))
			});
		}
	}

	// Right stack — locate the three labeled blocks by their header labels.
	const chipCosts: ChipCostRow[] = [];
	const droidSellValues: SellValueRow[] = [];
	const flawlessSpawn: FlawlessRow[] = [];
	const label = (i: number) => cell(r[i] ?? [], 19).trim();
	for (let i = 0; i < r.length; i++) {
		if (label(i) === 'RARITY' && cell(r[i], 20) === 'BASE -> GOLD') {
			for (let j = i + 1; j < r.length && cell(r[j], 19).trim(); j++) {
				const rar = normRarity(cell(r[j], 19));
				chipCosts.push({ rarity: rar, toGold: chips(cell(r[j], 20)), toDiamond: chips(cell(r[j], 21)), toRainbow: chips(cell(r[j], 22)), toBeskar: chips(cell(r[j], 23)) });
			}
		}
		if (label(i) === 'RARITY' && cell(r[i], 20) === 'GOLD') {
			const tiers: Tier[] = ['Gold', 'Diamond', 'Rainbow', 'Beskar'];
			for (let j = i + 1; j < r.length && cell(r[j], 19).trim(); j++) {
				const rar = normRarity(cell(r[j], 19));
				tiers.forEach((tier, k) => {
					const v = chips(cell(r[j], 20 + k)); // reuse N/A→null + int parse (no CHIPS suffix here, plain ints)
					if (v !== null) droidSellValues.push({ rarity: rar, tier, multiplier: v });
				});
			}
		}
		if (label(i) === 'DEFAULT' && cell(r[i], 20) === 'GOLD') {
			const tiers: Tier[] = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar'];
			const vals = r[i + 1];
			tiers.forEach((tier, k) => flawlessSpawn.push({ tier, oneIn: oneIn(cell(vals, 19 + k)) }));
		}
	}
	assertHeader(chipCosts.length > 0, 'UPGRADE COSTS block found');
	assertHeader(flawlessSpawn.length === 5, 'FLAWLESS SPAWN block found');
	return { droids, droidTiers, chipCosts, droidSellValues, flawlessSpawn };
}
```

Note: `chips()` doubles as the plain-int parser for sell values (no `CHIPS` suffix present → the `.replace(/chips/i,'')` is a no-op; commas stripped; `N/A`→null). Header anchor for the sell block is `RARITY|GOLD`; for chip block `RARITY|BASE -> GOLD`; for flawless `DEFAULT|GOLD`.

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/sync/parsers/droidReference.ts app/src/lib/server/sync/parsers/droidReference.test.ts
git commit -m "feat(sync): droid-reference parser (droids, tiers, chips, sell values, flawless)"
```

---

### Task 6: Parser — rebirths tab

Feeds `rebirthReqs` from gid `0`. Header at CSV index 1. Four cycle blocks read vertically and independently, keyed by an `N->M` transition marker. Columns per cycle: cycle1 transition=10 credits=11 reqDroid=12 reqRarity=13 unlock=14 flawless=15; cycle2 17/18/19/20/–/21; cycle3 23/24/25/26/–/27; cycle4 29/30/31/32/–/33. Each transition groups exactly 3 req-droid cells; `credits`/`unlock` appear only on the first of the 3. Req-droid cell = `"<TIERWORD> <DROIDNAME>"`. Credits kept as display text (strip trailing ` CREDITS`). Droidex checklist (cols 0–8) and `TOTAL COLLECTED` are player state → ignored.

**Files:**
- Create: `app/src/lib/server/sync/parsers/rebirths.ts`
- Test: `app/src/lib/server/sync/parsers/rebirths.test.ts`

**Interfaces:**
- Produces: `parseRebirths(csv: string): { rebirthReqs: RebirthReqRow[] }`. Splits each req cell into `{ tier, droid }` via `tierWord` + `resolveDroid`. Throws on an unsplittable cell.

- [ ] **Step 1: Write the failing test** (fixture: cycle-1 transition `0->1` with 3 reqs, credits+unlock on the first):

```ts
import { describe, it, expect } from 'vitest';
import { parseRebirths } from './rebirths';

function row(cells: Record<number, string>): string {
	const a = Array(34).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.join(',');
}
const csv = [
	row({ 10: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 10: 'REBIRTH REQUIRMENTS', 11: 'CREDITS', 12: 'DROID', 13: 'RARITY', 14: 'UNLOCKS', 15: 'FLAWLESS',
	      17: 'REBIRTH REQUIRMENTS', 18: 'CREDITS', 19: 'DROID', 20: 'RARITY', 21: 'FLAWLESS' }),
	row({ 10: '0->1', 11: '10K CREDITS', 12: 'BASIC CB', 13: 'COMMON', 14: 'Worker Slot',
	      17: '0->1', 18: '12K CREDITS', 19: 'GOLD R9', 20: 'RARE' }),
	row({ 12: 'BASIC MOUSE', 19: 'BASIC BB-9' }),
	row({ 12: 'GOLD MONO-WALKER', 19: 'DEFAULT TRI-TEK' })
].join('\n');

describe('parseRebirths', () => {
	const out = parseRebirths(csv).rebirthReqs;
	it('emits 3 reqs per transition, credits+unlock only on first, tier+alias resolved', () => {
		const c1 = out.filter((r) => r.cycle === 1 && r.rebirth === 1);
		expect(c1).toEqual([
			{ cycle: 1, rebirth: 1, droid: 'CB', tier: 'Base', credits: '10K', unlock: 'Worker Slot' },
			{ cycle: 1, rebirth: 1, droid: 'MOUSE', tier: 'Base', credits: '10K', unlock: null },
			{ cycle: 1, rebirth: 1, droid: 'MONO-WLKR', tier: 'Gold', credits: '10K', unlock: null }
		]);
	});
	it('cycle 2 has no unlock column; DEFAULT→Base; BB-9 alias', () => {
		const c2 = out.filter((r) => r.cycle === 2 && r.rebirth === 1);
		expect(c2.map((r) => [r.droid, r.tier])).toEqual([['R9', 'Gold'], ['BB9', 'Base'], ['TRI-TEK', 'Base']]);
		expect(c2.every((r) => r.unlock === null)).toBe(true);
		expect(c2[0].credits).toBe('12K');
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/parsers/rebirths.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `rebirths.ts`:**

```ts
import { toRows, cell } from '../csv';
import { tierWord } from '../normalize';
import { resolveDroid } from '../aliases';
import type { RebirthReqRow, Tier } from '../types';

interface CycleCols { cycle: number; trans: number; credits: number; req: number; unlock: number | null; }
const CYCLES: CycleCols[] = [
	{ cycle: 1, trans: 10, credits: 11, req: 12, unlock: 14 },
	{ cycle: 2, trans: 17, credits: 18, req: 19, unlock: null },
	{ cycle: 3, trans: 23, credits: 24, req: 25, unlock: null },
	{ cycle: 4, trans: 29, credits: 30, req: 31, unlock: null }
];

function splitReq(s: string): { tier: Tier; droid: string } {
	const t = s.trim();
	const sp = t.indexOf(' ');
	if (sp < 0) throw new Error(`unsplittable req cell: ${s}`);
	return { tier: tierWord(t.slice(0, sp)), droid: resolveDroid(t.slice(sp + 1)) };
}
function stripCredits(s: string): string {
	return s.trim().replace(/\s*CREDITS$/i, '').trim();
}

export function parseRebirths(csv: string): { rebirthReqs: RebirthReqRow[] } {
	const r = toRows(csv);
	const out: RebirthReqRow[] = [];
	for (const c of CYCLES) {
		let rebirth = 0;
		for (let i = 2; i < r.length; i++) {
			const trans = cell(r[i], c.trans).trim();
			const m = /^(\d+)->(\d+)$/.exec(trans);
			if (m) {
				rebirth = parseInt(m[2], 10);
				const credits = stripCredits(cell(r[i], c.credits));
				const unlock = c.unlock !== null ? (cell(r[i], c.unlock).trim() || null) : null;
				// group of exactly 3: this row + next 2
				for (let g = 0; g < 3; g++) {
					const reqCell = cell(r[i + g], c.req).trim();
					if (!reqCell) continue;
					const { tier, droid } = splitReq(reqCell);
					out.push({ cycle: c.cycle, rebirth, droid, tier, credits, unlock: g === 0 ? unlock : null });
				}
			}
		}
	}
	return { rebirthReqs: out };
}
```

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS. (Cycle column offsets are from groundwork §1; the header-anchor + 324-count asserts in Task 11 catch any live-sheet drift loudly.)

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/sync/parsers/rebirths.ts app/src/lib/server/sync/parsers/rebirths.test.ts
git commit -m "feat(sync): rebirths parser (4 cycles, tier+alias split, text credits)"
```

---

### Task 7: Parser — cosmetics tab

Feeds `cosmetics` from gid `547464940`. Block labels at CSV index 1 (`HATS` col0, `BASE PAINTS` col4, `DROID EFFECTS` col8); sub-headers at index 2 (`HAT|REQUIREMENTS|OWNED`, etc.); data from index 3. `OWNED` (cols 2/6/10) is player state → ignored. Category = title-cased block label. Name verbatim (quirks like `RED PAINT (DEFAULT` preserved).

**Files:**
- Create: `app/src/lib/server/sync/parsers/cosmetics.ts`
- Test: `app/src/lib/server/sync/parsers/cosmetics.test.ts`

**Interfaces:**
- Produces: `parseCosmetics(csv: string): { cosmetics: CosmeticRow[] }`. Categories exactly `{Hats, Base Paints, Droid Effects}`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { parseCosmetics } from './cosmetics';

function row(cells: Record<number, string>): string {
	const a = Array(11).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 0: 'HATS', 4: 'BASE PAINTS', 8: 'DROID EFFECTS' }),
	row({ 0: 'HAT', 1: 'REQUIREMENTS', 2: 'OWNED', 4: 'PAINT', 5: 'REQUIREMENTS', 6: 'OWNED', 8: 'EFFECT', 9: 'REQUIREMENTS', 10: 'OWNED' }),
	row({ 0: 'F1l-ON1', 1: 'FIND IN WORLD', 2: 'FALSE', 4: 'RED PAINT (DEFAULT', 5: 'NONE', 6: 'FALSE', 8: 'GROOVY AURA', 9: 'DJ R-3X EVENT', 10: 'FALSE' }),
	row({ 0: 'CONE OF CORUCANT', 1: 'FIND IN WORLD', 2: 'FALSE', 4: 'YELLOW PAINT', 5: 'NONE', 6: 'FALSE' })
].join('\n');

describe('parseCosmetics', () => {
	const out = parseCosmetics(csv).cosmetics;
	it('splits the three blocks, drops OWNED, title-cases category', () => {
		expect(out).toContainEqual({ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' });
		expect(out).toContainEqual({ category: 'Base Paints', name: 'RED PAINT (DEFAULT', requirement: 'NONE' });
		expect(out).toContainEqual({ category: 'Droid Effects', name: 'GROOVY AURA', requirement: 'DJ R-3X EVENT' });
		expect(out.filter((c) => c.category === 'Hats')).toHaveLength(2);
		expect(out.filter((c) => c.category === 'Droid Effects')).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/parsers/cosmetics.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `cosmetics.ts`:**

```ts
import { toRows, cell } from '../csv';
import type { CosmeticRow } from '../types';

const BLOCKS = [
	{ label: 'HATS', category: 'Hats', nameCol: 0, reqCol: 1 },
	{ label: 'BASE PAINTS', category: 'Base Paints', nameCol: 4, reqCol: 5 },
	{ label: 'DROID EFFECTS', category: 'Droid Effects', nameCol: 8, reqCol: 9 }
];

export function parseCosmetics(csv: string): { cosmetics: CosmeticRow[] } {
	const r = toRows(csv);
	for (const b of BLOCKS) {
		if (cell(r[1], b.nameCol).trim().toUpperCase() !== b.label) {
			throw new Error(`cosmetics header anchor failed: expected ${b.label} at col ${b.nameCol}`);
		}
	}
	const out: CosmeticRow[] = [];
	for (const b of BLOCKS) {
		for (let i = 3; i < r.length; i++) {
			const name = cell(r[i], b.nameCol).trim();
			if (!name) continue;
			out.push({ category: b.category, name, requirement: cell(r[i], b.reqCol).trim() });
		}
	}
	return { cosmetics: out };
}
```

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/sync/parsers/cosmetics.ts app/src/lib/server/sync/parsers/cosmetics.test.ts
git commit -m "feat(sync): cosmetics parser (3 blocks → Hats/Base Paints/Droid Effects)"
```

---

### Task 8: Parser — nova shop tab

Feeds `novaShop`, `rebirthMeta`, `novaPaintStages` from gid `1548395368`. A quoted cell with an embedded newline sits in col 29 — the CSV parser (Task 4) already handles it. Regions: core upgrades col0 LEVEL + items cols 1–9; workshop col11 LEVEL + items 12–20; paint stages col22 LEVEL + col23 cost (rows: `1→30, 2→120, 3→400`); rebirth-meta cols 29–32 (header `RB LEVEL|CRYSTAL QUANTITY|CREDIT MULT|XP MULT` at index 6, data from index 7: `RB 12 | 11 NOVA CRYSTALS | 22% | 110%`). Nova-shop item names are on the logical header row (index 3); each column's per-level cost runs down until a blank cell.

**Files:**
- Create: `app/src/lib/server/sync/parsers/novaShop.ts`
- Test: `app/src/lib/server/sync/parsers/novaShop.test.ts`

**Interfaces:**
- Produces: `parseNovaShop(csv: string): { novaShop: NovaShopRow[]; rebirthMeta: RebirthMetaRow[]; novaPaintStages: PaintStageRow[] }`.

- [ ] **Step 1: Write the failing test** (covers paint stages, rebirth-meta with the embedded-newline neighbor cell, and one core-upgrade ladder):

```ts
import { describe, it, expect } from 'vitest';
import { parseNovaShop } from './novaShop';

function row(cells: Record<number, string>): string {
	const a = Array(33).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 22: 'NOVA SHOP - COSMETICS' }),
	row({ 22: 'NOVA CRYSTAL COST', 29: 'INFORMATION' }),
	row({ 0: 'LEVEL', 1: 'Income Boost', 22: 'LEVEL', 23: 'NOVA CRYSTAL BASE PAINT', 29: 'There is now 4 different rebirth\nrequirement paths.' }),
	row({ 0: '1', 1: '50', 22: '1', 23: '30' }),
	row({ 0: '2', 1: '120', 22: '2', 23: '120', 29: 'NOVA CRYSTALS/RB LEVEL' }),
	row({ 0: '3', 1: '', 22: '3', 23: '400', 29: 'RB LEVEL', 30: 'CRYSTAL QUANTITY', 31: 'CREDIT MULT', 32: 'XP MULT' }),
	row({ 29: 'RB 12', 30: '11 NOVA CRYSTALS', 31: '22%', 32: '110%' }),
	row({ 29: 'RB 13', 30: '16 NOVA CRYSTALS', 31: '32%', 32: '160%' })
].join('\n');

describe('parseNovaShop', () => {
	const out = parseNovaShop(csv);
	it('paint stages = global 3-row ladder', () => {
		expect(out.novaPaintStages).toEqual([{ stage: 1, crystalCost: 30 }, { stage: 2, crystalCost: 120 }, { stage: 3, crystalCost: 400 }]);
	});
	it('rebirth-meta parses RB #, crystal qty, and % mults', () => {
		expect(out.rebirthMeta).toEqual([
			{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 },
			{ rebirth: 13, nova: 16, creditMult: 32, xpMult: 160 }
		]);
	});
	it('core upgrade ladder stops at the first blank cell', () => {
		expect(out.novaShop.filter((n) => n.item === 'Income Boost')).toEqual([
			{ category: 'Core upgrades', item: 'Income Boost', level: 1, cost: 50 },
			{ category: 'Core upgrades', item: 'Income Boost', level: 2, cost: 120 }
		]);
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/parsers/novaShop.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `novaShop.ts`:**

```ts
import { toRows, cell } from '../csv';
import type { NovaShopRow, RebirthMetaRow, PaintStageRow } from '../types';

const HEADER = 3; // logical header row (item names)

function parseLadder(r: string[][], category: string, levelCol: number, firstItemCol: number, lastItemCol: number): NovaShopRow[] {
	const out: NovaShopRow[] = [];
	for (let col = firstItemCol; col <= lastItemCol; col++) {
		const item = cell(r[HEADER], col).trim();
		if (!item) continue;
		for (let i = HEADER + 1; i < r.length; i++) {
			const lvl = cell(r[i], levelCol).trim();
			const costRaw = cell(r[i], col).trim();
			if (!lvl || !costRaw) break;              // ladder ends at first blank
			out.push({ category, item, level: parseInt(lvl, 10), cost: parseInt(costRaw.replace(/,/g, ''), 10) });
		}
	}
	return out;
}

export function parseNovaShop(csv: string) {
	const r = toRows(csv);
	const novaShop = [
		...parseLadder(r, 'Core upgrades', 0, 1, 9),
		...parseLadder(r, 'Workshop upgrades', 11, 12, 20)
	];

	// paint stages: col22 LEVEL / col23 cost, rows under the LEVEL header
	const novaPaintStages: PaintStageRow[] = [];
	for (let i = 0; i < r.length; i++) {
		if (cell(r[i], 22).trim() === 'LEVEL' && /BASE PAINT/i.test(cell(r[i], 23))) {
			for (let j = i + 1; j < r.length; j++) {
				const s = cell(r[j], 22).trim(), c = cell(r[j], 23).trim();
				if (!s || !c) break;
				novaPaintStages.push({ stage: parseInt(s, 10), crystalCost: parseInt(c.replace(/,/g, ''), 10) });
			}
		}
	}

	// rebirth-meta: header 'RB LEVEL' in col29
	const rebirthMeta: RebirthMetaRow[] = [];
	for (let i = 0; i < r.length; i++) {
		if (cell(r[i], 29).trim() === 'RB LEVEL') {
			for (let j = i + 1; j < r.length; j++) {
				const rb = cell(r[j], 29).trim();
				const m = /^RB\s+(\d+)$/i.exec(rb);
				if (!m) break;
				rebirthMeta.push({
					rebirth: parseInt(m[1], 10),
					nova: parseInt(cell(r[j], 30).replace(/[^\d]/g, ''), 10),
					creditMult: parseInt(cell(r[j], 31).replace(/%/g, ''), 10),
					xpMult: parseInt(cell(r[j], 32).replace(/%/g, ''), 10)
				});
			}
		}
	}
	return { novaShop, rebirthMeta, novaPaintStages };
}
```

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/sync/parsers/novaShop.ts app/src/lib/server/sync/parsers/novaShop.test.ts
git commit -m "feat(sync): nova-shop parser (upgrades, rebirth-meta, paint stages)"
```

---

### Task 9: Validators

**Files:**
- Create: `app/src/lib/server/sync/validate.ts`
- Test: `app/src/lib/server/sync/validate.test.ts`

**Interfaces:**
- Consumes: `PayloadTables`, `Flag`, `TIERS`, `resolveDroid`.
- Produces: `validate(tables: PayloadTables, existingCountKeys: {droid:string;tier:string;profileId:number}[]): Flag[]`. Emits reject/hold/report flags per the spec's §7 table. `rejectsOf(flags)` helper returns only reject-kind.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { validate, rejectsOf } from './validate';
import type { PayloadTables } from './types';

function base(): PayloadTables {
	return {
		droids: [{ name: 'IG', rarity: 'Mythic', type: 'Battle', incomePct: null, buyNc: null }, { name: 'KX', rarity: 'Mythic', type: 'Battle', incomePct: null, buyNc: null }],
		droidTiers: [
			{ droid: 'KX', tier: 'Base', buy: 300_000_000, income: 7200, sell: 210_000_000 },
			{ droid: 'KX', tier: 'Gold', buy: 1_200_000_000, income: null, sell: null },
			{ droid: 'IG', tier: 'Base', buy: 300_000_000, income: 7000, sell: 210_000_000 },
			{ droid: 'IG', tier: 'Gold', buy: 1_200_000_000, income: null, sell: null }
		],
		rebirthReqs: [], chipCosts: [{ rarity: 'Common', toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80 },
			{ rarity: 'Rare', toGold: 30, toDiamond: 60, toRainbow: 100, toBeskar: 250 },
			{ rarity: 'Epic', toGold: 120, toDiamond: 180, toRainbow: 240, toBeskar: 5000 },
			{ rarity: 'Legendary', toGold: 400, toDiamond: 1200, toRainbow: 4000, toBeskar: 12000 },
			{ rarity: 'Mythic', toGold: 6000, toDiamond: 13000, toRainbow: 30000, toBeskar: 75000 }],
		rebirthMeta: [{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 }],
		novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: []
	};
}

describe('validate', () => {
	it('clean payload has no reject flags', () => {
		expect(rejectsOf(validate(base(), []))).toHaveLength(0);
	});
	it('holds a droid whose value≈0.7×cost invariant breaks (the IG corruption)', () => {
		const t = base();
		t.droidTiers.find((x) => x.droid === 'IG' && x.tier === 'Base')!.sell = 239_400_000; // > 0.7*cost
		const flags = validate(t, []);
		expect(flags.some((f) => f.kind === 'hold' && f.table === 'droidTiers' && f.key?.includes('IG'))).toBe(true);
	});
	it('rejects a bad rarity enum', () => {
		const t = base(); t.droids[0].rarity = 'Ultra';
		expect(rejectsOf(validate(t, [])).length).toBeGreaterThan(0);
	});
	it('reports orphaned counts when a referenced droid is absent', () => {
		const flags = validate(base(), [{ droid: 'GONE', tier: 'Base', profileId: 7 }]);
		expect(flags.some((f) => f.kind === 'report' && f.code === 'orphan_count' && f.message.includes('GONE'))).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/validate.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `validate.ts`:**

```ts
import type { PayloadTables, Flag } from './types';

const RARITIES = new Set(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Iconic']);
const TYPES = new Set(['Worker', 'Astromech', 'Battle']);
const REQUIRED_CHIP_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

export function validate(t: PayloadTables, existingCountKeys: { droid: string; tier: string; profileId: number }[]): Flag[] {
	const flags: Flag[] = [];

	for (const d of t.droids) {
		if (!RARITIES.has(d.rarity)) flags.push({ kind: 'reject', code: 'bad_rarity', message: `${d.name}: ${d.rarity}`, table: 'droids', key: d.name });
		if (!TYPES.has(d.type)) flags.push({ kind: 'reject', code: 'bad_type', message: `${d.name}: ${d.type}`, table: 'droids', key: d.name });
	}

	// tier-grid ratio check (non-Iconic): value ≈ 0.7×cost (±15%). HOLD (this catches IG).
	const iconic = new Set(t.droids.filter((d) => d.rarity === 'Iconic').map((d) => d.name));
	for (const row of t.droidTiers) {
		if (iconic.has(row.droid) || row.buy == null || row.sell == null) continue;
		const ratio = row.sell / row.buy;
		if (ratio < 0.55 || ratio > 0.85) {
			flags.push({ kind: 'hold', code: 'ratio_violation', message: `${row.droid}/${row.tier}: sell/buy=${ratio.toFixed(2)} (expected ~0.70) — likely corrupt`, table: 'droidTiers', key: `${row.droid}/${row.tier}` });
		}
	}

	const chipR = new Set(t.chipCosts.map((c) => c.rarity));
	for (const r of REQUIRED_CHIP_RARITIES) {
		if (!chipR.has(r)) flags.push({ kind: 'reject', code: 'missing_chip_rarity', message: r, table: 'chipCosts' });
	}

	// rebirth-meta contiguous
	const rbs = t.rebirthMeta.map((m) => m.rebirth).sort((a, b) => a - b);
	for (let i = 1; i < rbs.length; i++) {
		if (rbs[i] !== rbs[i - 1] + 1) { flags.push({ kind: 'reject', code: 'rebirth_meta_gap', message: `gap after RB ${rbs[i - 1]}`, table: 'rebirthMeta' }); break; }
	}

	// orphan report
	const known = new Set(t.droids.map((d) => d.name));
	for (const c of existingCountKeys) {
		if (!known.has(c.droid)) flags.push({ kind: 'report', code: 'orphan_count', message: `count references removed droid "${c.droid}" (profile ${c.profileId})`, table: 'counts', key: `${c.droid}/${c.tier}` });
	}

	return flags;
}

export function rejectsOf(flags: Flag[]): Flag[] {
	return flags.filter((f) => f.kind === 'reject');
}
```

Note: the rebirth-shape 324-count + token-resolution invariant is asserted inside the parsers (a token that won't split throws) and re-checked in `build.ts` (Task 11) where the full roster is known; `validate.ts` covers enum/ratio/orphan.

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/sync/validate.ts app/src/lib/server/sync/validate.test.ts
git commit -m "feat(sync): validators (reject/hold/report incl. IG ratio check + orphans)"
```

---

### Task 10: Diff

**Files:**
- Create: `app/src/lib/server/sync/diff.ts`
- Test: `app/src/lib/server/sync/diff.test.ts`

**Interfaces:**
- Consumes: `PayloadTables`, `DiffResult`, PK map.
- Produces: `diffTables(prev: PayloadTables, next: PayloadTables): DiffResult` — per table `{ added, removed, changed }`, keyed by PK tuple; `changed` lists rows whose non-PK fields differ. `isEmpty(diff): boolean`.

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect } from 'vitest';
import { diffTables, isEmpty } from './diff';
import type { PayloadTables } from './types';

const empty: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [] };
const withCommon = { ...empty, chipCosts: [{ rarity: 'Common', toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80 }] };
const mythicChanged = { ...empty, chipCosts: [{ rarity: 'Mythic', toGold: 6000, toDiamond: 13000, toRainbow: 30000, toBeskar: 75000 }] };
const mythicOld = { ...empty, chipCosts: [{ rarity: 'Mythic', toGold: 8000, toDiamond: 15000, toRainbow: 40000, toBeskar: 80000 }] };

describe('diffTables', () => {
	it('detects added rows', () => {
		const d = diffTables(empty, withCommon);
		expect(d.chipCosts.added).toHaveLength(1);
		expect(isEmpty(d)).toBe(false);
	});
	it('detects changed rows by PK', () => {
		const d = diffTables(mythicOld, mythicChanged);
		expect(d.chipCosts.changed).toHaveLength(1);
		expect(d.chipCosts.changed[0].key).toBe('Mythic');
	});
	it('identical payloads → empty diff', () => {
		expect(isEmpty(diffTables(withCommon, withCommon))).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/diff.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `diff.ts`:**

```ts
import type { PayloadTables, DiffResult, TableDiff, RowChange } from './types';

const PK: Record<string, string[]> = {
	droids: ['name'], droidTiers: ['droid', 'tier'], rebirthReqs: ['cycle', 'rebirth', 'droid', 'tier'],
	chipCosts: ['rarity'], rebirthMeta: ['rebirth'], novaShop: ['category', 'item', 'level'],
	cosmetics: ['category', 'name'], droidSellValues: ['rarity', 'tier'], flawlessSpawn: ['tier'], novaPaintStages: ['stage']
};
const keyOf = (row: Record<string, unknown>, keys: string[]) => keys.map((k) => String(row[k])).join('/');

function diffOne(prev: Record<string, unknown>[], next: Record<string, unknown>[], keys: string[]): TableDiff {
	const pm = new Map(prev.map((r) => [keyOf(r, keys), r]));
	const nm = new Map(next.map((r) => [keyOf(r, keys), r]));
	const added = next.filter((r) => !pm.has(keyOf(r, keys)));
	const removed = prev.filter((r) => !nm.has(keyOf(r, keys)));
	const changed: RowChange[] = [];
	for (const [k, nrow] of nm) {
		const prow = pm.get(k);
		if (prow && JSON.stringify(prow) !== JSON.stringify(nrow)) changed.push({ key: k, before: prow, after: nrow });
	}
	return { added, removed, changed };
}

export function diffTables(prev: PayloadTables, next: PayloadTables): DiffResult {
	const out: DiffResult = {};
	for (const table of Object.keys(PK)) {
		out[table] = diffOne(
			(prev as Record<string, Record<string, unknown>[]>)[table],
			(next as Record<string, Record<string, unknown>[]>)[table],
			PK[table]
		);
	}
	return out;
}

export function isEmpty(diff: DiffResult): boolean {
	return Object.values(diff).every((d) => !d.added.length && !d.removed.length && !d.changed.length);
}
```

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/sync/diff.ts app/src/lib/server/sync/diff.test.ts
git commit -m "feat(sync): per-table diff engine keyed by PK"
```

---

### Task 11: Fetch + buildPayload orchestration

**Files:**
- Create: `app/src/lib/server/sync/fetch.ts`, `app/src/lib/server/sync/build.ts`
- Test: `app/src/lib/server/sync/build.test.ts`

**Interfaces:**
- Consumes: all four parsers, `validate`, `checksumOf`, `canonical`.
- Produces:
  - `fetch.ts`: `fetchTabs(f = fetch): Promise<Record<gid, string>>` — the four CSV strings, all-or-nothing (throws if any fetch is non-200).
  - `build.ts`: `buildPayload(csvByGid: Record<string,string>, existingCountKeys, source: string, fetchedAt: string): { payload: Payload; flags: Flag[]; checksum: string }`. Runs all parsers, assembles `PayloadTables`, cross-parser rebirth-shape assert (exactly 4×27×3=324 reqs; every req droid resolves to the roster; every tier word mapped — else a `reject` flag), computes `rowCounts` + per-tab `tabChecksums` + `checksum`.

- [ ] **Step 1: Create the shared fixtures file** `app/src/lib/server/sync/__fixtures__/tabs.ts` (parseable-but-partial CSVs; buildPayload will emit reject flags for the partial rebirth set — that's expected and asserted below). These are the golden inputs shared by build + integration tests:

```ts
function row(n: number, cells: Record<number, string>): string {
	const a = Array(n).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

export const DROID_CSV = [
	row(24, { 0: 'banner', 19: 'banner' }),
	row(24, { 19: 'UPGRADE COSTS' }),
	row(24, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'COST', 4: 'INCOME', 5: 'VALUE', 19: 'RARITY', 20: 'BASE -> GOLD', 21: 'GOLD -> DIAMOND', 22: 'DIAMOND -> RAINBOW', 23: 'RAINBOW -> BESKAR' }),
	row(24, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '950', 4: '2/s', 5: '665', 6: '3.8k', 7: '8/s', 8: '2.66k', 19: 'COMMON', 20: '5 CHIPS', 21: '25 CHIPS', 22: '40 CHIPS', 23: '80 CHIPS' }),
	row(24, { 19: 'ICONIC', 20: 'N/A', 21: 'N/A', 22: 'N/A', 23: 'N/A' }),
	row(24, { 19: 'DROID SELL VALUE' }),
	row(24, { 1: 'R2-D2', 2: 'ASTROMECH', 3: 'N/A', 4: '25%/s', 19: 'RARITY', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row(24, { 19: 'COMMON', 20: '4', 21: '7', 22: '10', 23: '13' }),
	row(24, { 19: 'FLAWLESS SPAWN PROBABILITY' }),
	row(24, { 19: 'DEFAULT', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row(24, { 19: '1/1000', 20: '1/500', 21: '1/250', 22: '1/125', 23: '1/100' })
].join('\n');

export const REBIRTH_CSV = [
	row(34, { 10: 'banner' }),
	row(34, { 10: 'REBIRTH REQUIRMENTS', 11: 'CREDITS', 12: 'DROID', 13: 'RARITY', 14: 'UNLOCKS', 15: 'FLAWLESS' }),
	row(34, { 10: '0->1', 11: '10K CREDITS', 12: 'BASIC CB', 13: 'COMMON', 14: 'Worker Slot' }),
	row(34, { 12: 'BASIC MOUSE' }),
	row(34, { 12: 'GOLD MONO-WALKER' })
].join('\n');

export const COSMETIC_CSV = [
	row(11, { 0: 'banner' }),
	row(11, { 0: 'HATS', 4: 'BASE PAINTS', 8: 'DROID EFFECTS' }),
	row(11, { 0: 'HAT', 1: 'REQUIREMENTS', 2: 'OWNED', 4: 'PAINT', 5: 'REQUIREMENTS', 6: 'OWNED', 8: 'EFFECT', 9: 'REQUIREMENTS', 10: 'OWNED' }),
	row(11, { 0: 'F1l-ON1', 1: 'FIND IN WORLD', 2: 'FALSE', 4: 'RED PAINT (DEFAULT', 5: 'NONE', 6: 'FALSE', 8: 'GROOVY AURA', 9: 'DJ R-3X EVENT', 10: 'FALSE' })
].join('\n');

export const NOVA_CSV = [
	row(33, { 0: 'banner' }),
	row(33, { 22: 'NOVA SHOP - COSMETICS' }),
	row(33, { 22: 'NOVA CRYSTAL COST', 29: 'INFORMATION' }),
	row(33, { 0: 'LEVEL', 1: 'Income Boost', 22: 'LEVEL', 23: 'NOVA CRYSTAL BASE PAINT', 29: 'note\nwith newline' }),
	row(33, { 0: '1', 1: '50', 22: '1', 23: '30' }),
	row(33, { 0: '2', 1: '120', 22: '2', 23: '120', 29: 'NOVA CRYSTALS/RB LEVEL' }),
	row(33, { 0: '3', 22: '3', 23: '400', 29: 'RB LEVEL', 30: 'CRYSTAL QUANTITY', 31: 'CREDIT MULT', 32: 'XP MULT' }),
	row(33, { 29: 'RB 12', 30: '11 NOVA CRYSTALS', 31: '22%', 32: '110%' })
].join('\n');

export const CSV_BY_GID = { '1248391507': DROID_CSV, '0': REBIRTH_CSV, '547464940': COSMETIC_CSV, '1548395368': NOVA_CSV };

// A reject-free minimal built payload for stage/apply integration tests (bypasses the parsers,
// so it isn't subject to buildPayload's 324-rebirth assert). validate() finds no rejects here.
import { checksumOf } from '../canonical.js';
import type { PayloadTables, Payload, Flag } from '../types';

export function validTables(): PayloadTables {
	return {
		droids: [{ name: 'MOUSE', rarity: 'Common', type: 'Worker', incomePct: null, buyNc: null }],
		droidTiers: [{ droid: 'MOUSE', tier: 'Base', buy: 1000, income: 2, sell: 700 }],
		rebirthReqs: [{ cycle: 1, rebirth: 1, droid: 'MOUSE', tier: 'Base', credits: '10K', unlock: null }],
		chipCosts: ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'].map((rarity) => ({ rarity, toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80 })),
		rebirthMeta: [{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 }],
		novaShop: [], cosmetics: [{ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' }],
		droidSellValues: [{ rarity: 'Common', tier: 'Gold', multiplier: 4 }],
		flawlessSpawn: [{ tier: 'Base', oneIn: 1000 }], novaPaintStages: [{ stage: 1, crystalCost: 30 }]
	};
}
export function validBuilt(extraFlags: Flag[] = []): { payload: Payload; flags: Flag[]; checksum: string } {
	const tables = validTables();
	const payload: Payload = { meta: { source: 'test', fetchedAt: 't', tabChecksums: {}, rowCounts: {}, orphanReport: [] }, tables };
	return { payload, flags: extraFlags, checksum: checksumOf(tables as unknown as Record<string, unknown[]>) };
}
```

- [ ] **Step 2: Write the failing test** (`build.test.ts`) importing the fixtures:

```ts
import { describe, it, expect } from 'vitest';
import { buildPayload } from './build';
import { CSV_BY_GID } from './__fixtures__/tabs';

describe('buildPayload', () => {
	it('assembles a payload with a stable checksum and per-tab checksums', () => {
		const a = buildPayload(CSV_BY_GID, [], 'test', '2026-07-05T00:00:00Z');
		const b = buildPayload(CSV_BY_GID, [], 'test', '2026-07-05T00:00:00Z');
		expect(a.checksum).toBe(b.checksum);
		expect(a.checksum).toMatch(/^[0-9a-f]{64}$/);
		expect(Object.keys(a.payload.meta.tabChecksums).sort()).toEqual(['0', '1248391507', '1548395368', '547464940']);
		expect(a.payload.meta.rowCounts.droids).toBeGreaterThan(0);
	});
	it('flags the partial rebirth set as a reject (not 324)', () => {
		const { flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		expect(flags.some((f) => f.kind === 'reject' && f.code === 'rebirth_count')).toBe(true);
	});
});
```

- [ ] **Step 3: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/sync/build.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement `fetch.ts`:**

```ts
const SHEET = '1otLCKSCMKICMlnefirQ8KZhh_rdZTd5Mp8h0UYFUiqg';
export const GIDS = ['1248391507', '0', '547464940', '1548395368'] as const;
const url = (gid: string) => `https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`;

export async function fetchTabs(f: typeof fetch = fetch): Promise<Record<string, string>> {
	const entries = await Promise.all(GIDS.map(async (gid) => {
		const res = await f(url(gid));
		if (!res.ok) throw new Error(`tab ${gid} fetch failed: ${res.status}`);
		return [gid, await res.text()] as const;
	}));
	return Object.fromEntries(entries);
}
```

- [ ] **Step 5: Implement `build.ts`:**

```ts
import { parseDroidReference } from './parsers/droidReference';
import { parseRebirths } from './parsers/rebirths';
import { parseCosmetics } from './parsers/cosmetics';
import { parseNovaShop } from './parsers/novaShop';
import { validate } from './validate';
import { checksumOf } from './canonical.js';
import { createHash } from 'node:crypto';
import type { Payload, PayloadTables, Flag } from './types';

export function buildPayload(
	csvByGid: Record<string, string>,
	existingCountKeys: { droid: string; tier: string; profileId: number }[],
	source: string,
	fetchedAt: string
): { payload: Payload; flags: Flag[]; checksum: string } {
	const dr = parseDroidReference(csvByGid['1248391507']);
	const rb = parseRebirths(csvByGid['0']);
	const cos = parseCosmetics(csvByGid['547464940']);
	const nv = parseNovaShop(csvByGid['1548395368']);

	const tables: PayloadTables = {
		droids: dr.droids, droidTiers: dr.droidTiers, chipCosts: dr.chipCosts,
		droidSellValues: dr.droidSellValues, flawlessSpawn: dr.flawlessSpawn,
		rebirthReqs: rb.rebirthReqs, cosmetics: cos.cosmetics,
		novaShop: nv.novaShop, rebirthMeta: nv.rebirthMeta, novaPaintStages: nv.novaPaintStages
	};

	const flags = validate(tables, existingCountKeys);

	// cross-parser rebirth-shape assert
	if (tables.rebirthReqs.length !== 324) {
		flags.push({ kind: 'reject', code: 'rebirth_count', message: `expected 324 rebirth reqs, got ${tables.rebirthReqs.length}`, table: 'rebirthReqs' });
	}
	const roster = new Set(tables.droids.map((d) => d.name));
	for (const req of tables.rebirthReqs) {
		if (!roster.has(req.droid)) {
			flags.push({ kind: 'reject', code: 'unresolved_droid', message: `rebirth req droid "${req.droid}" not in roster`, table: 'rebirthReqs', key: `${req.cycle}/${req.rebirth}/${req.droid}` });
		}
	}

	const tabChecksums: Record<string, string> = {};
	for (const [gid, csv] of Object.entries(csvByGid)) tabChecksums[gid] = createHash('sha256').update(csv).digest('hex');
	const rowCounts: Record<string, number> = {};
	for (const [name, rows] of Object.entries(tables)) rowCounts[name] = (rows as unknown[]).length;

	const checksum = checksumOf(tables as unknown as Record<string, unknown[]>);
	const orphanReport = flags.filter((f) => f.code === 'orphan_count').map((f) => {
		const [droid, tier] = (f.key ?? '/').split('/');
		return { droid, tier, profileId: 0 };
	});
	const payload: Payload = { meta: { source, fetchedAt, tabChecksums, rowCounts, orphanReport }, tables };
	return { payload, flags, checksum };
}
```

- [ ] **Step 6: Run to verify it passes.** Run the Step-3 command — Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add app/src/lib/server/sync/__fixtures__/tabs.ts app/src/lib/server/sync/fetch.ts app/src/lib/server/sync/build.ts app/src/lib/server/sync/build.test.ts
git commit -m "feat(sync): fixtures, fetch (all-or-nothing), buildPayload orchestration + checksums"
```

---

### Task 12: Preview & staging service

**Files:**
- Create: `app/src/lib/server/services/sync.ts`
- Test: `app/src/lib/server/services/sync.integration.test.ts`

**Interfaces:**
- Consumes: `postgres.Sql`, `buildPayload`, `diffTables`, `isEmpty`, test helper `validBuilt`.
- Produces:
  - `stagePayload(sql, built: { payload, flags, checksum }): Promise<Summary>` — core staging: reads the active version (id + checksum). If `built.checksum === active.checksum` → returns `{ noOp: true, … }` and stages nothing (the §7 no-op invariant). Else diffs `built.payload.tables` against the active payload's tables, upserts a `sync_previews` row (jsonb via `sql.json`), returns the summary.
  - `stagePreview(sql, csvByGid, source, fetchedAt): Promise<Summary>` — wrapper used by the route: reads `counts` keys, calls `buildPayload`, then `stagePayload`.
  - `Summary = { noOp: boolean; diff: DiffResult; flags: Flag[]; orphans: OrphanRow[]; baseVersionId: number; payloadChecksum: string }`.

- [ ] **Step 1: Write the failing integration test** (stages a directly-built valid payload; also asserts the partial parser fixtures surface a reject):

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, seedMinimalReference } from '../testing/db';
import { stagePayload, stagePreview } from './sync';
import { validBuilt, CSV_BY_GID } from '../sync/__fixtures__/tabs';

let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeEach(async () => { ({ sql } = await testDb()); await seedMinimalReference(sql); });

describe('stagePayload / stagePreview', () => {
	it('stages a valid payload and returns a diff + checksum', async () => {
		const res = await stagePayload(sql, validBuilt());
		expect(res.noOp).toBe(false);
		expect(res.payloadChecksum).toMatch(/^[0-9a-f]{64}$/);
		const staged = await sql`select * from sync_previews where checksum = ${res.payloadChecksum}`;
		expect(staged).toHaveLength(1);
	});
	it('short-circuits a no-op when the checksum equals the active version', async () => {
		const built = validBuilt();
		await sql`update data_versions set checksum = ${built.checksum} where id = (select max(id) from data_versions)`;
		const res = await stagePayload(sql, built);
		expect(res.noOp).toBe(true);
		const staged = await sql`select * from sync_previews where checksum = ${built.checksum}`;
		expect(staged).toHaveLength(0);
	});
	it('stagePreview through the partial parser fixtures surfaces a reject flag', async () => {
		const res = await stagePreview(sql, CSV_BY_GID, 'sheet', 't');
		expect(res.flags.some((f) => f.kind === 'reject')).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/services/sync.integration.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `stagePayload` + `stagePreview` in `services/sync.ts`:**

```ts
import type postgres from 'postgres';
type Sql = postgres.Sql;
import { buildPayload } from '../sync/build';
import { diffTables } from '../sync/diff';
import type { Payload, PayloadTables, Flag } from '../sync/types';

const EMPTY_TABLES: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [] };

async function activeVersion(sql: Sql): Promise<{ id: number; checksum: string; payload: Payload | null } | null> {
	const rows = await sql`select id, checksum, payload from data_versions order by id desc limit 1`;
	return rows[0] ? { id: rows[0].id, checksum: rows[0].checksum, payload: rows[0].payload } : null;
}

export async function stagePayload(sql: Sql, built: { payload: Payload; flags: Flag[]; checksum: string }) {
	const active = await activeVersion(sql);
	const baseVersionId = active?.id ?? 0;
	if (active && active.checksum === built.checksum) {
		return { noOp: true, diff: {}, flags: built.flags, orphans: built.payload.meta.orphanReport, baseVersionId, payloadChecksum: built.checksum };
	}
	const diff = diffTables(active?.payload?.tables ?? EMPTY_TABLES, built.payload.tables);
	await sql`insert into sync_previews (checksum, base_version_id, payload, flags)
		values (${built.checksum}, ${baseVersionId}, ${sql.json(built.payload)}, ${sql.json(built.flags)})
		on conflict (checksum) do update set base_version_id = excluded.base_version_id, payload = excluded.payload, flags = excluded.flags, built_at = now()`;
	return { noOp: false, diff, flags: built.flags, orphans: built.payload.meta.orphanReport, baseVersionId, payloadChecksum: built.checksum };
}

export async function stagePreview(sql: Sql, csvByGid: Record<string, string>, source: string, fetchedAt: string) {
	const countKeys = await sql`select distinct droid, tier, profile_id as "profileId" from counts`;
	const built = buildPayload(csvByGid, countKeys as unknown as { droid: string; tier: string; profileId: number }[], source, fetchedAt);
	return stagePayload(sql, built);
}
```

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/services/sync.ts app/src/lib/server/services/sync.integration.test.ts app/src/lib/server/sync/__fixtures__/tabs.ts
git commit -m "feat(sync): stagePreview — build, diff vs active, stage in sync_previews"
```

---

### Task 13: Apply service (gate enforcement + OCC)

**Files:**
- Modify: `app/src/lib/server/services/sync.ts`
- Test: `app/src/lib/server/services/sync.integration.test.ts` (extend)

**Interfaces:**
- Consumes: `stagePayload` output, `ApiError`, `validBuilt` (test helper).
- Produces: `applyPayload(sql, { baseVersionId, payloadChecksum, acknowledgedHolds }): Promise<{ versionId: number }>`. Steps: (1) load staged row by checksum → 422 `unknown_checksum` if absent; (2) if staged flags contain any `reject`-kind → 422 `ingest_rejected` (reject = refuse the whole ingest); (3) every `hold`-kind flag's key must be in `acknowledgedHolds` → else 422 `unacknowledged_hold`; (4) one `sql.begin` txn: `select id from data_versions order by id desc limit 1 for update`; if `≠ baseVersionId` → 409 `stale_base`; truncate + insert all reference tables from the staged payload; insert the new `data_versions` row (explicit columns, `sql.json(payload)`); delete the staged row.

- [ ] **Step 1: Write the failing tests** (extend the integration file; uses `validBuilt` + `stagePayload`):

```ts
import { applyPayload } from './sync';

it('rejects an unknown checksum (forged/unpreviewed payload)', async () => {
	await expect(applyPayload(sql, { baseVersionId: 1, payloadChecksum: 'deadbeef'.repeat(8), acknowledgedHolds: [] }))
		.rejects.toMatchObject({ status: 422, code: 'unknown_checksum' });
});

it('refuses a staged payload carrying a reject-kind flag', async () => {
	const built = validBuilt([{ kind: 'reject', code: 'rebirth_count', message: 'bad', table: 'rebirthReqs' }]);
	const p = await stagePayload(sql, built);
	await expect(applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: [] }))
		.rejects.toMatchObject({ status: 422, code: 'ingest_rejected' });
});

it('rejects an unacknowledged hold, then applies when acknowledged', async () => {
	const built = validBuilt([{ kind: 'hold', code: 'ratio_violation', message: 'IG-ish', table: 'droidTiers', key: 'IG/Base' }]);
	const p = await stagePayload(sql, built);
	await expect(applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: [] }))
		.rejects.toMatchObject({ status: 422, code: 'unacknowledged_hold' });
	const res = await applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: ['IG/Base'] });
	expect(res.versionId).toBeGreaterThan(p.baseVersionId);
	expect(await sql`select * from sync_previews where checksum = ${p.payloadChecksum}`).toHaveLength(0); // consumed
	const dv = await sql`select payload from data_versions where id = ${res.versionId}`;
	expect(dv[0].payload).not.toBeNull(); // payload invariant
	expect(await sql`select name from droids`).toEqual([{ name: 'MOUSE' }]); // reference zone swapped
});

it('409 on a stale base version', async () => {
	const p = await stagePayload(sql, validBuilt());
	await sql`insert into data_versions (source, checksum, payload) values ('interloper','x',${sql.json({})})`; // N+1 lands
	await expect(applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: [] }))
		.rejects.toMatchObject({ status: 409, code: 'stale_base' });
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/services/sync.integration.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `applyPayload`** (appended to `services/sync.ts`; `Sql`/`Payload`/`Flag` are already imported from Task 12, add `ApiError`):

```ts
import { ApiError } from '../api-error';

const REF_TABLES = ['droids', 'droid_tiers', 'rebirth_reqs', 'chip_costs', 'rebirth_meta', 'nova_shop', 'cosmetics', 'droid_sell_values', 'flawless_spawn', 'nova_paint_stages'];

// payload rows are camelCase; convert to DB snake_case for insert. No reference table has a jsonb
// column, so the postgres.js object helper handles the scalar values fine.
function snakeRow(r: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(r)) out[k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())] = v;
	return out;
}
function insertRows(tx: Sql, table: string, rows: Record<string, unknown>[]) {
	return Promise.all(rows.map((r) => tx`insert into ${tx(table)} ${tx(snakeRow(r))}`));
}

export async function applyPayload(sql: Sql, input: { baseVersionId: number; payloadChecksum: string; acknowledgedHolds: string[] }): Promise<{ versionId: number }> {
	const staged = await sql`select payload, flags, source from sync_previews where checksum = ${input.payloadChecksum}`;
	if (!staged[0]) throw new ApiError(422, 'unknown_checksum', 'No staged preview for that checksum — re-preview first');
	const flags = staged[0].flags as Flag[];
	const payload = staged[0].payload as Payload;

	if (flags.some((f) => f.kind === 'reject')) throw new ApiError(422, 'ingest_rejected', 'Payload failed a reject-class invariant — ingest refused');
	const ackd = new Set(input.acknowledgedHolds);
	for (const f of flags.filter((x) => x.kind === 'hold')) {
		if (!ackd.has(f.key ?? '')) throw new ApiError(422, 'unacknowledged_hold', `Hold not acknowledged: ${f.key} (${f.message})`);
	}

	let versionId = 0;
	await sql.begin(async (tx) => {
		const active = await tx`select id from data_versions order by id desc limit 1 for update`;
		const activeId = active[0]?.id ?? 0;
		if (activeId !== input.baseVersionId) throw new ApiError(409, 'stale_base', `Active version is ${activeId}, preview was against ${input.baseVersionId} — re-preview`);

		await tx`truncate ${tx.unsafe(REF_TABLES.join(', '))}`;
		const t = payload.tables as unknown as Record<string, Record<string, unknown>[]>;
		await insertRows(tx, 'droids', t.droids);
		await insertRows(tx, 'droid_tiers', t.droidTiers);
		await insertRows(tx, 'rebirth_reqs', t.rebirthReqs);
		await insertRows(tx, 'chip_costs', t.chipCosts);
		await insertRows(tx, 'rebirth_meta', t.rebirthMeta);
		await insertRows(tx, 'nova_shop', t.novaShop);
		await insertRows(tx, 'cosmetics', t.cosmetics);
		await insertRows(tx, 'droid_sell_values', t.droidSellValues);
		await insertRows(tx, 'flawless_spawn', t.flawlessSpawn);
		await insertRows(tx, 'nova_paint_stages', t.novaPaintStages);

		const inserted = await tx`insert into data_versions (source, checksum, payload)
			values (${staged[0].source}, ${input.payloadChecksum}, ${tx.json(payload)}) returning id`;
		versionId = inserted[0].id;
		await tx`delete from sync_previews where checksum = ${input.payloadChecksum}`;
	});
	return { versionId };
}
```

Note: `oneIn`→`one_in`, `incomePct`→`income_pct`, `buyNc`→`buy_nc`, `crystalCost`→`crystal_cost`, `creditMult`→`credit_mult`, `xpMult`→`xp_mult`, `toGold`→`to_gold` etc. all follow the single camel→snake rule. `truncate` uses `tx.unsafe` for the constant comma-joined identifier list.

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS (all four cases).

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/services/sync.ts app/src/lib/server/services/sync.integration.test.ts
git commit -m "feat(sync): applyPayload — provenance, reject/hold gate, OCC lock, single-txn swap"
```

---

### Task 14: Rollback + listVersions service

**Files:**
- Modify: `app/src/lib/server/services/sync.ts`
- Test: `app/src/lib/server/services/sync.integration.test.ts` (extend)

**Interfaces:**
- Produces: `rollback(sql, versionId): Promise<{ versionId }>` — re-stages the stored payload of `versionId` (compute its checksum, insert a `sync_previews` row with no holds), then calls `applyPayload` against the current active id. `listVersions(sql): Promise<VersionSummary[]>` — `{ id, ingestedAt, source, rowCounts, orphanReport }` from `data_versions.payload.meta`.

- [ ] **Step 1: Write the failing test:**

```ts
import { rollback, listVersions } from './sync';

it('rollback re-applies a stored version as a new append-only version', async () => {
	const p2 = await stagePayload(sql, validBuilt());
	const v2 = await applyPayload(sql, { baseVersionId: p2.baseVersionId, payloadChecksum: p2.payloadChecksum, acknowledgedHolds: [] });
	const rb = await rollback(sql, v2.versionId);
	expect(rb.versionId).toBeGreaterThan(v2.versionId);
	const versions = await listVersions(sql);
	expect(versions[0].id).toBe(rb.versionId);        // newest first
	expect(versions.length).toBeGreaterThanOrEqual(3); // fixture v1 + v2 + rollback
	expect(versions.find((v) => v.id === v2.versionId)?.rowCounts).toBeDefined();
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/services/sync.integration.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `rollback` + `listVersions`:**

```ts
import { checksumOf } from '../sync/canonical.js';

export async function rollback(sql: Sql, versionId: number): Promise<{ versionId: number }> {
	const rows = await sql`select payload, source from data_versions where id = ${versionId}`;
	if (!rows[0]) throw new ApiError(404, 'not_found', `No version ${versionId}`);
	const payload = rows[0].payload as Payload;
	const checksum = checksumOf(payload.tables as unknown as Record<string, unknown[]>);
	const active = await sql`select id from data_versions order by id desc limit 1`;
	const baseVersionId = active[0]?.id ?? 0;
	await sql`insert into sync_previews (checksum, base_version_id, payload, flags)
		values (${checksum}, ${baseVersionId}, ${sql.json(payload)}, ${sql.json([])})
		on conflict (checksum) do update set base_version_id = excluded.base_version_id, payload = excluded.payload, flags = excluded.flags, built_at = now()`;
	return applyPayload(sql, { baseVersionId, payloadChecksum: checksum, acknowledgedHolds: [] });
}

export async function listVersions(sql: Sql) {
	const rows = await sql`select id, ingested_at as "ingestedAt", source, payload from data_versions order by id desc`;
	return rows.map((r) => ({
		id: r.id, ingestedAt: r.ingestedAt, source: r.source,
		rowCounts: (r.payload?.meta?.rowCounts) ?? null,
		orphanReport: (r.payload?.meta?.orphanReport) ?? []
	}));
}
```

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/services/sync.ts app/src/lib/server/services/sync.integration.test.ts
git commit -m "feat(sync): rollback (re-stage+apply) + listVersions summaries"
```

---

### Task 15: API routes

**Files:**
- Create: `app/src/routes/api/sync/preview/+server.ts`, `apply/+server.ts`, `rollback/+server.ts`, `versions/+server.ts`
- Test: `app/src/routes/api/sync/sync.api.integration.test.ts` (or extend service test with direct handler calls)

**Interfaces:**
- Consumes: `guard`, `requireUser`, `db`'s underlying `sql`, `fetchTabs`, `stagePreview`, `applyPayload`, `rollback`, `listVersions`.
- Produces: the four endpoints from spec §12. Preview/apply/rollback are POST; versions GET. Preview calls `fetchTabs()` for live CSVs, `source = 'sheet:' + gids + '@' + fetchedAt`.

Note: services take a postgres.js `Sql`. Expose the raw client from `db.ts` (add `export const sql = client;` in `app/src/lib/server/db.ts` if not already exported) so routes/services share one connection.

- [ ] **Step 1: Add `export const sql = client;` to `db.ts`.** (One line; the client already exists.)

- [ ] **Step 2: Write the failing API test** (drives handlers with a mocked `fetchTabs` via dependency injection — add an optional `f` param to preview, or test the service layer end-to-end which Tasks 12–14 already do). Minimal handler smoke:

```ts
import { describe, it, expect } from 'vitest';
import { GET as versionsGet } from './versions/+server';

describe('sync versions endpoint', () => {
	it('401 without a session', async () => {
		const res = await versionsGet({ locals: { user: null } } as never);
		expect(res.status).toBe(401);
	});
});
```

- [ ] **Step 3: Implement `preview/+server.ts`:**

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { fetchTabs, GIDS } from '$lib/server/sync/fetch';
import { stagePreview } from '$lib/server/services/sync';

export const POST: RequestHandler = ({ locals }) =>
	guard(async () => {
		requireUser(locals);
		const fetchedAt = new Date().toISOString();
		const csvByGid = await fetchTabs();
		const source = `sheet:${GIDS.join(',')}@${fetchedAt}`;
		return json(await stagePreview(sql, csvByGid, source, fetchedAt));
	});
```

- [ ] **Step 4: Implement `apply/+server.ts`:**

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';
import { applyPayload } from '$lib/server/services/sync';

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		requireUser(locals);
		const body = (await request.json().catch(() => null)) as { baseVersionId?: number; payloadChecksum?: string; acknowledgedHolds?: string[] } | null;
		if (!body || typeof body.baseVersionId !== 'number' || typeof body.payloadChecksum !== 'string') {
			throw new ApiError(422, 'bad_json', 'baseVersionId (number) and payloadChecksum (string) required');
		}
		return json(await applyPayload(sql, { baseVersionId: body.baseVersionId, payloadChecksum: body.payloadChecksum, acknowledgedHolds: body.acknowledgedHolds ?? [] }));
	});
```

- [ ] **Step 5: Implement `rollback/+server.ts` and `versions/+server.ts`:**

```ts
// rollback/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';
import { rollback } from '$lib/server/services/sync';

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		requireUser(locals);
		const body = (await request.json().catch(() => null)) as { versionId?: number } | null;
		if (!body || typeof body.versionId !== 'number') throw new ApiError(422, 'bad_json', 'versionId (number) required');
		return json(await rollback(sql, body.versionId));
	});
```

```ts
// versions/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sql } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { listVersions } from '$lib/server/services/sync';

export const GET: RequestHandler = ({ locals }) =>
	guard(async () => {
		requireUser(locals);
		return json(await listVersions(sql));
	});
```

- [ ] **Step 6: Run to verify it passes.** Run: `cd app && npx vitest run src/routes/api/sync` — Expected: PASS (401 smoke). Then `npm run test:int` — Expected: all sync integration tests green.

- [ ] **Step 7: Commit.**

```bash
git add app/src/routes/api/sync app/src/lib/server/db.ts
git commit -m "feat(sync): API routes (preview, apply, rollback, versions)"
```

---

### Task 16: Extend the reference read for the new tables/columns

**Files:**
- Modify: `app/src/lib/server/services/reference.ts`
- Test: `app/src/lib/server/services/reference.integration.test.ts` (extend)

**Interfaces:**
- Produces: `getReference` additionally returns `droidSellValues`, `flawlessSpawn`, `novaPaintStages`, and the new `droids.incomePct`/`droids.buyNc` columns (already included by `select().from(droids)`).

- [ ] **Step 1: Extend the failing test:**

```ts
it('serves the new reference tables and iconic columns', async () => {
	const ref = await getReference(db);
	expect(ref.droidSellValues).toEqual([
		{ rarity: 'Common', tier: 'Gold', multiplier: 4 }, { rarity: 'Common', tier: 'Beskar', multiplier: 13 }
	]);
	expect(ref.flawlessSpawn.find((f) => f.tier === 'Base')?.oneIn).toBe(1000);
	expect(ref.novaPaintStages).toHaveLength(3);
	expect(ref.droids.find((d) => d.name === 'R2-D2')).toMatchObject({ incomePct: '25', buyNc: null });
});
```

(`incomePct` is `numeric` → returned as a string by drizzle/postgres.js; assert `'25'`, or `Number(...)` at the call site. Note this in the UI contract.)

- [ ] **Step 2: Run to verify it fails.** Run: `cd app && npx vitest run src/lib/server/services/reference.integration.test.ts` — Expected: FAIL (properties missing).

- [ ] **Step 3: Extend `getReference`:**

```ts
export async function getReference(db: Db) {
	const [d, dt, rr, cc, rm, ns, cos, sv, fs, ps, ver] = await Promise.all([
		db.select().from(droids), db.select().from(droidTiers), db.select().from(rebirthReqs),
		db.select().from(chipCosts), db.select().from(rebirthMeta), db.select().from(novaShop),
		db.select().from(cosmetics), db.select().from(droidSellValues), db.select().from(flawlessSpawn),
		db.select().from(novaPaintStages), db.select().from(dataVersions).orderBy(desc(dataVersions.id)).limit(1)
	]);
	return {
		version: ver[0] ?? null, droids: d, droidTiers: dt, rebirthReqs: rr, chipCosts: cc,
		rebirthMeta: rm, novaShop: ns, cosmetics: cos, droidSellValues: sv, flawlessSpawn: fs, novaPaintStages: ps
	};
}
```

Add the new table imports (`droidSellValues, flawlessSpawn, novaPaintStages`) to the schema import at the top.

- [ ] **Step 4: Run to verify it passes.** Run the Step-2 command — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/src/lib/server/services/reference.ts app/src/lib/server/services/reference.integration.test.ts
git commit -m "feat(sync): reference read serves new tables + iconic columns"
```

---

### Task 17: Seed payload + legacy backfill + startup wiring + regression check

**Files:**
- Modify: `app/drizzle/seed.mjs`
- Create: `app/drizzle/backfill-payload.mjs`
- Modify: `app/Dockerfile` (startup command)
- Test: manual commands + full suite

**Interfaces:**
- Produces: every `data_versions` writer emits a canonical payload; the legacy prototype row is backfilled.

- [ ] **Step 1: Update `seed.mjs`** to build the payload envelope from `seed-data.json` and write it (import the shared serializer):

```js
import { checksumOf } from '../src/lib/server/sync/canonical.js';
// … after building the same `tables` object the inserts use:
const tables = {
	droids: d.droids, droidTiers: d.droidTiers, rebirthReqs: d.rebirthReqs, chipCosts: d.chipCosts,
	rebirthMeta: d.rebirthMeta, novaShop: d.novaShop, cosmetics: d.cosmetics,
	droidSellValues: d.droidSellValues ?? [], flawlessSpawn: d.flawlessSpawn ?? [], novaPaintStages: d.novaPaintStages ?? []
};
const payload = { meta: { source: 'prototype-constants', fetchedAt: new Date().toISOString(), tabChecksums: {}, rowCounts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), orphanReport: [] }, tables };
await tx`insert into data_versions (source, checksum, payload)
	values ('prototype-constants', ${checksumOf(tables)}, ${tx.json(payload)})`;
```

Note: `checksum` is over `tables` only (not `meta`), so the varying `fetchedAt` timestamp never churns it.

- [ ] **Step 2: Create `backfill-payload.mjs`** (idempotent — fills any null-payload rows using current DB contents):

```js
import postgres from 'postgres';
import { checksumOf } from '../src/lib/server/sync/canonical.js';

const url = process.env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt';
const sql = postgres(url, { max: 1 });
const nulls = await sql`select id from data_versions where payload is null`;
if (nulls.length) {
	const [droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, droidSellValues, flawlessSpawn, novaPaintStages] = await Promise.all([
		sql`select name, rarity, type, income_pct as "incomePct", buy_nc as "buyNc" from droids`,
		sql`select droid, tier, buy, income, sell from droid_tiers`,
		sql`select cycle, rebirth, droid, tier, credits, unlock from rebirth_reqs`,
		sql`select rarity, to_gold as "toGold", to_diamond as "toDiamond", to_rainbow as "toRainbow", to_beskar as "toBeskar" from chip_costs`,
		sql`select rebirth, nova, credit_mult as "creditMult", xp_mult as "xpMult" from rebirth_meta`,
		sql`select category, item, level, cost from nova_shop`,
		sql`select category, name, requirement from cosmetics`,
		sql`select rarity, tier, multiplier from droid_sell_values`,
		sql`select tier, one_in as "oneIn" from flawless_spawn`,
		sql`select stage, crystal_cost as "crystalCost" from nova_paint_stages`
	]);
	const tables = { droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, droidSellValues, flawlessSpawn, novaPaintStages };
	const payload = { meta: { source: 'backfill', fetchedAt: new Date().toISOString(), tabChecksums: {}, rowCounts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), orphanReport: [] }, tables };
	for (const { id } of nulls) await sql`update data_versions set payload = ${sql.json(payload)}, checksum = ${checksumOf(tables)} where id = ${id}`;
	console.log(`backfilled ${nulls.length} version(s)`);
}
await sql.end();
```

- [ ] **Step 3: Wire startup.** In `app/Dockerfile`, change the CMD to run the backfill after migrate:

```dockerfile
CMD ["sh", "-c", "node drizzle/migrate.mjs && node drizzle/backfill-payload.mjs && node build"]
```

- [ ] **Step 4: Verify the payload invariant with an integration test** (add to `sync.integration.test.ts`):

```ts
it('no data_versions row ever has a null payload after apply', async () => {
	const nulls = await sql`select count(*)::int as n from data_versions where payload is null`;
	expect(nulls[0].n).toBe(0);
});
```

- [ ] **Step 5: Run the reseed + full suite.**

Run: `cd app && npm run db:seed` (against dev DB) — Expected: `seeded`, and `select payload is not null from data_versions` true.
Run: `cd app && npm run test:unit && npm run test:int` — Expected: all green (unit game math unchanged = regression net; all sync + reference integration green).

- [ ] **Step 6: Commit.**

```bash
git add app/drizzle/seed.mjs app/drizzle/backfill-payload.mjs app/Dockerfile app/src/lib/server/services/sync.integration.test.ts
git commit -m "feat(sync): seed writes canonical payload + legacy backfill + startup wiring"
```

---

## Post-implementation

- [ ] Run the full suite one more time: `cd app && npm run test:unit && npm run test:int && npm run test:e2e`.
- [ ] Manually exercise the pipeline against the live sheet in a dev shell: `POST /api/sync/preview` (inspect the diff + any `IG` hold flag), then `POST /api/sync/apply` with the returned checksum + acknowledged holds. Confirm `GET /api/reference` reports the new version and serves the new tables.
- [ ] Confirm the two under-mapped parsers matched the live sheet (the golden fixtures were derived from it, but the live column offsets for the rebirth cycle-2 transition column and the sell-value block should be re-confirmed against the real CSV — the header-anchor asserts will throw loudly if they moved).
