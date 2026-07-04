# Droid Tycoon Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the single-file tracker as a multi-user SvelteKit + Postgres app deployable via docker-compose, per `docs/superpowers/specs/2026-07-03-platform-design.md`.

**Architecture:** One SvelteKit app (UI + `/api/*` JSON routes) and one Postgres. Pure game math in `src/lib/game/` (no DOM, no env). Business logic in `src/lib/server/services/*` as functions taking a `db` handle (integration-tested against real Postgres); route files are thin adapters. Reference game data is seeded from the prototype, user data is row-level (counts/plans), UI is a functional skeleton for a later design session.

**Tech Stack:** SvelteKit 2 / Svelte 5 (adapter-node), TypeScript, Drizzle ORM + drizzle-kit, postgres.js, @node-rs/argon2, Vitest, Playwright, Docker Compose, Postgres 16.

## Global Constraints

- Node 22. Package manager: npm. All app code lives under `app/`; run npm commands from `app/`.
- `src/lib/game/**` and `src/lib/server/services/**` MUST NOT import `$env/*`, `$app/*`, or `src/lib/server/db.ts` — they take data / a `db` handle as arguments so Vitest can run them without the SvelteKit runtime.
- Tier names are exactly `"Base" | "Gold" | "Diamond" | "Rainbow" | "Beskar"` (order matters). Rarities: `Common, Rare, Epic, Legendary, Mythic, Iconic`.
- API errors are JSON `{error: string, code: string}` with status 401/403/404/409/422 via the `ApiError` class (Task 8). No silent failures.
- Session cookie name: `session`; httpOnly, sameSite lax, path `/`, 30-day expiry.
- Env vars (all required in prod): `DATABASE_URL`, `SESSION_SECRET` (reserved for future signed payloads; generate anyway), `INVITE_CODE`.
- Dev database: `postgres://dtt:dtt@localhost:5432/dtt`; test database `postgres://dtt:dtt@localhost:5432/dtt_test` (override with `DATABASE_URL_TEST`).
- The prototype (`prototype/index.html`) stays functional and untouched except for the Task 1 move + root redirect stub.
- Commit after every task (steps say when). Commit messages: conventional (`feat:`, `test:`, `chore:`).

---

### Task 1: Repo restructure + SvelteKit scaffold

**Files:**
- Move: `index.html` → `prototype/index.html`, `schema.sql` → `prototype/schema.sql`
- Create: `index.html` (redirect stub), `app/` (scaffolded SvelteKit project), `app/vitest.config.ts`
- Modify: `app/svelte.config.js`, `README.md`

**Interfaces:**
- Produces: the `app/` project every later task works inside; adapter-node build (`node build`).

- [ ] **Step 1: Move the prototype and add a hash-preserving redirect stub**

```bash
mkdir -p prototype
git mv index.html prototype/index.html
git mv schema.sql prototype/schema.sql
```

Create root `index.html` (the prototype keeps state in the URL hash — a meta refresh would drop it, so redirect via script):

```html
<!doctype html><meta charset="utf-8"><title>Droid Tycoon Tracker</title>
<script>location.replace('prototype/'+location.hash);</script>
<a href="prototype/">Tracker moved — click if not redirected.</a>
```

- [ ] **Step 2: Scaffold SvelteKit**

```bash
npx sv create app --template minimal --types ts --no-add-ons --install npm
```

If the flags are rejected (sv CLI changes), run `npx sv create app` interactively: template **SvelteKit minimal**, **TypeScript**, **no add-ons**, install with **npm**.

- [ ] **Step 3: Add dependencies and adapter-node**

```bash
cd app
npm i drizzle-orm postgres @node-rs/argon2
npm i -D drizzle-kit vitest @playwright/test @sveltejs/adapter-node
```

Edit `app/svelte.config.js` — replace the adapter import line:

```js
import adapter from '@sveltejs/adapter-node';
```

(the rest of the scaffolded config stays as generated).

- [ ] **Step 4: Add Vitest config and npm scripts**

Create `app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: { include: ['src/**/*.test.ts'] }
});
```

In `app/package.json` add to `"scripts"`:

```json
"test:unit": "vitest run src/lib/game",
"test:int": "vitest run src/lib/server --no-file-parallelism",
"db:generate": "drizzle-kit generate",
"db:migrate": "node drizzle/migrate.mjs",
"db:seed": "node drizzle/seed.mjs"
```

- [ ] **Step 5: Verify the scaffold builds**

Run: `cd app && npm run build`
Expected: build completes, `build/` directory produced (adapter-node output).

- [ ] **Step 6: Update README and commit**

In `README.md`, under the title, add:

```markdown
> **Repo layout:** `app/` is the multi-user web app (SvelteKit + Postgres — see
> `docs/superpowers/specs/2026-07-03-platform-design.md`). `prototype/` is the frozen
> single-file tracker it replaces; open `prototype/index.html` to use it as before.
```

```bash
git add -A
git commit -m "chore: move prototype to prototype/, scaffold SvelteKit app"
```

---

### Task 2: Dev database + Drizzle schema + first migration

**Files:**
- Create: `docker-compose.dev.yml`, `scripts/dev-init.sql`, `app/drizzle.config.ts`, `app/src/lib/server/schema.ts`, `app/drizzle/migrate.mjs`, `app/src/lib/server/db.ts`
- Generated: `app/drizzle/migrations/*` (via drizzle-kit)

**Interfaces:**
- Produces: every table object exported from `schema.ts` with these exact names: `users, sessions, profiles, counts, plans, droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, dataVersions`. `db.ts` exports `db` (SvelteKit-only) and type `Db`.

- [ ] **Step 1: Dev compose + init script (creates the test DB too)**

Create `scripts/dev-init.sql`:

```sql
create database dtt_test;
```

Create `docker-compose.dev.yml` (repo root):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: dtt
      POSTGRES_PASSWORD: dtt
      POSTGRES_DB: dtt
    ports: ["5432:5432"]
    volumes:
      - dtt-dev-pg:/var/lib/postgresql/data
      - ./scripts/dev-init.sql:/docker-entrypoint-initdb.d/10-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dtt"]
      interval: 3s
      timeout: 3s
      retries: 20
volumes:
  dtt-dev-pg:
```

Run: `docker compose -f docker-compose.dev.yml up -d --wait`
Expected: db healthy.

- [ ] **Step 2: Write the Drizzle schema**

Create `app/src/lib/server/schema.ts`:

```ts
import {
	pgTable, serial, text, integer, bigint, timestamp, jsonb, primaryKey
} from 'drizzle-orm/pg-core';

// ---------- user zone ----------
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	username: text('username').notNull().unique(),
	pwHash: text('pw_hash').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	token: text('token').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const profiles = pgTable('profiles', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	cycle: integer('cycle').notNull().default(1),
	currentRebirth: integer('current_rebirth').notNull().default(0),
	prefs: jsonb('prefs').notNull().default({})
});

export const counts = pgTable('counts', {
	profileId: integer('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
	cycle: integer('cycle').notNull(),
	droid: text('droid').notNull(),
	tier: text('tier').notNull(),
	n: integer('n').notNull()
}, (t) => [primaryKey({ columns: [t.profileId, t.cycle, t.droid, t.tier] })]);

export const plans = pgTable('plans', {
	profileId: integer('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
	cycle: integer('cycle').notNull(),
	rebirth: integer('rebirth').notNull()
}, (t) => [primaryKey({ columns: [t.profileId, t.cycle, t.rebirth] })]);

// ---------- reference zone (no FKs from user zone — see spec) ----------
export const droids = pgTable('droids', {
	name: text('name').primaryKey(),
	rarity: text('rarity').notNull(),
	type: text('type').notNull()
});

export const droidTiers = pgTable('droid_tiers', {
	droid: text('droid').notNull(),
	tier: text('tier').notNull(),
	buy: bigint('buy', { mode: 'number' }),
	income: bigint('income', { mode: 'number' }),
	sell: bigint('sell', { mode: 'number' })
}, (t) => [primaryKey({ columns: [t.droid, t.tier] })]);

export const rebirthReqs = pgTable('rebirth_reqs', {
	cycle: integer('cycle').notNull(),
	rebirth: integer('rebirth').notNull(),
	droid: text('droid').notNull(),
	tier: text('tier').notNull(),
	credits: text('credits').notNull(),
	unlock: text('unlock')
}, (t) => [primaryKey({ columns: [t.cycle, t.rebirth, t.droid, t.tier] })]);

export const chipCosts = pgTable('chip_costs', {
	rarity: text('rarity').primaryKey(),
	toGold: integer('to_gold').notNull(),
	toDiamond: integer('to_diamond').notNull(),
	toRainbow: integer('to_rainbow').notNull(),
	toBeskar: integer('to_beskar').notNull()
});

export const rebirthMeta = pgTable('rebirth_meta', {
	rebirth: integer('rebirth').primaryKey(),
	nova: integer('nova').notNull(),
	creditMult: integer('credit_mult').notNull(),
	xpMult: integer('xp_mult').notNull()
});

export const novaShop = pgTable('nova_shop', {
	category: text('category').notNull(),
	item: text('item').notNull(),
	level: integer('level').notNull(),
	cost: integer('cost').notNull()
}, (t) => [primaryKey({ columns: [t.category, t.item, t.level] })]);

export const cosmetics = pgTable('cosmetics', {
	category: text('category').notNull(),
	name: text('name').notNull(),
	requirement: text('requirement').notNull()
}, (t) => [primaryKey({ columns: [t.category, t.name] })]);

export const dataVersions = pgTable('data_versions', {
	id: serial('id').primaryKey(),
	ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
	source: text('source').notNull(),
	checksum: text('checksum').notNull()
});
```

- [ ] **Step 3: Drizzle config + migration runner**

Create `app/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/schema.ts',
	out: './drizzle/migrations',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt' }
});
```

Create `app/drizzle/migrate.mjs` (plain JS so the prod container needs no TS toolchain):

```js
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt';
const sql = postgres(url, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: new URL('./migrations', import.meta.url).pathname });
await sql.end();
console.log('migrations applied');
```

- [ ] **Step 4: db client (SvelteKit-only module)**

Create `app/src/lib/server/db.ts`:

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const client = postgres(env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt');
export const db = drizzle(client, { schema });
export type Db = typeof db;
```

Note: `Db` is the type every service function takes as its first parameter. Tests build their own instance (Task 8) — they never import this file.

- [ ] **Step 5: Generate + apply the migration; verify tables exist**

```bash
cd app
npm run db:generate
npm run db:migrate
docker compose -f ../docker-compose.dev.yml exec db psql -U dtt -d dtt -c '\dt'
```

Expected: one migration file under `app/drizzle/migrations/`; `\dt` lists all 13 tables. Also apply to the test DB:

```bash
DATABASE_URL=postgres://dtt:dtt@localhost:5432/dtt_test npm run db:migrate
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: drizzle schema, migrations, dev database compose"
```

---

### Task 3: Game math — tiers + inventory

**Files:**
- Create: `app/src/lib/game/tiers.ts`, `app/src/lib/game/inventory.ts`
- Test: `app/src/lib/game/inventory.test.ts`

**Interfaces:**
- Produces:
  - `tiers.ts`: `export const TIERS = ['Base','Gold','Diamond','Rainbow','Beskar'] as const; export type Tier = (typeof TIERS)[number]; export const RIDX: Record<Tier, number>; export function isTier(x: string): x is Tier`
  - `inventory.ts`: `export type CountRow = { cycle: number; droid: string; tier: Tier; n: number }; export function ownedIdx(counts: CountRow[], cycle: number, droid: string): number` (highest owned tier index, −1 if none); `export function isMet(counts: CountRow[], cycle: number, droid: string, tier: Tier): boolean` (counts-as: higher tier satisfies lower); `export function totalOf(counts: CountRow[], cycle: number, droid: string): number`

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/game/inventory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ownedIdx, isMet, totalOf, type CountRow } from './inventory';

const counts: CountRow[] = [
	{ cycle: 1, droid: 'CYCLO-GRAV', tier: 'Rainbow', n: 1 },
	{ cycle: 1, droid: 'CYCLO-GRAV', tier: 'Base', n: 2 },
	{ cycle: 1, droid: 'MOUSE', tier: 'Gold', n: 3 },
	{ cycle: 2, droid: 'MOUSE', tier: 'Beskar', n: 1 }
];

describe('ownedIdx', () => {
	it('returns highest owned tier index in the right cycle', () => {
		expect(ownedIdx(counts, 1, 'CYCLO-GRAV')).toBe(3); // Rainbow
		expect(ownedIdx(counts, 2, 'MOUSE')).toBe(4); // Beskar
	});
	it('returns -1 when unowned in that cycle', () => {
		expect(ownedIdx(counts, 2, 'CYCLO-GRAV')).toBe(-1);
	});
});

describe('isMet (counts-as-higher-tier)', () => {
	it('higher tier satisfies lower requirement', () => {
		expect(isMet(counts, 1, 'CYCLO-GRAV', 'Gold')).toBe(true);
	});
	it('exact tier satisfies', () => {
		expect(isMet(counts, 1, 'CYCLO-GRAV', 'Rainbow')).toBe(true);
	});
	it('lower tier does not satisfy higher requirement', () => {
		expect(isMet(counts, 1, 'CYCLO-GRAV', 'Beskar')).toBe(false);
	});
	it('unowned droid never satisfies', () => {
		expect(isMet(counts, 1, 'GONK', 'Base')).toBe(false);
	});
});

describe('totalOf', () => {
	it('sums copies across tiers within a cycle', () => {
		expect(totalOf(counts, 1, 'CYCLO-GRAV')).toBe(3);
		expect(totalOf(counts, 1, 'GONK')).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/lib/game/inventory.test.ts`
Expected: FAIL — cannot resolve `./inventory`.

- [ ] **Step 3: Implement**

Create `app/src/lib/game/tiers.ts`:

```ts
export const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar'] as const;
export type Tier = (typeof TIERS)[number];
export const RIDX: Record<Tier, number> = { Base: 0, Gold: 1, Diamond: 2, Rainbow: 3, Beskar: 4 };
export function isTier(x: string): x is Tier {
	return (TIERS as readonly string[]).includes(x);
}
```

Create `app/src/lib/game/inventory.ts`:

```ts
import { RIDX, type Tier } from './tiers';

export type CountRow = { cycle: number; droid: string; tier: Tier; n: number };

export function ownedIdx(counts: CountRow[], cycle: number, droid: string): number {
	let mx = -1;
	for (const c of counts)
		if (c.cycle === cycle && c.droid === droid && c.n > 0 && RIDX[c.tier] > mx) mx = RIDX[c.tier];
	return mx;
}

export function isMet(counts: CountRow[], cycle: number, droid: string, tier: Tier): boolean {
	return ownedIdx(counts, cycle, droid) >= RIDX[tier];
}

export function totalOf(counts: CountRow[], cycle: number, droid: string): number {
	let s = 0;
	for (const c of counts) if (c.cycle === cycle && c.droid === droid) s += c.n;
	return s;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/lib/game/inventory.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/game && git commit -m "feat: tier constants and inventory math (ownedIdx/isMet/totalOf)"
```

---

### Task 4: Game math — planner dedupe

**Files:**
- Create: `app/src/lib/game/planner.ts`
- Test: `app/src/lib/game/planner.test.ts`

**Interfaces:**
- Consumes: `Tier`, `RIDX` from `./tiers`.
- Produces: `export type Requirement = { rebirth: number; droid: string; tier: Tier }; export function combinedNeeds(reqs: Requirement[], selected: ReadonlySet<number>): { droid: string; tier: Tier }[]` — requirements of selected rebirths, deduped to the highest tier per droid, sorted by tier desc then name asc (prototype behavior).

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/game/planner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { combinedNeeds, type Requirement } from './planner';

const reqs: Requirement[] = [
	{ rebirth: 1, droid: 'CB', tier: 'Base' },
	{ rebirth: 2, droid: 'CB', tier: 'Gold' },
	{ rebirth: 2, droid: 'R3', tier: 'Base' },
	{ rebirth: 3, droid: 'CB', tier: 'Base' },
	{ rebirth: 3, droid: 'ARG', tier: 'Beskar' }
];

describe('combinedNeeds', () => {
	it('dedupes to highest tier per droid across selected rebirths', () => {
		expect(combinedNeeds(reqs, new Set([1, 2, 3]))).toEqual([
			{ droid: 'ARG', tier: 'Beskar' },
			{ droid: 'CB', tier: 'Gold' },
			{ droid: 'R3', tier: 'Base' }
		]);
	});
	it('ignores unselected rebirths', () => {
		expect(combinedNeeds(reqs, new Set([1]))).toEqual([{ droid: 'CB', tier: 'Base' }]);
	});
	it('empty selection yields empty list', () => {
		expect(combinedNeeds(reqs, new Set())).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/game/planner.test.ts`
Expected: FAIL — cannot resolve `./planner`.

- [ ] **Step 3: Implement**

Create `app/src/lib/game/planner.ts`:

```ts
import { RIDX, TIERS, type Tier } from './tiers';

export type Requirement = { rebirth: number; droid: string; tier: Tier };

export function combinedNeeds(
	reqs: Requirement[],
	selected: ReadonlySet<number>
): { droid: string; tier: Tier }[] {
	const need = new Map<string, number>();
	for (const r of reqs) {
		if (!selected.has(r.rebirth)) continue;
		const i = RIDX[r.tier];
		const cur = need.get(r.droid);
		if (cur == null || i > cur) need.set(r.droid, i);
	}
	return [...need.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([droid, i]) => ({ droid, tier: TIERS[i] }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/game/planner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/game && git commit -m "feat: planner combined-needs dedupe"
```

---

### Task 5: Game math — chip costs

**Files:**
- Create: `app/src/lib/game/chips.ts`
- Test: `app/src/lib/game/chips.test.ts`

**Interfaces:**
- Consumes: `Tier`, `RIDX` from `./tiers`.
- Produces: `export type ChipSteps = [number, number, number, number]` (toGold, toDiamond, toRainbow, toBeskar); `export function cumChips(steps: ChipSteps, targetTier: Tier): number` (chips from Base to target; 0 for Base); `export function stepChips(steps: ChipSteps, fromTier: Tier): number | null` (chips to upgrade out of fromTier; null at Beskar).

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/game/chips.test.ts` (values are the prototype's `Common` row `[5,25,40,80]`):

```ts
import { describe, it, expect } from 'vitest';
import { cumChips, stepChips, type ChipSteps } from './chips';

const common: ChipSteps = [5, 25, 40, 80];

describe('cumChips', () => {
	it('Base costs nothing', () => expect(cumChips(common, 'Base')).toBe(0));
	it('accumulates to target', () => {
		expect(cumChips(common, 'Gold')).toBe(5);
		expect(cumChips(common, 'Diamond')).toBe(30);
		expect(cumChips(common, 'Beskar')).toBe(150);
	});
});

describe('stepChips', () => {
	it('cost to leave a tier', () => {
		expect(stepChips(common, 'Base')).toBe(5);
		expect(stepChips(common, 'Rainbow')).toBe(80);
	});
	it('null at top tier', () => expect(stepChips(common, 'Beskar')).toBeNull());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/game/chips.test.ts`
Expected: FAIL — cannot resolve `./chips`.

- [ ] **Step 3: Implement**

Create `app/src/lib/game/chips.ts`:

```ts
import { RIDX, type Tier } from './tiers';

export type ChipSteps = [number, number, number, number];

export function cumChips(steps: ChipSteps, targetTier: Tier): number {
	let c = 0;
	for (let i = 0; i < RIDX[targetTier]; i++) c += steps[i];
	return c;
}

export function stepChips(steps: ChipSteps, fromTier: Tier): number | null {
	const i = RIDX[fromTier];
	return i >= steps.length ? null : steps[i];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/game/chips.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/game && git commit -m "feat: chip upgrade cost math"
```

---

### Task 6: Game math — ROI

**Files:**
- Create: `app/src/lib/game/roi.ts`
- Test: `app/src/lib/game/roi.test.ts`

**Interfaces:**
- Consumes: `Tier` from `./tiers`.
- Produces: `export type TierStat = { droid: string; rarity: string; type: string; tier: Tier; buy: number | null; income: number | null }; export type RoiRow = TierStat & { paybackSeconds: number; incomePer1k: number }; export function roiTable(stats: TierStat[]): RoiRow[]` — drops rows with null/zero buy or income, computes paybackSeconds = buy/income and incomePer1k = income/buy*1000, sorted by paybackSeconds ascending.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/game/roi.test.ts` (MOUSE values are real sheet data):

```ts
import { describe, it, expect } from 'vitest';
import { roiTable, type TierStat } from './roi';

const stats: TierStat[] = [
	{ droid: 'MOUSE', rarity: 'Common', type: 'Worker', tier: 'Base', buy: 950, income: 2 },
	{ droid: 'MOUSE', rarity: 'Common', type: 'Worker', tier: 'Beskar', buy: 15200, income: 24 },
	{ droid: 'NO-DATA', rarity: 'Mythic', type: 'Battle', tier: 'Base', buy: null, income: 5 },
	{ droid: 'FREEBIE', rarity: 'Common', type: 'Worker', tier: 'Base', buy: 0, income: 1 }
];

describe('roiTable', () => {
	it('computes payback and income-per-1k, sorted best-first', () => {
		const rows = roiTable(stats);
		expect(rows.map((r) => `${r.droid}:${r.tier}`)).toEqual(['MOUSE:Base', 'MOUSE:Beskar']);
		expect(rows[0].paybackSeconds).toBe(475);
		expect(rows[0].incomePer1k).toBeCloseTo(2.105, 3);
		expect(rows[1].paybackSeconds).toBeCloseTo(633.33, 2);
	});
	it('drops rows without usable buy/income', () => {
		expect(roiTable(stats).find((r) => r.droid === 'NO-DATA')).toBeUndefined();
		expect(roiTable(stats).find((r) => r.droid === 'FREEBIE')).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/game/roi.test.ts`
Expected: FAIL — cannot resolve `./roi`.

- [ ] **Step 3: Implement**

Create `app/src/lib/game/roi.ts`:

```ts
import type { Tier } from './tiers';

export type TierStat = {
	droid: string;
	rarity: string;
	type: string;
	tier: Tier;
	buy: number | null;
	income: number | null;
};

export type RoiRow = TierStat & { paybackSeconds: number; incomePer1k: number };

export function roiTable(stats: TierStat[]): RoiRow[] {
	return stats
		.filter((s) => s.buy != null && s.buy > 0 && s.income != null && s.income > 0)
		.map((s) => ({
			...s,
			paybackSeconds: (s.buy as number) / (s.income as number),
			incomePer1k: ((s.income as number) / (s.buy as number)) * 1000
		}))
		.sort((a, b) => a.paybackSeconds - b.paybackSeconds);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/game/roi.test.ts`
Expected: PASS (2 tests). Also run the whole unit suite: `npm run test:unit` → all green.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/game && git commit -m "feat: ROI math (payback seconds, income per 1k credits)"
```

---

### Task 7: Reference data extraction + seed

**Files:**
- Create: `scripts/extract-prototype-data.mjs`, `app/drizzle/seed.mjs`
- Generated: `app/drizzle/seed-data.json`

**Interfaces:**
- Consumes: `prototype/schema.sql` (droids/droid_tiers/rebirths/chip_costs inserts) and `prototype/index.html` (`NOVASHOP`, `COSMETICS`, `NOVA`, `CRED`, `XP` const literals).
- Produces: `app/drizzle/seed-data.json` with keys `droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics`; `npm run db:seed` fills the reference zone and records a `data_versions` row with source `prototype-constants`.

- [ ] **Step 1: Write the extraction script**

Create `scripts/extract-prototype-data.mjs`:

```js
// Extracts reference game data from the frozen prototype into seed-data.json.
// SQL inserts cover droids/tiers/rebirths/chips; JS consts cover nova/cosmetics/meta.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const sql = readFileSync('prototype/schema.sql', 'utf8');
const html = readFileSync('prototype/index.html', 'utf8');

// --- generic SQL tuple parser (values are numbers or single-quoted strings) ---
function tuples(insertRegex) {
	const m = sql.match(insertRegex);
	if (!m) throw new Error(`insert not found: ${insertRegex}`);
	const body = m[1];
	const out = [];
	const tupleRe = /\(([^()]*)\)/g;
	let t;
	while ((t = tupleRe.exec(body))) {
		const vals = [];
		const valRe = /'((?:[^']|'')*)'|(-?\d+)/g;
		let v;
		while ((v = valRe.exec(t[1]))) vals.push(v[1] != null ? v[1].replace(/''/g, "'") : Number(v[2]));
		out.push(vals);
	}
	return out;
}

const droids = tuples(/insert into droids[^;]*values([\s\S]*?);/).map(([name, rarity, type]) => ({
	name, rarity, type
}));
const droidTiers = tuples(/insert into droid_tiers[^;]*values([\s\S]*?);/).map(
	([droid, tier, buy, income, sell]) => ({ droid, tier, buy, income, sell })
);
const rebirthReqs = tuples(/insert into rebirths[^;]*values([\s\S]*?);/).map(
	([cycle, rebirth, credits, unlock, droid, tier]) => ({
		cycle, rebirth, credits, unlock: String(unlock).trim() || null, droid, tier
	})
);
const chipCosts = tuples(/insert into chip_costs[^;]*values([\s\S]*?);/).map(
	([rarity, toGold, toDiamond, toRainbow, toBeskar]) => ({ rarity, toGold, toDiamond, toRainbow, toBeskar })
);

// --- JS const literals from the prototype (evaluated in a bare sandbox) ---
function jsConst(name) {
	const m = html.match(new RegExp(`const ${name}=([\\s\\S]*?);\\s*(?:\\n|const |function )`));
	if (!m) throw new Error(`const ${name} not found`);
	return vm.runInNewContext(`(${m[1]})`, {});
}
const NOVASHOP = jsConst('NOVASHOP'); // {category: [[item,[costs...]],...]}
const COSMETICS = jsConst('COSMETICS'); // [[name, requirement],...]
const NOVA = jsConst('NOVA'); const CRED = jsConst('CRED'); const XP = jsConst('XP');

const novaShop = Object.entries(NOVASHOP).flatMap(([category, items]) =>
	items.flatMap(([item, costs]) => costs.map((cost, i) => ({ category, item, level: i + 1, cost })))
);
const cosmetics = COSMETICS.map(([name, requirement]) => ({ category: 'general', name, requirement }));
const rebirthMeta = Object.keys(NOVA).map((rb) => ({
	rebirth: Number(rb), nova: NOVA[rb], creditMult: CRED[rb], xpMult: XP[rb]
}));

const data = { droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics };
writeFileSync('app/drizzle/seed-data.json', JSON.stringify(data, null, 1));
console.log(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])));
```

- [ ] **Step 2: Run it and sanity-check the counts**

Run: `node scripts/extract-prototype-data.mjs`
Expected output (approximately — verify against the prototype): `droids: 68`, `droidTiers: 340` (68×5), `rebirthReqs: ~324` (4 cycles × 27 × 3), `chipCosts: 5`, `rebirthMeta: 16` (RB12–27), `novaShop: >40`, `cosmetics: 15`. If any count is 0, the regex missed its block — fix before proceeding.

- [ ] **Step 3: Write the seed script**

Create `app/drizzle/seed.mjs`:

```js
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt';
const raw = readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8');
const d = JSON.parse(raw);
const sql = postgres(url, { max: 1 });

await sql.begin(async (tx) => {
	// replace-all semantics: reference zone is owned by the seeder (later: sync worker)
	await tx`truncate droids, droid_tiers, rebirth_reqs, chip_costs, rebirth_meta, nova_shop, cosmetics`;
	for (const r of d.droids) await tx`insert into droids ${tx(r)}`;
	for (const r of d.droidTiers)
		await tx`insert into droid_tiers ${tx({ droid: r.droid, tier: r.tier, buy: r.buy, income: r.income, sell: r.sell })}`;
	for (const r of d.rebirthReqs)
		await tx`insert into rebirth_reqs ${tx({ cycle: r.cycle, rebirth: r.rebirth, droid: r.droid, tier: r.tier, credits: r.credits, unlock: r.unlock })}`;
	for (const r of d.chipCosts)
		await tx`insert into chip_costs ${tx({ rarity: r.rarity, to_gold: r.toGold, to_diamond: r.toDiamond, to_rainbow: r.toRainbow, to_beskar: r.toBeskar })}`;
	for (const r of d.rebirthMeta)
		await tx`insert into rebirth_meta ${tx({ rebirth: r.rebirth, nova: r.nova, credit_mult: r.creditMult, xp_mult: r.xpMult })}`;
	for (const r of d.novaShop) await tx`insert into nova_shop ${tx(r)}`;
	for (const r of d.cosmetics) await tx`insert into cosmetics ${tx(r)}`;
	await tx`insert into data_versions ${tx({
		source: 'prototype-constants',
		checksum: createHash('sha256').update(raw).digest('hex')
	})}`;
});
await sql.end();
console.log('seeded');
```

- [ ] **Step 4: Seed dev DB and verify**

```bash
cd app && npm run db:seed
docker compose -f ../docker-compose.dev.yml exec db psql -U dtt -d dtt \
  -c "select (select count(*) from droids) droids, (select count(*) from droid_tiers) tiers, (select count(*) from rebirth_reqs) reqs, (select count(*) from data_versions) versions;"
```

Expected: droids=68, tiers=340, reqs≈324, versions=1. Rerun `npm run db:seed` — counts unchanged, versions=2 (idempotent replace, new version row).

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-prototype-data.mjs app/drizzle
git commit -m "feat: extract prototype reference data and seed script"
```

### Task 8: ApiError, test-DB harness, users service (register/login/sessions)

**Files:**
- Create: `app/src/lib/server/api-error.ts`, `app/src/lib/server/testing/db.ts`, `app/src/lib/server/services/users.ts`
- Test: `app/src/lib/server/services/users.integration.test.ts`

**Interfaces:**
- Produces:
  - `api-error.ts`: `export class ApiError extends Error { constructor(public status: number, public code: string, message: string) }`
  - `testing/db.ts`: `export async function testDb(): Promise<{ db: Db; sql: postgres.Sql }>` (migrated test DB); `export async function resetUserZone(sql: postgres.Sql): Promise<void>`
  - `services/users.ts`:
    - `register(db: Db, input: { username: string; password: string; inviteCode: string }, expectedInvite: string): Promise<{ id: number; username: string }>` — 403 `bad_invite`, 409 `username_taken`, 422 `invalid_input` (username <2 chars or password <8)
    - `login(db: Db, input: { username: string; password: string }): Promise<{ user: { id: number; username: string }; token: string; expiresAt: Date }>` — 401 `bad_credentials`
    - `createSession(db: Db, userId: number): Promise<{ token: string; expiresAt: Date }>`
    - `validateSession(db: Db, token: string): Promise<{ id: number; username: string } | null>` (null on missing/expired; expired rows deleted)
    - `logout(db: Db, token: string): Promise<void>`
- Note: `Db` here and below is `import type { Db } from '../db'` — **type-only** imports of `db.ts` are allowed (they don't execute `$env`); runtime imports are not.

- [ ] **Step 1: Write the test harness**

Create `app/src/lib/server/testing/db.ts`:

```ts
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../schema';

const url = process.env.DATABASE_URL_TEST ?? 'postgres://dtt:dtt@localhost:5432/dtt_test';
let cached: { db: ReturnType<typeof drizzle<typeof schema>>; sql: postgres.Sql } | null = null;

export async function testDb() {
	if (cached) return cached;
	const sql = postgres(url, { max: 4, onnotice: () => {} });
	const db = drizzle(sql, { schema });
	await migrate(db, { migrationsFolder: 'drizzle/migrations' });
	cached = { db, sql };
	return cached;
}

export async function resetUserZone(sql: postgres.Sql) {
	await sql`truncate users, sessions, profiles, counts, plans restart identity cascade`;
}

export async function seedMinimalReference(sql: postgres.Sql) {
	await sql`truncate droids, droid_tiers, rebirth_reqs, chip_costs, rebirth_meta, nova_shop, cosmetics, data_versions restart identity cascade`;
	await sql`insert into droids (name, rarity, type) values ('MOUSE','Common','Worker'), ('CB','Common','Astromech')`;
	await sql`insert into droid_tiers (droid, tier, buy, income, sell) values
		('MOUSE','Base',950,2,665), ('MOUSE','Beskar',15200,24,10640), ('CB','Base',1000,2,700)`;
	await sql`insert into rebirth_reqs (cycle, rebirth, droid, tier, credits, unlock) values
		(1,1,'CB','Base','10K','Worker Slot'), (1,2,'MOUSE','Gold','150K',null)`;
	await sql`insert into chip_costs (rarity, to_gold, to_diamond, to_rainbow, to_beskar) values ('Common',5,25,40,80)`;
	await sql`insert into rebirth_meta (rebirth, nova, credit_mult, xp_mult) values (12,11,22,110)`;
	await sql`insert into data_versions (source, checksum) values ('test-fixture','deadbeef')`;
}
```

Create `app/src/lib/server/api-error.ts`:

```ts
export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
	}
}
```

- [ ] **Step 2: Write the failing tests**

Create `app/src/lib/server/services/users.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { testDb, resetUserZone } from '../testing/db';
import { register, login, validateSession, logout } from './users';
import { ApiError } from '../api-error';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => resetUserZone(sql));

const INVITE = 'sekrit';
const good = { username: 'jasparke', password: 'hunter2hunter2', inviteCode: INVITE };

describe('register', () => {
	it('creates a user with a valid invite', async () => {
		const u = await register(db, good, INVITE);
		expect(u.username).toBe('jasparke');
	});
	it('rejects a bad invite with 403', async () => {
		await expect(register(db, { ...good, inviteCode: 'nope' }, INVITE)).rejects.toMatchObject({
			status: 403, code: 'bad_invite'
		});
	});
	it('rejects duplicate username with 409', async () => {
		await register(db, good, INVITE);
		await expect(register(db, good, INVITE)).rejects.toMatchObject({ status: 409 });
	});
	it('rejects short password with 422', async () => {
		await expect(register(db, { ...good, password: 'short' }, INVITE)).rejects.toBeInstanceOf(ApiError);
	});
});

describe('login + sessions', () => {
	it('round-trips: login yields a token validateSession accepts', async () => {
		await register(db, good, INVITE);
		const { token, user } = await login(db, { username: 'jasparke', password: good.password });
		expect(await validateSession(db, token)).toMatchObject({ id: user.id, username: 'jasparke' });
	});
	it('rejects wrong password with 401', async () => {
		await register(db, good, INVITE);
		await expect(login(db, { username: 'jasparke', password: 'wrongwrong' })).rejects.toMatchObject({
			status: 401
		});
	});
	it('logout invalidates the token', async () => {
		await register(db, good, INVITE);
		const { token } = await login(db, { username: 'jasparke', password: good.password });
		await logout(db, token);
		expect(await validateSession(db, token)).toBeNull();
	});
	it('unknown token is null', async () => {
		expect(await validateSession(db, 'not-a-token')).toBeNull();
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd app && npm run test:int`
Expected: FAIL — cannot resolve `./users`.

- [ ] **Step 4: Implement the users service**

Create `app/src/lib/server/services/users.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { users, sessions } from '../schema';
import { ApiError } from '../api-error';

const SESSION_DAYS = 30;

export async function register(
	db: Db,
	input: { username: string; password: string; inviteCode: string },
	expectedInvite: string
) {
	if (input.inviteCode !== expectedInvite) throw new ApiError(403, 'bad_invite', 'Invalid invite code');
	const username = input.username?.trim() ?? '';
	if (username.length < 2 || (input.password?.length ?? 0) < 8)
		throw new ApiError(422, 'invalid_input', 'Username min 2 chars, password min 8');
	const pwHash = await hash(input.password);
	try {
		const [u] = await db.insert(users).values({ username, pwHash }).returning();
		return { id: u.id, username: u.username };
	} catch (e: unknown) {
		if ((e as { code?: string }).code === '23505')
			throw new ApiError(409, 'username_taken', 'Username already exists');
		throw e;
	}
}

export async function createSession(db: Db, userId: number) {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
	await db.insert(sessions).values({ token, userId, expiresAt });
	return { token, expiresAt };
}

export async function login(db: Db, input: { username: string; password: string }) {
	const u = await db.query.users.findFirst({ where: eq(users.username, input.username ?? '') });
	if (!u || !(await verify(u.pwHash, input.password ?? '')))
		throw new ApiError(401, 'bad_credentials', 'Wrong username or password');
	const s = await createSession(db, u.id);
	return { user: { id: u.id, username: u.username }, ...s };
}

export async function validateSession(db: Db, token: string) {
	const s = await db.query.sessions.findFirst({ where: eq(sessions.token, token) });
	if (!s) return null;
	if (s.expiresAt < new Date()) {
		await db.delete(sessions).where(eq(sessions.token, token));
		return null;
	}
	const u = await db.query.users.findFirst({ where: eq(users.id, s.userId) });
	return u ? { id: u.id, username: u.username } : null;
}

export async function logout(db: Db, token: string) {
	await db.delete(sessions).where(eq(sessions.token, token));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd app && npm run test:int`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/server && git commit -m "feat: users service (register/login/sessions) + test harness"
```

---

### Task 9: Session hook + auth API routes

**Files:**
- Create: `app/src/hooks.server.ts`, `app/src/app.d.ts` (modify scaffolded), `app/src/lib/server/respond.ts`, `app/src/routes/api/auth/register/+server.ts`, `app/src/routes/api/auth/login/+server.ts`, `app/src/routes/api/auth/logout/+server.ts`, `app/src/routes/api/me/+server.ts`

**Interfaces:**
- Consumes: `validateSession`, `register`, `login`, `logout`, `createSession` (Task 8); `db` from `$lib/server/db`.
- Produces: `event.locals.user: { id: number; username: string } | null` on every request; `respond.ts` exports `guard(fn: () => Promise<Response>): Promise<Response>` (maps `ApiError` → JSON error response) and `requireUser(locals: App.Locals): { id: number; username: string }` (throws 401 `unauthenticated`). Wiring is verified by the Task 19 e2e smoke; services are already covered.

- [ ] **Step 1: Locals typing + hook**

Replace the `App` namespace block in `app/src/app.d.ts` with:

```ts
declare global {
	namespace App {
		interface Locals {
			user: { id: number; username: string } | null;
		}
	}
}
export {};
```

Create `app/src/hooks.server.ts`:

```ts
import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { validateSession } from '$lib/server/services/users';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session');
	event.locals.user = token ? await validateSession(db, token) : null;
	return resolve(event);
};
```

- [ ] **Step 2: Error/guard helpers**

Create `app/src/lib/server/respond.ts`:

```ts
import { json } from '@sveltejs/kit';
import { ApiError } from './api-error';

export async function guard(fn: () => Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof ApiError) return json({ error: e.message, code: e.code }, { status: e.status });
		throw e;
	}
}

export function requireUser(locals: App.Locals): { id: number; username: string } {
	if (!locals.user) throw new ApiError(401, 'unauthenticated', 'Log in first');
	return locals.user;
}
```

- [ ] **Step 3: Auth routes**

Create `app/src/routes/api/auth/register/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { register, createSession } from '$lib/server/services/users';
import { guard } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';

export const POST: RequestHandler = ({ request, cookies }) =>
	guard(async () => {
		const body = await request.json().catch(() => {
			throw new ApiError(422, 'bad_json', 'Body must be JSON');
		});
		const user = await register(db, body, env.INVITE_CODE ?? '');
		const s = await createSession(db, user.id);
		cookies.set('session', s.token, {
			path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, expires: s.expiresAt
		});
		return json({ user }, { status: 201 });
	});
```

Create `app/src/routes/api/auth/login/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { login } from '$lib/server/services/users';
import { guard } from '$lib/server/respond';
import { ApiError } from '$lib/server/api-error';

export const POST: RequestHandler = ({ request, cookies }) =>
	guard(async () => {
		const body = await request.json().catch(() => {
			throw new ApiError(422, 'bad_json', 'Body must be JSON');
		});
		const { user, token, expiresAt } = await login(db, body);
		cookies.set('session', token, {
			path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, expires: expiresAt
		});
		return json({ user });
	});
```

Create `app/src/routes/api/auth/logout/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { logout } from '$lib/server/services/users';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('session');
	if (token) await logout(db, token);
	cookies.delete('session', { path: '/' });
	return json({ ok: true });
};
```

Create `app/src/routes/api/me/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { guard, requireUser } from '$lib/server/respond';

export const GET: RequestHandler = ({ locals }) => guard(async () => json({ user: requireUser(locals) }));
```

- [ ] **Step 4: Manual smoke against dev server**

```bash
cd app && INVITE_CODE=sekrit npm run dev &
sleep 3
curl -s -c /tmp/dtt.jar -X POST localhost:5173/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"username":"smoke","password":"password123","inviteCode":"sekrit"}'
curl -s -b /tmp/dtt.jar localhost:5173/api/me
kill %1
```

Expected: register returns `{"user":{"id":1,"username":"smoke"}}` (201); `/api/me` returns the same user. A wrong invite returns `{"error":"Invalid invite code","code":"bad_invite"}`.

- [ ] **Step 5: Commit**

```bash
git add app/src && git commit -m "feat: session hook and auth API routes"
```

---

### Task 10: Profiles service + routes

**Files:**
- Create: `app/src/lib/server/services/profiles.ts`, `app/src/routes/api/profiles/+server.ts`, `app/src/routes/api/profiles/[id]/+server.ts`
- Test: `app/src/lib/server/services/profiles.integration.test.ts`

**Interfaces:**
- Consumes: `Db`, schema tables, `ApiError`; harness from Task 8.
- Produces (services):
  - `listAllProfiles(db: Db): Promise<Array<{ id: number; userId: number; owner: string; name: string; cycle: number; currentRebirth: number; prefs: unknown }>>` — instance-wide (spec: all members read all)
  - `createProfile(db: Db, userId: number, input: { name: string }): Promise<Profile>` — 422 `invalid_input` on empty name
  - `updateProfile(db: Db, userId: number, profileId: number, patch: { name?: string; cycle?: number; currentRebirth?: number; prefs?: unknown }): Promise<Profile>` — 404 `not_found`, 403 `not_owner`
  - `deleteProfile(db: Db, userId: number, profileId: number): Promise<void>` — same errors
  - `assertOwner(db: Db, userId: number, profileId: number): Promise<void>` — exported; reused by counts/plans/import
- Routes: `GET /api/profiles` → `{ profiles: [...] }`; `POST /api/profiles` (201); `PATCH/DELETE /api/profiles/:id`.

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/server/services/profiles.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { testDb, resetUserZone } from '../testing/db';
import { register } from './users';
import { listAllProfiles, createProfile, updateProfile, deleteProfile } from './profiles';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let alice: { id: number }, bob: { id: number };

beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => {
	await resetUserZone(sql);
	alice = await register(db, { username: 'alice', password: 'password123', inviteCode: 'x' }, 'x');
	bob = await register(db, { username: 'bob', password: 'password123', inviteCode: 'x' }, 'x');
});

describe('profiles', () => {
	it('members see every profile with owner name', async () => {
		await createProfile(db, alice.id, { name: 'main' });
		await createProfile(db, bob.id, { name: 'alt' });
		const all = await listAllProfiles(db);
		expect(all.map((p) => `${p.owner}/${p.name}`).sort()).toEqual(['alice/main', 'bob/alt']);
	});
	it('owner can update; stranger gets 403', async () => {
		const p = await createProfile(db, alice.id, { name: 'main' });
		const upd = await updateProfile(db, alice.id, p.id, { cycle: 2, currentRebirth: 9 });
		expect(upd).toMatchObject({ cycle: 2, currentRebirth: 9 });
		await expect(updateProfile(db, bob.id, p.id, { name: 'stolen' })).rejects.toMatchObject({
			status: 403, code: 'not_owner'
		});
	});
	it('missing profile is 404; delete works for owner', async () => {
		await expect(updateProfile(db, alice.id, 999, {})).rejects.toMatchObject({ status: 404 });
		const p = await createProfile(db, alice.id, { name: 'gone' });
		await deleteProfile(db, alice.id, p.id);
		expect(await listAllProfiles(db)).toHaveLength(0);
	});
	it('empty name rejected with 422', async () => {
		await expect(createProfile(db, alice.id, { name: '  ' })).rejects.toMatchObject({ status: 422 });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test:int`
Expected: FAIL — cannot resolve `./profiles` (users tests still pass).

- [ ] **Step 3: Implement service**

Create `app/src/lib/server/services/profiles.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { profiles, users } from '../schema';
import { ApiError } from '../api-error';

export async function assertOwner(db: Db, userId: number, profileId: number) {
	const p = await db.query.profiles.findFirst({ where: eq(profiles.id, profileId) });
	if (!p) throw new ApiError(404, 'not_found', 'Profile not found');
	if (p.userId !== userId) throw new ApiError(403, 'not_owner', 'Not your profile');
	return p;
}

export async function listAllProfiles(db: Db) {
	const rows = await db
		.select({
			id: profiles.id, userId: profiles.userId, owner: users.username, name: profiles.name,
			cycle: profiles.cycle, currentRebirth: profiles.currentRebirth, prefs: profiles.prefs
		})
		.from(profiles)
		.innerJoin(users, eq(users.id, profiles.userId));
	return rows;
}

export async function createProfile(db: Db, userId: number, input: { name: string }) {
	const name = input.name?.trim() ?? '';
	if (!name) throw new ApiError(422, 'invalid_input', 'Profile name required');
	const [p] = await db.insert(profiles).values({ userId, name }).returning();
	return p;
}

export async function updateProfile(
	db: Db, userId: number, profileId: number,
	patch: { name?: string; cycle?: number; currentRebirth?: number; prefs?: unknown }
) {
	await assertOwner(db, userId, profileId);
	const allowed: Record<string, unknown> = {};
	if (patch.name !== undefined) allowed.name = String(patch.name).trim();
	if (patch.cycle !== undefined) allowed.cycle = patch.cycle;
	if (patch.currentRebirth !== undefined) allowed.currentRebirth = patch.currentRebirth;
	if (patch.prefs !== undefined) allowed.prefs = patch.prefs;
	if (allowed.name === '') throw new ApiError(422, 'invalid_input', 'Profile name required');
	const [p] = await db.update(profiles).set(allowed).where(eq(profiles.id, profileId)).returning();
	return p;
}

export async function deleteProfile(db: Db, userId: number, profileId: number) {
	await assertOwner(db, userId, profileId);
	await db.delete(profiles).where(eq(profiles.id, profileId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test:int`
Expected: PASS (12 tests total).

- [ ] **Step 5: Routes**

Create `app/src/routes/api/profiles/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { listAllProfiles, createProfile } from '$lib/server/services/profiles';

export const GET: RequestHandler = ({ locals }) =>
	guard(async () => {
		requireUser(locals);
		return json({ profiles: await listAllProfiles(db) });
	});

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		return json({ profile: await createProfile(db, user.id, body) }, { status: 201 });
	});
```

Create `app/src/routes/api/profiles/[id]/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { updateProfile, deleteProfile } from '$lib/server/services/profiles';

export const PATCH: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		return json({ profile: await updateProfile(db, user.id, Number(params.id), body) });
	});

export const DELETE: RequestHandler = ({ locals, params }) =>
	guard(async () => {
		const user = requireUser(locals);
		await deleteProfile(db, user.id, Number(params.id));
		return json({ ok: true });
	});
```

- [ ] **Step 6: Commit**

```bash
git add app/src && git commit -m "feat: profiles service and routes (instance-wide read, owner-only write)"
```

---

### Task 11: Counts service + route (row-level upserts, reference validation)

**Files:**
- Create: `app/src/lib/server/services/counts.ts`, `app/src/routes/api/profiles/[id]/counts/[cycle]/[droid]/[tier]/+server.ts`
- Test: `app/src/lib/server/services/counts.integration.test.ts`

**Interfaces:**
- Consumes: `assertOwner` (Task 10), `isTier` (Task 3), `seedMinimalReference` (Task 8 harness).
- Produces: `setCount(db: Db, userId: number, profileId: number, cycle: number, droid: string, tier: string, n: number): Promise<{ n: number }>` — 422 `bad_tier` / `unknown_droid` / `bad_count` (n<0 or not integer), upsert when n>0, delete when n=0. Route: `PUT /api/profiles/:id/counts/:cycle/:droid/:tier` body `{n}` (droid URL-encoded — names contain spaces).

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/server/services/counts.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone, seedMinimalReference } from '../testing/db';
import { register } from './users';
import { createProfile } from './profiles';
import { setCount } from './counts';
import { counts } from '../schema';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number, pid: number;

beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await register(db, { username: 'a', password: 'password123', inviteCode: 'x' }, 'x')).id;
	pid = (await createProfile(db, uid, { name: 'main' })).id;
});

describe('setCount', () => {
	it('upserts and updates a row', async () => {
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 2);
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 5);
		const rows = await db.select().from(counts).where(eq(counts.profileId, pid));
		expect(rows).toEqual([expect.objectContaining({ droid: 'MOUSE', tier: 'Gold', n: 5 })]);
	});
	it('n=0 deletes the row', async () => {
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 2);
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 0);
		expect(await db.select().from(counts).where(eq(counts.profileId, pid))).toHaveLength(0);
	});
	it('rejects unknown droid / bad tier / bad n with 422', async () => {
		await expect(setCount(db, uid, pid, 1, 'NOT-A-DROID', 'Gold', 1)).rejects.toMatchObject({
			status: 422, code: 'unknown_droid'
		});
		await expect(setCount(db, uid, pid, 1, 'MOUSE', 'Platinum', 1)).rejects.toMatchObject({
			status: 422, code: 'bad_tier'
		});
		await expect(setCount(db, uid, pid, 1, 'MOUSE', 'Gold', -1)).rejects.toMatchObject({
			status: 422, code: 'bad_count'
		});
	});
	it('stranger cannot write (403)', async () => {
		const other = (await register(db, { username: 'b', password: 'password123', inviteCode: 'x' }, 'x')).id;
		await expect(setCount(db, other, pid, 1, 'MOUSE', 'Gold', 1)).rejects.toMatchObject({ status: 403 });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test:int`
Expected: FAIL — cannot resolve `./counts`.

- [ ] **Step 3: Implement**

Create `app/src/lib/server/services/counts.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { counts, droids } from '../schema';
import { ApiError } from '../api-error';
import { assertOwner } from './profiles';
import { isTier } from '$lib/game/tiers';

export async function setCount(
	db: Db, userId: number, profileId: number,
	cycle: number, droid: string, tier: string, n: number
) {
	await assertOwner(db, userId, profileId);
	if (!isTier(tier)) throw new ApiError(422, 'bad_tier', `Unknown tier: ${tier}`);
	if (!Number.isInteger(n) || n < 0) throw new ApiError(422, 'bad_count', 'n must be an integer >= 0');
	const d = await db.query.droids.findFirst({ where: eq(droids.name, droid) });
	if (!d) throw new ApiError(422, 'unknown_droid', `Unknown droid: ${droid}`);
	const where = and(
		eq(counts.profileId, profileId), eq(counts.cycle, cycle),
		eq(counts.droid, droid), eq(counts.tier, tier)
	);
	if (n === 0) {
		await db.delete(counts).where(where);
	} else {
		await db
			.insert(counts)
			.values({ profileId, cycle, droid, tier, n })
			.onConflictDoUpdate({ target: [counts.profileId, counts.cycle, counts.droid, counts.tier], set: { n } });
	}
	return { n };
}
```

Note the `$lib/game/tiers` import — game modules importing nothing SvelteKit-specific keeps this legal under the Global Constraints.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test:int`
Expected: PASS.

- [ ] **Step 5: Route**

Create `app/src/routes/api/profiles/[id]/counts/[cycle]/[droid]/[tier]/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { setCount } from '$lib/server/services/counts';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		const res = await setCount(
			db, user.id, Number(params.id), Number(params.cycle),
			decodeURIComponent(params.droid), params.tier, Number(body.n)
		);
		return json(res);
	});
```

- [ ] **Step 6: Commit**

```bash
git add app/src && git commit -m "feat: row-level count upserts with reference validation"
```

---

### Task 12: Plans service + route

**Files:**
- Create: `app/src/lib/server/services/plans.ts`, `app/src/routes/api/profiles/[id]/plans/[cycle]/+server.ts`
- Test: `app/src/lib/server/services/plans.integration.test.ts`

**Interfaces:**
- Consumes: `assertOwner` (Task 10).
- Produces: `replacePlan(db: Db, userId: number, profileId: number, cycle: number, rebirths: number[]): Promise<{ rebirths: number[] }>` — replaces the ticked set for that cycle in one transaction; 422 `bad_rebirth` unless every value is an integer 1–27. Route: `PUT /api/profiles/:id/plans/:cycle` body `{rebirths: number[]}`.

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/server/services/plans.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone } from '../testing/db';
import { register } from './users';
import { createProfile } from './profiles';
import { replacePlan } from './plans';
import { plans } from '../schema';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number, pid: number;

beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await register(db, { username: 'a', password: 'password123', inviteCode: 'x' }, 'x')).id;
	pid = (await createProfile(db, uid, { name: 'main' })).id;
});

describe('replacePlan', () => {
	it('replaces the set atomically', async () => {
		await replacePlan(db, uid, pid, 2, [1, 2, 3]);
		await replacePlan(db, uid, pid, 2, [9, 10]);
		const rows = await db.select().from(plans).where(eq(plans.profileId, pid));
		expect(rows.map((r) => r.rebirth).sort()).toEqual([10, 9].sort());
	});
	it('empty array clears the plan', async () => {
		await replacePlan(db, uid, pid, 2, [4]);
		await replacePlan(db, uid, pid, 2, []);
		expect(await db.select().from(plans).where(eq(plans.profileId, pid))).toHaveLength(0);
	});
	it('rejects out-of-range rebirths with 422', async () => {
		await expect(replacePlan(db, uid, pid, 2, [0])).rejects.toMatchObject({ status: 422 });
		await expect(replacePlan(db, uid, pid, 2, [28])).rejects.toMatchObject({ status: 422 });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test:int`
Expected: FAIL — cannot resolve `./plans`.

- [ ] **Step 3: Implement**

Create `app/src/lib/server/services/plans.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { plans } from '../schema';
import { ApiError } from '../api-error';
import { assertOwner } from './profiles';

export async function replacePlan(
	db: Db, userId: number, profileId: number, cycle: number, rebirths: number[]
) {
	await assertOwner(db, userId, profileId);
	if (!Array.isArray(rebirths) || rebirths.some((r) => !Number.isInteger(r) || r < 1 || r > 27))
		throw new ApiError(422, 'bad_rebirth', 'rebirths must be integers 1-27');
	const uniq = [...new Set(rebirths)];
	await db.transaction(async (tx) => {
		await tx.delete(plans).where(and(eq(plans.profileId, profileId), eq(plans.cycle, cycle)));
		if (uniq.length)
			await tx.insert(plans).values(uniq.map((rebirth) => ({ profileId, cycle, rebirth })));
	});
	return { rebirths: uniq };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test:int`
Expected: PASS.

- [ ] **Step 5: Route + commit**

Create `app/src/routes/api/profiles/[id]/plans/[cycle]/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { replacePlan } from '$lib/server/services/plans';

export const PUT: RequestHandler = ({ locals, params, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		return json(await replacePlan(db, user.id, Number(params.id), Number(params.cycle), body.rebirths));
	});
```

```bash
git add app/src && git commit -m "feat: plan replacement service and route"
```

---

### Task 13: Reference service + route

**Files:**
- Create: `app/src/lib/server/services/reference.ts`, `app/src/routes/api/reference/+server.ts`
- Test: `app/src/lib/server/services/reference.integration.test.ts`

**Interfaces:**
- Consumes: harness `seedMinimalReference`.
- Produces: `getReference(db: Db): Promise<Reference>` where `Reference = { version: { id: number; ingestedAt: string; source: string } | null; droids: ...[]; droidTiers: ...[]; rebirthReqs: ...[]; chipCosts: ...[]; rebirthMeta: ...[]; novaShop: ...[]; cosmetics: ...[] }` (rows as stored). Route: `GET /api/reference` (auth required) with `Cache-Control: private, max-age=300`.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/server/services/reference.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { testDb, seedMinimalReference } from '../testing/db';
import { getReference } from './reference';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});

describe('getReference', () => {
	it('returns all reference tables and the newest version', async () => {
		const ref = await getReference(db);
		expect(ref.droids.map((d) => d.name).sort()).toEqual(['CB', 'MOUSE']);
		expect(ref.droidTiers.length).toBe(3);
		expect(ref.rebirthReqs.length).toBe(2);
		expect(ref.chipCosts[0].rarity).toBe('Common');
		expect(ref.rebirthMeta[0]).toMatchObject({ rebirth: 12, nova: 11 });
		expect(ref.version?.source).toBe('test-fixture');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test:int`
Expected: FAIL — cannot resolve `./reference`.

- [ ] **Step 3: Implement service + route**

Create `app/src/lib/server/services/reference.ts`:

```ts
import { desc } from 'drizzle-orm';
import type { Db } from '../db';
import {
	droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, dataVersions
} from '../schema';

export async function getReference(db: Db) {
	const [d, dt, rr, cc, rm, ns, cos, ver] = await Promise.all([
		db.select().from(droids),
		db.select().from(droidTiers),
		db.select().from(rebirthReqs),
		db.select().from(chipCosts),
		db.select().from(rebirthMeta),
		db.select().from(novaShop),
		db.select().from(cosmetics),
		db.select().from(dataVersions).orderBy(desc(dataVersions.id)).limit(1)
	]);
	return {
		version: ver[0] ?? null,
		droids: d, droidTiers: dt, rebirthReqs: rr, chipCosts: cc,
		rebirthMeta: rm, novaShop: ns, cosmetics: cos
	};
}
```

Create `app/src/routes/api/reference/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { getReference } from '$lib/server/services/reference';

export const GET: RequestHandler = ({ locals, setHeaders }) =>
	guard(async () => {
		requireUser(locals);
		setHeaders({ 'cache-control': 'private, max-age=300' });
		return json(await getReference(db));
	});
```

- [ ] **Step 4: Run tests, then commit**

Run: `cd app && npm run test:int` → PASS.

```bash
git add app/src && git commit -m "feat: reference dataset service and route"
```

---

### Task 14: Import service + route (prototype export codes)

**Files:**
- Create: `app/src/lib/server/services/importer.ts`, `app/src/routes/api/import/+server.ts`
- Test: `app/src/lib/server/services/importer.integration.test.ts`

**Interfaces:**
- Consumes: `assertOwner`-free (creates its own profile), `isTier`, schema tables, harness.
- Produces: `importCode(db: Db, userId: number, code: string): Promise<{ profileId: number; name: string; imported: number; skipped: string[] }>` — decodes the prototype's `{__dt:1, profile}` base64 (leading `#` tolerated), creates profile + counts + plans in ONE transaction. Unknown droids/tiers inside a valid code are skipped and reported in `skipped` (legacy data tolerance); a structurally invalid code is 422 `bad_code` with nothing created. Route: `POST /api/import` body `{code}` → 201.

- [ ] **Step 1: Write the failing tests**

Create `app/src/lib/server/services/importer.integration.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone, seedMinimalReference } from '../testing/db';
import { register } from './users';
import { importCode } from './importer';
import { counts, plans, profiles } from '../schema';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number;

const mkCode = (profile: unknown) =>
	Buffer.from(JSON.stringify({ __dt: 1, profile }), 'utf8').toString('base64');

beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await register(db, { username: 'a', password: 'password123', inviteCode: 'x' }, 'x')).id;
});

describe('importCode', () => {
	it('imports profile, counts, plans; skips unknown droids', async () => {
		const code = mkCode({
			name: 'jasparke', cycle: 2, current: 1, hidePast: true,
			counts: { '1|MOUSE|Gold': 3, '1|CB|Base': 1, '1|GHOST-DROID|Beskar': 2 },
			plan: { '2': [9, 8, 1] }
		});
		const res = await importCode(db, uid, code);
		expect(res).toMatchObject({ name: 'jasparke', imported: 2 });
		expect(res.skipped).toEqual(['GHOST-DROID']);
		const p = await db.query.profiles.findFirst({ where: eq(profiles.id, res.profileId) });
		expect(p).toMatchObject({ name: 'jasparke', cycle: 2, currentRebirth: 1, userId: uid });
		expect(await db.select().from(counts).where(eq(counts.profileId, res.profileId))).toHaveLength(2);
		expect(await db.select().from(plans).where(eq(plans.profileId, res.profileId))).toHaveLength(3);
	});
	it('accepts a leading # (URL-hash paste)', async () => {
		const res = await importCode(db, uid, '#' + mkCode({ name: 'x', counts: {}, plan: {} }));
		expect(res.name).toBe('x');
	});
	it('rejects garbage with 422 and creates nothing', async () => {
		await expect(importCode(db, uid, 'not-base64!!!')).rejects.toMatchObject({
			status: 422, code: 'bad_code'
		});
		expect(await db.select().from(profiles)).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npm run test:int`
Expected: FAIL — cannot resolve `./importer`.

- [ ] **Step 3: Implement**

Create `app/src/lib/server/services/importer.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { counts, droids, plans, profiles } from '../schema';
import { ApiError } from '../api-error';
import { isTier } from '$lib/game/tiers';

type PrototypeProfile = {
	name?: string; cycle?: number; current?: number;
	counts?: Record<string, number>; plan?: Record<string, number[]>;
	hidePast?: boolean; gapsOpen?: Record<string, boolean>;
};

export async function importCode(db: Db, userId: number, code: string) {
	let proto: PrototypeProfile;
	try {
		const raw = JSON.parse(Buffer.from(String(code).trim().replace(/^#/, ''), 'base64').toString('utf8'));
		if (raw?.__dt !== 1 || typeof raw.profile !== 'object' || raw.profile == null) throw new Error();
		proto = raw.profile;
	} catch {
		throw new ApiError(422, 'bad_code', 'Not a valid tracker export code');
	}
	const known = new Set((await db.select({ name: droids.name }).from(droids)).map((r) => r.name));
	const skipped = new Set<string>();
	const countRows: { cycle: number; droid: string; tier: string; n: number }[] = [];
	for (const [key, n] of Object.entries(proto.counts ?? {})) {
		const [cy, droid, tier] = key.split('|');
		if (!known.has(droid)) { skipped.add(droid); continue; }
		if (!isTier(tier) || !Number.isInteger(n) || n <= 0) { skipped.add(droid); continue; }
		countRows.push({ cycle: Number(cy), droid, tier, n });
	}
	return await db.transaction(async (tx) => {
		const [p] = await tx.insert(profiles).values({
			userId,
			name: String(proto.name ?? 'Imported').slice(0, 64),
			cycle: Number.isInteger(proto.cycle) ? (proto.cycle as number) : 1,
			currentRebirth: Number.isInteger(proto.current) ? (proto.current as number) : 0,
			prefs: { hidePast: proto.hidePast ?? true, gapsOpen: proto.gapsOpen ?? {} }
		}).returning();
		if (countRows.length)
			await tx.insert(counts).values(countRows.map((r) => ({ ...r, profileId: p.id })));
		const planRows = Object.entries(proto.plan ?? {}).flatMap(([cy, arr]) =>
			(Array.isArray(arr) ? arr : [])
				.filter((r) => Number.isInteger(r) && r >= 1 && r <= 27)
				.map((rebirth) => ({ profileId: p.id, cycle: Number(cy), rebirth }))
		);
		if (planRows.length) await tx.insert(plans).values(planRows);
		return { profileId: p.id, name: p.name, imported: countRows.length, skipped: [...skipped] };
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npm run test:int`
Expected: PASS (all integration tests green).

- [ ] **Step 5: Route + commit**

Create `app/src/routes/api/import/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { guard, requireUser } from '$lib/server/respond';
import { importCode } from '$lib/server/services/importer';

export const POST: RequestHandler = ({ locals, request }) =>
	guard(async () => {
		const user = requireUser(locals);
		const body = await request.json().catch(() => ({}));
		return json(await importCode(db, user.id, String(body.code ?? '')), { status: 201 });
	});
```

```bash
git add app/src && git commit -m "feat: prototype export-code import"
```

### Task 15: Frontend — layout, auth pages, client store

**Files:**
- Create: `app/src/routes/+layout.server.ts`, `app/src/routes/+layout.svelte`, `app/src/routes/+page.server.ts`, `app/src/routes/login/+page.svelte`, `app/src/routes/register/+page.svelte`, `app/src/lib/client/api.ts`, `app/src/lib/client/toast.svelte.ts`, `app/src/lib/components/Toasts.svelte`, `app/src/app.css` (tier color tokens)

**Interfaces:**
- Consumes: `getReference`, `listAllProfiles` (called server-side in load — no HTTP hop), `locals.user`.
- Produces:
  - Layout `data`: `{ user, reference, profiles }` available to every page via `page.data`. Unauthenticated visitors to any page except `/login` and `/register` are redirected to `/login`.
  - `api.ts`: `export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>` — throws `Error(message)` on `{error}` responses.
  - `toast.svelte.ts`: `export const toasts: { list: { id: number; msg: string }[] }; export function toast(msg: string): void` (auto-dismiss 4s) — the visible-failure channel required by the spec.
  - `app.css`: `:root` defines `--base:#cfd8e6; --gold:#ffcf3f; --diamond:#4fd0ff; --rainbow:#ff6ad5; --beskar:#9aa6b8;` plus `.tier-Base….tier-Beskar { color: var(--…) }` classes. These tokens are the design-session contract — semantic names, no styling ambition.

- [ ] **Step 1: Tokens + helpers**

Create `app/src/app.css`:

```css
:root {
	--base: #cfd8e6; --gold: #ffcf3f; --diamond: #4fd0ff; --rainbow: #ff6ad5; --beskar: #9aa6b8;
}
.tier-Base { color: var(--base); } .tier-Gold { color: var(--gold); }
.tier-Diamond { color: var(--diamond); } .tier-Rainbow { color: var(--rainbow); }
.tier-Beskar { color: var(--beskar); }
body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 1100px; padding: 1rem; }
nav a { margin-right: 0.75rem; }
table { border-collapse: collapse; } td, th { padding: 2px 8px; text-align: left; }
```

Create `app/src/lib/client/api.ts`:

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const r = await fetch(path, {
		headers: { 'content-type': 'application/json' },
		...init
	});
	const body = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
	return body as T;
}
```

Create `app/src/lib/client/toast.svelte.ts`:

```ts
export const toasts = $state({ list: [] as { id: number; msg: string }[] });
let seq = 0;
export function toast(msg: string) {
	const id = ++seq;
	toasts.list.push({ id, msg });
	setTimeout(() => {
		toasts.list = toasts.list.filter((t) => t.id !== id);
	}, 4000);
}
```

Create `app/src/lib/components/Toasts.svelte`:

```svelte
<script lang="ts">
	import { toasts } from '$lib/client/toast.svelte';
</script>

<div style="position:fixed;bottom:1rem;right:1rem" role="status">
	{#each toasts.list as t (t.id)}
		<div style="background:#a00;color:#fff;padding:6px 12px;margin-top:6px;border-radius:6px">{t.msg}</div>
	{/each}
</div>
```

- [ ] **Step 2: Layout load + shell**

Create `app/src/routes/+layout.server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { getReference } from '$lib/server/services/reference';
import { listAllProfiles } from '$lib/server/services/profiles';

const PUBLIC = new Set(['/login', '/register']);

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		if (!PUBLIC.has(url.pathname)) redirect(303, '/login');
		return { user: null, reference: null, profiles: [] };
	}
	const [reference, profiles] = await Promise.all([getReference(db), listAllProfiles(db)]);
	return { user: locals.user, reference, profiles };
};
```

Create `app/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
	import '../app.css';
	import Toasts from '$lib/components/Toasts.svelte';
	let { data, children } = $props();
</script>

{#if data.user}
	<nav>
		<a href="/checklist">Checklist</a><a href="/planner">Planner</a>
		<a href="/inventory">Inventory</a><a href="/droids">All Droids</a>
		<a href="/keepers">Keepers</a><a href="/roi">ROI</a>
		<span style="float:right">
			{data.user.username}
			{#if data.reference?.version}· data as of {new Date(data.reference.version.ingestedAt).toLocaleDateString()}{/if}
			<form method="POST" action="/api/auth/logout" style="display:inline"><button>Log out</button></form>
		</span>
	</nav>
{/if}
{@render children()}
<Toasts />
```

Create `app/src/routes/+page.server.ts` (root redirects to the daily view):

```ts
import { redirect } from '@sveltejs/kit';
export const load = () => redirect(303, '/checklist');
```

- [ ] **Step 3: Auth pages**

Create `app/src/routes/login/+page.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/client/api';
	import { toast } from '$lib/client/toast.svelte';
	let username = $state(''), password = $state('');
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
			await goto('/checklist', { invalidateAll: true });
		} catch (err) { toast((err as Error).message); }
	}
</script>

<h1>Log in</h1>
<form onsubmit={submit}>
	<label>Username <input bind:value={username} autocomplete="username" /></label>
	<label>Password <input type="password" bind:value={password} autocomplete="current-password" /></label>
	<button>Log in</button>
</form>
<p>No account? <a href="/register">Register with an invite code</a>.</p>
```

Create `app/src/routes/register/+page.svelte`:

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/client/api';
	import { toast } from '$lib/client/toast.svelte';
	let username = $state(''), password = $state(''), inviteCode = $state('');
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await apiFetch('/api/auth/register', {
				method: 'POST', body: JSON.stringify({ username, password, inviteCode })
			});
			await goto('/checklist', { invalidateAll: true });
		} catch (err) { toast((err as Error).message); }
	}
</script>

<h1>Register</h1>
<form onsubmit={submit}>
	<label>Username <input bind:value={username} autocomplete="username" /></label>
	<label>Password <input type="password" bind:value={password} autocomplete="new-password" /></label>
	<label>Invite code <input bind:value={inviteCode} /></label>
	<button>Create account</button>
</form>
```

- [ ] **Step 4: Verify manually**

```bash
cd app && INVITE_CODE=sekrit npm run dev
```

In a browser: `/` redirects to `/login`; register with invite `sekrit` lands on `/checklist` (404 for now — routes come next); wrong invite shows a toast. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add app/src && git commit -m "feat: app shell, auth pages, tier color tokens, toasts"
```

---

### Task 16: Frontend — checklist + planner views

**Files:**
- Create: `app/src/lib/client/tracker.svelte.ts`, `app/src/routes/checklist/+page.svelte`, `app/src/routes/planner/+page.svelte`

**Interfaces:**
- Consumes: layout `data` (`reference`, `profiles`, `user`), game math (Tasks 3–4), `apiFetch`, `toast`.
- Produces: `tracker.svelte.ts` — the page-shared client state:
  - `export function makeTracker(data: PageData): Tracker` where `Tracker` exposes: `profiles` (all), `active` (selected profile, defaults to first owned), `selectProfile(id)`, `countRows(): CountRow[]` for the active profile, `setCount(cycle, droid, tier, n)` (optimistic + rollback + toast), `replacePlan(cycle, rebirths)` (same), and `myProfiles()` (owned only).
  - Server side: counts/plans for ALL profiles ride in via a new field in layout data — extend `+layout.server.ts` to also return `countsByProfile` and `plansByProfile` (two whole-table selects keyed by profile id; the dataset is tiny).
- Checklist semantics (spec + design handoff): per rebirth row, right pill = required tier (`tier-…` class on a `[REQ]` pill, constant), droid name colored by owned tier, click toggles owned-at-required-tier, met-state via `isMet` (counts-as). Read-only when viewing another member's profile.

- [ ] **Step 1: Extend layout load with counts/plans**

In `app/src/routes/+layout.server.ts`, add to the authenticated branch:

```ts
import { counts, plans } from '$lib/server/schema';
// inside load, alongside the existing Promise.all:
const [allCounts, allPlans] = await Promise.all([db.select().from(counts), db.select().from(plans)]);
const countsByProfile: Record<number, typeof allCounts> = {};
for (const c of allCounts) (countsByProfile[c.profileId] ??= []).push(c);
const plansByProfile: Record<number, number[][]> = {};
const plansTmp: Record<number, Record<number, number[]>> = {};
for (const p of allPlans) ((plansTmp[p.profileId] ??= {})[p.cycle] ??= []).push(p.rebirth);
return { user: locals.user, reference, profiles, countsByProfile, plansByCycle: plansTmp };
```

(Adjust the return type accordingly; `plansByCycle[profileId][cycle] → number[]`.)

- [ ] **Step 2: Tracker state module**

Create `app/src/lib/client/tracker.svelte.ts`:

```ts
import { apiFetch } from './api';
import { toast } from './toast.svelte';
import type { CountRow } from '$lib/game/inventory';
import type { Tier } from '$lib/game/tiers';

type ProfileRow = { id: number; userId: number; owner: string; name: string; cycle: number; currentRebirth: number };

export function makeTracker(data: {
	user: { id: number };
	profiles: ProfileRow[];
	countsByProfile: Record<number, CountRow[]>;
	plansByCycle: Record<number, Record<number, number[]>>;
}) {
	const mine = data.profiles.filter((p) => p.userId === data.user.id);
	const state = $state({
		profiles: data.profiles,
		activeId: mine[0]?.id ?? data.profiles[0]?.id ?? null,
		counts: structuredClone(data.countsByProfile) as Record<number, CountRow[]>,
		plans: structuredClone(data.plansByCycle) as Record<number, Record<number, number[]>>
	});
	const active = () => state.profiles.find((p) => p.id === state.activeId) ?? null;
	const editable = () => active()?.userId === data.user.id;
	return {
		state, active, editable,
		myProfiles: () => mine,
		selectProfile(id: number) { state.activeId = id; },
		countRows: () => state.counts[state.activeId ?? -1] ?? [],
		planFor: (cycle: number) => state.plans[state.activeId ?? -1]?.[cycle] ?? [],
		async setCount(cycle: number, droid: string, tier: Tier, n: number) {
			const pid = state.activeId;
			if (pid == null || !editable()) return;
			const rows = (state.counts[pid] ??= []);
			const i = rows.findIndex((r) => r.cycle === cycle && r.droid === droid && r.tier === tier);
			const prev = i >= 0 ? rows[i].n : 0;
			if (n <= 0 && i >= 0) rows.splice(i, 1);
			else if (i >= 0) rows[i].n = n;
			else if (n > 0) rows.push({ cycle, droid, tier, n });
			try {
				await apiFetch(`/api/profiles/${pid}/counts/${cycle}/${encodeURIComponent(droid)}/${tier}`, {
					method: 'PUT', body: JSON.stringify({ n: Math.max(0, n) })
				});
			} catch (e) {
				// rollback
				const j = rows.findIndex((r) => r.cycle === cycle && r.droid === droid && r.tier === tier);
				if (j >= 0) { if (prev === 0) rows.splice(j, 1); else rows[j].n = prev; }
				else if (prev > 0) rows.push({ cycle, droid, tier, n: prev });
				toast(`Save failed: ${(e as Error).message}`);
			}
		},
		async replacePlan(cycle: number, rebirths: number[]) {
			const pid = state.activeId;
			if (pid == null || !editable()) return;
			const prev = state.plans[pid]?.[cycle] ?? [];
			((state.plans[pid] ??= {})[cycle] = rebirths);
			try {
				await apiFetch(`/api/profiles/${pid}/plans/${cycle}`, {
					method: 'PUT', body: JSON.stringify({ rebirths })
				});
			} catch (e) {
				state.plans[pid][cycle] = prev;
				toast(`Save failed: ${(e as Error).message}`);
			}
		}
	};
}
```

- [ ] **Step 3: Checklist page**

Create `app/src/routes/checklist/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { isMet, ownedIdx } from '$lib/game/inventory';
	import { TIERS, RIDX, type Tier } from '$lib/game/tiers';
	const t = makeTracker(page.data as never);
	const ref = page.data.reference;
	const cycle = $derived(t.active()?.cycle ?? 1);
	const reqs = $derived(
		ref.rebirthReqs.filter((r: { cycle: number }) => r.cycle === cycle)
	);
	const byRebirth = $derived.by(() => {
		const m = new Map<number, typeof reqs>();
		for (const r of reqs) (m.get(r.rebirth) ?? m.set(r.rebirth, []).get(r.rebirth)!).push(r);
		return [...m.entries()].sort((a, b) => a[0] - b[0]);
	});
	const meta = (rb: number) => ref.rebirthMeta.find((m: { rebirth: number }) => m.rebirth === rb);
	function toggle(droid: string, tier: Tier) {
		const met = isMet(t.countRows(), cycle, droid, tier);
		t.setCount(cycle, droid, tier, met ? 0 : 1);
	}
</script>

<h1>Rebirth Checklist</h1>
<label>Profile:
	<select onchange={(e) => t.selectProfile(Number(e.currentTarget.value))}>
		{#each t.state.profiles as p}
			<option value={p.id} selected={p.id === t.state.activeId}>{p.owner}/{p.name}</option>
		{/each}
	</select>
</label>
{#if !t.editable()}<p><em>Viewing {t.active()?.owner}'s profile — read-only.</em></p>{/if}

{#each byRebirth as [rb, rows]}
	<section>
		<h2>R{rb} <small>{rows[0].credits} credits
			{#if meta(rb)}· {meta(rb).nova} nova · +{meta(rb).creditMult}% cr · +{meta(rb).xpMult}% xp{/if}
			{#if rows[0].unlock}· unlocks {rows[0].unlock}{/if}</small></h2>
		<ul>
			{#each rows as r}
				{@const oi = ownedIdx(t.countRows(), cycle, r.droid)}
				{@const met = isMet(t.countRows(), cycle, r.droid, r.tier)}
				<li>
					<button disabled={!t.editable()} onclick={() => toggle(r.droid, r.tier)}>
						{met ? '☑' : '☐'}
					</button>
					<span class={oi >= 0 ? `tier-${TIERS[oi]}` : ''} title="requires {r.tier}{oi >= 0 ? ` · have ${TIERS[oi]}` : ''}">{r.droid}</span>
					<span class="tier-{r.tier}">[{r.tier}]</span>
				</li>
			{/each}
		</ul>
	</section>
{/each}
```

- [ ] **Step 4: Planner page**

Create `app/src/routes/planner/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { combinedNeeds, type Requirement } from '$lib/game/planner';
	import { isMet } from '$lib/game/inventory';
	import type { Tier } from '$lib/game/tiers';
	const t = makeTracker(page.data as never);
	const ref = page.data.reference;
	const cycle = $derived(t.active()?.cycle ?? 1);
	const reqs = $derived(
		ref.rebirthReqs
			.filter((r: { cycle: number }) => r.cycle === cycle)
			.map((r: { rebirth: number; droid: string; tier: Tier }) => ({
				rebirth: r.rebirth, droid: r.droid, tier: r.tier
			})) as Requirement[]
	);
	const selected = $derived(new Set(t.planFor(cycle)));
	const needs = $derived(combinedNeeds(reqs, selected));
	const rebirths = $derived([...new Set(reqs.map((r) => r.rebirth))].sort((a, b) => a - b));
	function toggleRb(rb: number) {
		const next = new Set(selected);
		next.has(rb) ? next.delete(rb) : next.add(rb);
		t.replacePlan(cycle, [...next]);
	}
</script>

<h1>Planner</h1>
<h2>Combined needs ({needs.length} droids for {selected.size} rebirths)</h2>
<ul>
	{#each needs as n}
		{@const have = isMet(t.countRows(), cycle, n.droid, n.tier)}
		<li class="tier-{n.tier}">{n.droid} [{n.tier}] {have ? '✓ owned' : ''}</li>
	{/each}
</ul>
<h2>Rebirths</h2>
{#each rebirths as rb}
	<label style="display:block">
		<input type="checkbox" disabled={!t.editable()} checked={selected.has(rb)} onchange={() => toggleRb(rb)} />
		R{rb}: {reqs.filter((r) => r.rebirth === rb).map((r) => `${r.droid} ${r.tier[0]}`).join(', ')}
	</label>
{/each}
```

- [ ] **Step 5: Verify manually and commit**

With dev server + seeded DB: log in, `/checklist` shows all rebirths of the profile's cycle with meta line, clicking a checkbox persists across reload; `/planner` ticks persist; selecting another member's profile disables writes.

```bash
git add app/src && git commit -m "feat: checklist and planner views with optimistic writes"
```

---

### Task 17: Frontend — inventory, all-droids, keepers views

**Files:**
- Create: `app/src/routes/inventory/+page.svelte`, `app/src/routes/droids/+page.svelte`, `app/src/routes/keepers/+page.svelte`

**Interfaces:**
- Consumes: `makeTracker`, game math, layout `data.reference`.
- Produces: three read/edit views; no new shared modules.

- [ ] **Step 1: Inventory page**

Create `app/src/routes/inventory/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { TIERS, type Tier } from '$lib/game/tiers';
	const t = makeTracker(page.data as never);
	const cycle = $derived(t.active()?.cycle ?? 1);
	const rows = $derived.by(() => {
		const byDroid = new Map<string, Partial<Record<Tier, number>>>();
		for (const c of t.countRows()) {
			if (c.cycle !== cycle) continue;
			(byDroid.get(c.droid) ?? byDroid.set(c.droid, {}).get(c.droid)!)[c.tier] = c.n;
		}
		return [...byDroid.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	});
	const at = (m: Partial<Record<Tier, number>>, tier: Tier) => m[tier] ?? 0;
</script>

<h1>Inventory</h1>
<table>
	<thead><tr><th>Droid</th>{#each TIERS as tier}<th class="tier-{tier}">{tier}</th>{/each}</tr></thead>
	<tbody>
		{#each rows as [droid, m]}
			<tr><td>{droid}</td>
				{#each TIERS as tier}
					<td>
						<button disabled={!t.editable()} onclick={() => t.setCount(cycle, droid, tier, at(m, tier) - 1)}>−</button>
						{at(m, tier)}
						<button disabled={!t.editable()} onclick={() => t.setCount(cycle, droid, tier, at(m, tier) + 1)}>+</button>
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
{#if rows.length === 0}<p>No droids owned yet in cycle {cycle} — add from All Droids.</p>{/if}
```

- [ ] **Step 2: All Droids page**

Create `app/src/routes/droids/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { TIERS, type Tier } from '$lib/game/tiers';
	import { ownedIdx } from '$lib/game/inventory';
	const t = makeTracker(page.data as never);
	const ref = page.data.reference;
	const cycle = $derived(t.active()?.cycle ?? 1);
	let q = $state('');
	const list = $derived(
		ref.droids
			.filter((d: { name: string }) => d.name.includes(q.toUpperCase()))
			.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
	);
	const stat = (droid: string, tier: Tier) =>
		ref.droidTiers.find((s: { droid: string; tier: string }) => s.droid === droid && s.tier === tier);
</script>

<h1>All Droids</h1>
<input placeholder="search" bind:value={q} />
<table>
	<thead><tr><th>Droid</th><th>Rarity</th><th>Type</th><th>Own</th>
		{#each TIERS as tier}<th class="tier-{tier}">{tier} buy / inc</th>{/each}</tr></thead>
	<tbody>
		{#each list as d}
			{@const oi = ownedIdx(t.countRows(), cycle, d.name)}
			<tr>
				<td>{d.name}</td><td>{d.rarity}</td><td>{d.type}</td>
				<td>{oi >= 0 ? TIERS[oi] : '—'}</td>
				{#each TIERS as tier}
					{@const s = stat(d.name, tier)}
					<td>
						<button disabled={!t.editable()} title="add one {tier}"
							onclick={() => t.setCount(cycle, d.name, tier, 1)}>+</button>
						{s?.buy?.toLocaleString() ?? '—'} / {s?.income ?? '—'}/s
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
```

- [ ] **Step 3: Keepers page**

Create `app/src/routes/keepers/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { isMet } from '$lib/game/inventory';
	import type { Tier } from '$lib/game/tiers';
	const t = makeTracker(page.data as never);
	const ref = page.data.reference;
	const cycle = $derived(t.active()?.cycle ?? 1);
	const current = $derived(t.active()?.currentRebirth ?? 0);
	// droids still needed at future rebirths, ordered by when they're next required
	const future = $derived.by(() => {
		const m = new Map<string, { nextRb: number; needs: { rebirth: number; tier: Tier; met: boolean }[] }>();
		for (const r of ref.rebirthReqs.filter(
			(r: { cycle: number; rebirth: number }) => r.cycle === cycle && r.rebirth > current
		)) {
			const met = isMet(t.countRows(), cycle, r.droid, r.tier);
			const e = m.get(r.droid) ?? { nextRb: r.rebirth, needs: [] };
			e.nextRb = Math.min(e.nextRb, r.rebirth);
			e.needs.push({ rebirth: r.rebirth, tier: r.tier, met });
			m.set(r.droid, e);
		}
		return [...m.entries()].sort((a, b) => a[1].nextRb - b[1].nextRb);
	});
</script>

<h1>Droids to Keep</h1>
<p>Needed from R{current + 1} onward in cycle {cycle}. Don't sell these.</p>
<table>
	<thead><tr><th>Droid</th><th>Next</th><th>Requirements</th></tr></thead>
	<tbody>
		{#each future as [droid, e]}
			<tr>
				<td>{droid}{e.needs.length >= 4 ? ' ★' : ''}</td>
				<td>R{e.nextRb}</td>
				<td>{#each e.needs as n}<span class="tier-{n.tier}">{n.met ? '✓' : ''}{n.tier} R{n.rebirth}</span>{' '}{/each}</td>
			</tr>
		{/each}
	</tbody>
</table>
```

- [ ] **Step 4: Verify manually and commit**

Dev server: `/inventory` +/− adjust counts and persist; `/droids` search filters, + adds a copy; `/keepers` lists only future-needed droids and drops one when its requirement is met (toggle on checklist to confirm reactivity is via shared tracker → it is per-page state, so cross-page updates arrive on navigation — acceptable for skeleton).

```bash
git add app/src && git commit -m "feat: inventory, all-droids, keepers views"
```

---

### Task 18: Frontend — ROI view (table + log-log scatter)

**Files:**
- Create: `app/src/routes/roi/+page.svelte`

**Interfaces:**
- Consumes: `roiTable`, `TierStat` (Task 6); `reference.droidTiers` + `reference.droids`; `ownedIdx`.
- Produces: `/roi` — filterable ranked table + inline-SVG scatter, log-log axes (spec hard constraint).

- [ ] **Step 1: Implement the page**

Create `app/src/routes/roi/+page.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { roiTable, type TierStat } from '$lib/game/roi';
	import { TIERS, RIDX, type Tier } from '$lib/game/tiers';
	import { ownedIdx } from '$lib/game/inventory';
	const t = makeTracker(page.data as never);
	const ref = page.data.reference;
	const cycle = $derived(t.active()?.cycle ?? 1);
	let rarity = $state('all'), type = $state('all'), tier = $state('all');
	const meta = new Map(ref.droids.map((d: { name: string }) => [d.name, d]));
	const stats: TierStat[] = ref.droidTiers.map(
		(s: { droid: string; tier: Tier; buy: number | null; income: number | null }) => ({
			droid: s.droid, tier: s.tier, buy: s.buy, income: s.income,
			rarity: meta.get(s.droid)?.rarity ?? '?', type: meta.get(s.droid)?.type ?? '?'
		})
	);
	const rows = $derived(
		roiTable(stats).filter(
			(r) => (rarity === 'all' || r.rarity === rarity) &&
				(type === 'all' || r.type === type) && (tier === 'all' || r.tier === tier)
		)
	);
	const owned = (droid: string, tr: Tier) => ownedIdx(t.countRows(), cycle, droid) >= RIDX[tr];
	// log-log scatter mapping (spec: domain spans ~9 orders of magnitude)
	const W = 640, H = 400, PAD = 40;
	const xs = $derived(rows.map((r) => Math.log10(r.buy as number)));
	const ys = $derived(rows.map((r) => Math.log10(r.income as number)));
	const xmin = $derived(Math.min(...xs, 0)), xmax = $derived(Math.max(...xs, 1));
	const ymin = $derived(Math.min(...ys, 0)), ymax = $derived(Math.max(...ys, 1));
	const px = (v: number) => PAD + ((v - xmin) / (xmax - xmin)) * (W - 2 * PAD);
	const py = (v: number) => H - PAD - ((v - ymin) / (ymax - ymin)) * (H - 2 * PAD);
	const fmt = (s: number) =>
		s >= 3600 ? `${(s / 3600).toFixed(1)}h` : s >= 60 ? `${(s / 60).toFixed(1)}m` : `${Math.round(s)}s`;
</script>

<h1>ROI — payback time per droid & tier</h1>
<label>Rarity <select bind:value={rarity}><option value="all">all</option>
	{#each ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Iconic'] as r}<option>{r}</option>{/each}
</select></label>
<label>Type <select bind:value={type}><option value="all">all</option>
	{#each ['Worker', 'Astromech', 'Battle'] as ty}<option>{ty}</option>{/each}
</select></label>
<label>Tier <select bind:value={tier}><option value="all">all</option>
	{#each TIERS as tr}<option>{tr}</option>{/each}
</select></label>

<svg viewBox="0 0 {W} {H}" style="max-width:100%;background:#f5f5f508;border:1px solid #8884">
	<text x={W / 2} y={H - 6} text-anchor="middle" font-size="11">buy cost (log)</text>
	<text x="12" y={H / 2} font-size="11" transform="rotate(-90 12 {H / 2})" text-anchor="middle">income/s (log)</text>
	{#each rows as r}
		<circle cx={px(Math.log10(r.buy as number))} cy={py(Math.log10(r.income as number))} r="4"
			class="tier-{r.tier}" fill="currentColor" opacity="0.8">
			<title>{r.droid} [{r.tier}] — payback {fmt(r.paybackSeconds)}</title>
		</circle>
	{/each}
</svg>

<table>
	<thead><tr><th>#</th><th>Droid</th><th>Tier</th><th>Rarity</th><th>Type</th>
		<th>Buy</th><th>Income/s</th><th>Payback</th><th>Income/1k</th><th>Owned</th></tr></thead>
	<tbody>
		{#each rows as r, i}
			<tr>
				<td>{i + 1}</td><td>{r.droid}</td><td class="tier-{r.tier}">{r.tier}</td>
				<td>{r.rarity}</td><td>{r.type}</td>
				<td>{(r.buy as number).toLocaleString()}</td><td>{r.income}</td>
				<td>{fmt(r.paybackSeconds)}</td><td>{r.incomePer1k.toFixed(2)}</td>
				<td>{owned(r.droid, r.tier) ? '✓' : ''}</td>
			</tr>
		{/each}
	</tbody>
</table>
```

- [ ] **Step 2: Verify manually and commit**

Dev server: `/roi` renders ~340 points and rows; filters narrow both; hovering a point names the droid; owned rows show ✓. Confirm the scatter spreads across the plot (log-log working) rather than clumping in a corner.

```bash
git add app/src && git commit -m "feat: ROI view with log-log scatter and ranked table"
```

---

### Task 19: Playwright e2e smoke

**Files:**
- Create: `app/playwright.config.ts`, `app/e2e/smoke.spec.ts`
- Modify: `app/package.json` (script `"test:e2e": "playwright test"`)

**Interfaces:**
- Consumes: the full app against the seeded dev DB.
- Produces: the register → toggle → reload persistence proof required by the spec.

- [ ] **Step 1: Config**

Create `app/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	use: { baseURL: 'http://localhost:4173' },
	webServer: {
		command: 'npm run build && node build',
		port: 4173,
		env: {
			PORT: '4173',
			DATABASE_URL: 'postgres://dtt:dtt@localhost:5432/dtt',
			INVITE_CODE: 'e2e-invite',
			SESSION_SECRET: 'e2e-secret'
		}
	}
});
```

Add `"test:e2e": "playwright test"` to `app/package.json` scripts, and run `npx playwright install chromium` once.

- [ ] **Step 2: The smoke test**

Create `app/e2e/smoke.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('register → toggle a count → reload → persisted', async ({ page }) => {
	const user = `smoke${Date.now()}`;
	await page.goto('/register');
	await page.getByLabel('Username').fill(user);
	await page.getByLabel('Password').fill('password123');
	await page.getByLabel('Invite code').fill('e2e-invite');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/checklist/);

	// no profile yet — import-free path: create one via API for skeleton simplicity
	await page.request.post('/api/profiles', { data: { name: 'main' } });
	await page.reload();

	const firstBox = page.getByRole('button', { name: '☐' }).first();
	await firstBox.click();
	await expect(page.getByRole('button', { name: '☑' }).first()).toBeVisible();

	await page.reload();
	await expect(page.getByRole('button', { name: '☑' }).first()).toBeVisible();
});
```

- [ ] **Step 3: Run it**

Prereq: dev DB up, migrated, seeded (Tasks 2/7). Run: `cd app && npm run test:e2e`
Expected: 1 passed. If the checklist renders zero checkboxes, the seed didn't run — re-run `npm run db:seed`.

- [ ] **Step 4: Commit**

```bash
git add app && git commit -m "test: e2e smoke (register, toggle, persistence)"
```

---

### Task 20: Production Dockerfile + compose + docs

**Files:**
- Create: `app/Dockerfile`, `docker-compose.yml`, `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: adapter-node build, `drizzle/migrate.mjs`, `drizzle/seed.mjs` (+ `seed-data.json`).
- Produces: `docker compose up -d` on the proxmox host serves the app on internal port 3000 (fronted by the user's PXE reverse proxy). Postgres unexposed. Migrations run on container start; seeding is an explicit one-time command.

- [ ] **Step 1: Dockerfile**

Create `app/Dockerfile`:

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build build
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json .
COPY --from=build /app/drizzle drizzle
EXPOSE 3000
CMD ["sh", "-c", "node drizzle/migrate.mjs && node build"]
```

- [ ] **Step 2: Compose + env template**

Create `docker-compose.yml` (repo root):

```yaml
services:
  app:
    build: ./app
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://dtt:${POSTGRES_PASSWORD:?set in .env}@db:5432/dtt
      SESSION_SECRET: ${SESSION_SECRET:?set in .env}
      INVITE_CODE: ${INVITE_CODE:?set in .env}
      ORIGIN: ${ORIGIN:?set in .env} # e.g. https://droids.example.lan — required by adapter-node for form origin checks
    ports: ["3000:3000"]
    depends_on:
      db: { condition: service_healthy }
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: dtt
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set in .env}
      POSTGRES_DB: dtt
    volumes: [dtt-pg:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dtt"]
      interval: 5s
      timeout: 3s
      retries: 20
volumes:
  dtt-pg:
```

Create `.env.example`:

```bash
POSTGRES_PASSWORD=change-me
SESSION_SECRET=generate-with-openssl-rand-hex-32
INVITE_CODE=pick-something
ORIGIN=https://your-reverse-proxied-hostname
```

- [ ] **Step 3: Verify the stack locally**

```bash
cp .env.example .env   # fill in values
docker compose up -d --build --wait
docker compose exec app node drizzle/seed.mjs   # one-time reference seed
curl -s localhost:3000/api/reference   # expect {"error":"Log in first","code":"unauthenticated"}
```

Expected: both services healthy; unauthenticated reference call returns the 401 JSON error (proves app+db+migrations work end-to-end).

- [ ] **Step 4: README + commit**

Add to `README.md` under the repo-layout note:

```markdown
## Running the app (docker)

    cp .env.example .env   # set POSTGRES_PASSWORD, SESSION_SECRET, INVITE_CODE, ORIGIN
    docker compose up -d --build
    docker compose exec app node drizzle/seed.mjs   # first run only: load game reference data

The app listens on port 3000 (HTTP) — front it with your reverse proxy for TLS.
Register the first account with your INVITE_CODE. Import old tracker data via
the export code from the prototype (☁ → Export) using POST /api/import or the UI.
```

```bash
git add -A && git commit -m "feat: production Dockerfile, compose stack, deploy docs"
```

---

## Plan self-review notes (completed during authoring)

- **Spec coverage:** schema incl. `rebirth_meta` (Task 2), row-level counts (11), plans (12), visibility rules (10/16), invite auth + sessions (8/9), import (14), reference + version (13, 7), ROI incl. log-log (6, 18), optimistic writes + toasts (15/16), tests at all three tiers (3–6, 8–14, 19), compose deploy (20), prototype freeze + redirect (1). Frontend visual design intentionally skeletal per spec.
- **Known simplifications (accepted):** per-page tracker state (no cross-page live sync — acceptable, spec requires optimistic writes + rollback only); `SESSION_SECRET` unused by code today (reserved, kept in env contract); keepers "★" replaces the prototype's high-value badge.
- **Type consistency check:** `Db` type-only imports; `CountRow` shared between game math and tracker; `TierStat`/`RoiRow` between Task 6 and 18; `ApiError` codes match route expectations.


