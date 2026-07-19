# Tracker Redesign — Foundation + Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the approved holo-terminal design in the SvelteKit app: design tokens + fonts, app shell (sidebar/header/profile switcher), shared components (TierChip, TierLadder, SearchPopover, StatStrip), a shared tracker store, and a full Checklist rewrite.

**Architecture:** Token-first CSS custom properties in `app.css`; small scoped-style Svelte 5 components; one tracker store created in the root layout and shared via context (optimistic writes with rollback+toast); no backend changes — `PATCH /api/profiles/[id]` already accepts `cycle`, `currentRebirth`, `prefs`.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), TypeScript, vitest, Playwright, @fontsource (only new dependency).

**Spec:** `docs/superpowers/specs/2026-07-07-tracker-redesign-foundation-checklist-design.md`
**Visual truth:** `/Users/jason/Projects/DroidTycoon/design_handoff_tracker_redesign/Droid Tycoon Prototype.dc.html` (open in a browser to compare)

## Global Constraints

- All commands run from `app/` unless stated otherwise. Dev DB: `docker compose -f docker-compose.dev.yml up -d` from repo root (serves `dtt` dev + `dtt_test` databases on `localhost:5432`).
- Svelte 5 runes idiom only (`$state`, `$derived`, `$props`, `$effect`, `onclick=`); no legacy `$:`/`export let`.
- Routes are contract-fixed: `/checklist /planner /inventory /droids /keepers /roi /login /register`. Nav label DROIDEX points at `/droids`.
- Token variable names are a contract: `--base --gold --diamond --rainbow --beskar` (+ `-bg` pairs) with exactly the values in Task 1. Tier owns the color language; rarity is text-only.
- Old views (planner, inventory, droids, keepers, roi) keep working at every task boundary — plain but usable inside the new shell.
- Dark-only. Shell is a fixed `100vh` frame, `min-width: 1180px`, main region scrolls internally.
- Every user-visible write is optimistic with rollback + `toast()` on failure (existing `setCount` pattern).
- Number formatting follows the prototype's `fmtN` exactly (`x ≥ 100 → round`, `x ≥ 10 → 1dp`, else 2dp, suffixes K/M/B/T). Note: the spec's `32.00T` example is errata — prototype renders `32.0T`; prototype wins.
- Only new dependency allowed: `@fontsource/chakra-petch`, `@fontsource/jetbrains-mono`.
- Commit after every task (repo style: `feat:`, `test:`, `types:`, lowercase).

---

### Task 1: Design tokens, fonts, base stylesheet

**Files:**
- Modify: `app/src/app.css` (full rewrite)
- Modify: `app/src/routes/+layout.svelte` (font imports only)
- Modify: `app/package.json` (fontsource deps)

**Interfaces:**
- Produces: CSS custom properties (`--bg --panel --panel-deep --line --line-row --line-row2 --line-ctrl --txt --txt-2 --txt-3 --txt-4 --accent --good --warn --nova --alert`, tier pairs `--base/--base-bg` … `--beskar/--beskar-bg`, rarity `--rar-*`, fonts `--font-disp --font-mono`), utility classes `.pill .notch .notch10 .kbd`, tier classes `.tier-<Tier>` (legacy, color only) and `.t-<Tier>` (fg+bg pair). Later tasks use these names verbatim.

- [ ] **Step 1: Install fonts**

```bash
npm install @fontsource/chakra-petch @fontsource/jetbrains-mono
```

- [ ] **Step 2: Rewrite `src/app.css`**

```css
:root {
	color-scheme: dark;
	--bg: #05070c;
	--panel: #0d1626;
	--panel-deep: #080d17;
	--line: #17253f;
	--line-row: #101a2e;
	--line-row2: #0d1524;
	--line-ctrl: #1c2a45;
	--txt: #e8f0ff;
	--txt-2: #7e93b8;
	--txt-3: #4a5f82;
	--txt-4: #3a4d6e;
	--accent: #35c8ff;
	--good: #3ddf8a;
	--warn: #ffc93f;
	--nova: #8b96ff;
	--alert: #ff5c6a;
	/* tier pairs — contract, do not rename */
	--base: #c6d3e6;    --base-bg: #1c2430;
	--gold: #ffc93f;    --gold-bg: #382b06;
	--diamond: #4fd4ff; --diamond-bg: #082a38;
	--rainbow: #ff6ad5; --rainbow-bg: #3a0a2c;
	--beskar: #b8c4d4;  --beskar-bg: #242c38;
	/* rarity — ROI-scoped exception, text-only elsewhere */
	--rar-common: #c6d3e6; --rar-rare: #35c8ff; --rar-epic: #b07aff;
	--rar-legendary: #ffc93f; --rar-mythic: #ff5c5c;
	--font-disp: 'Chakra Petch', sans-serif;
	--font-mono: 'JetBrains Mono', monospace;
}
body {
	margin: 0;
	background-color: var(--bg);
	background-image: radial-gradient(900px 500px at 60% -180px, #0c1a30 0%, #05070c 60%);
	background-attachment: fixed;
	color: var(--txt);
	font-family: var(--font-disp);
}
a { color: var(--accent); }
a:hover { color: #7fd9ff; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: var(--line-ctrl); border-radius: 4px; }
::-webkit-scrollbar-track { background: transparent; }

/* tier color language — legacy color-only classes (pre-redesign views) */
.tier-Base { color: var(--base); } .tier-Gold { color: var(--gold); }
.tier-Diamond { color: var(--diamond); } .tier-Rainbow { color: var(--rainbow); }
.tier-Beskar { color: var(--beskar); }
/* tier fg+bg pill pairs */
.t-Base { color: var(--base); background: var(--base-bg); }
.t-Gold { color: var(--gold); background: var(--gold-bg); }
.t-Diamond { color: var(--diamond); background: var(--diamond-bg); }
.t-Rainbow { color: var(--rainbow); background: var(--rainbow-bg); }
.t-Beskar { color: var(--beskar); background: var(--beskar-bg); }

.pill { border-radius: 99px; border: 1px solid currentColor; }
.notch { clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); }
.notch10 { clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.kbd { font: 600 8px var(--font-mono); color: var(--txt-3); border: 1px solid var(--line-ctrl); border-radius: 5px; padding: 2px 6px; background: transparent; }

table { border-collapse: collapse; }
td, th { padding: 2px 8px; text-align: left; }
```

(The old `body { max-width: 1100px; … }` and `nav a` rules are deliberately gone — the shell replaces them in Task 5; until then old views render full-width, which is acceptable for one task.)

- [ ] **Step 3: Add font imports to `src/routes/+layout.svelte`**

At the top of the existing `<script>` block, before `import '../app.css';`:

```ts
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: 0 errors.

Run: `npm run build`
Expected: build succeeds (fonts resolve and bundle).

- [ ] **Step 5: Commit**

```bash
git add ../app
git commit -m "feat: holo-terminal design tokens, self-hosted fonts, base styles"
```

---

### Task 2: Number formatting module

**Files:**
- Create: `app/src/lib/client/format.ts`
- Create: `app/src/lib/client/format.test.ts`
- Modify: `app/package.json` (`test:unit` script)
- Modify: `app/README.md` (tests section, one line)

**Interfaces:**
- Produces: `fmtN(v: number): string`, `pad2(n: number): string`, `parseNum(str: string): number | null`. Later tasks import from `$lib/client/format`.

- [ ] **Step 1: Write the failing tests — `src/lib/client/format.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { fmtN, pad2, parseNum } from './format';

describe('fmtN (prototype-exact)', () => {
	it('passes integers below 1000 through rounded', () => {
		expect(fmtN(0)).toBe('0');
		expect(fmtN(999)).toBe('999');
		expect(fmtN(24.6)).toBe('25');
	});
	it('uses 2 decimals under 10 units', () => {
		expect(fmtN(1000)).toBe('1.00K');
		expect(fmtN(2_950_000)).toBe('2.95M');
	});
	it('uses 1 decimal from 10 to under 100 units', () => {
		expect(fmtN(10_500)).toBe('10.5K');
		expect(fmtN(32e12)).toBe('32.0T');
	});
	it('rounds at 100+ units', () => {
		expect(fmtN(185_430_000)).toBe('185M');
		expect(fmtN(999_990)).toBe('1000K');
	});
	it('covers B and T suffixes', () => {
		expect(fmtN(4.5e9)).toBe('4.50B');
		expect(fmtN(1.5e12)).toBe('1.50T');
	});
});

describe('pad2', () => {
	it('zero-pads to two digits', () => {
		expect(pad2(9)).toBe('09');
		expect(pad2(27)).toBe('27');
	});
});

describe('parseNum', () => {
	it('parses suffixed notation case-insensitively', () => {
		expect(parseNum('185.43M')).toBe(185_430_000);
		expect(parseNum('2k')).toBe(2000);
		expect(parseNum('1.5T')).toBe(1.5e12);
	});
	it('parses plain numbers', () => {
		expect(parseNum('300')).toBe(300);
	});
	it('returns null on garbage', () => {
		expect(parseNum('')).toBeNull();
		expect(parseNum('abc')).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/client`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Implement `src/lib/client/format.ts`**

```ts
// Number display conventions locked by the design handoff (prototype fmtN).
const UNITS: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

export function fmtN(v: number): string {
	for (const [div, sfx] of UNITS)
		if (v >= div) {
			const x = v / div;
			return (x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + sfx;
		}
	return String(Math.round(v));
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function parseNum(str: string): number | null {
	const m = /^\s*([\d.]+)\s*([kmbt]?)/i.exec(str || '');
	if (!m) return null;
	const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || '').toLowerCase() as 'k' | 'm' | 'b' | 't'] ?? 1;
	const v = parseFloat(m[1]) * mult;
	return Number.isFinite(v) ? v : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/client`
Expected: all PASS.

- [ ] **Step 5: Fold client units into `test:unit`**

In `app/package.json` change:

```json
"test:unit": "vitest run src/lib/game src/lib/client",
```

In `app/README.md` change the `test:unit` bullet to:

```
- `npm run test:unit` — pure units in `src/lib/game` and `src/lib/client` (no database).
```

Run: `npm run test:unit`
Expected: game + format suites all PASS.

- [ ] **Step 6: Commit**

```bash
git add ../app
git commit -m "feat: number formatting module (fmtN/pad2/parseNum) with units"
```

---

### Task 3: Game-lib helpers — satisfyingIdx and earliestReq

**Files:**
- Modify: `app/src/lib/game/inventory.ts` (additive)
- Modify: `app/src/lib/game/inventory.test.ts` (additive)
- Create: `app/src/lib/game/requirements.ts`
- Create: `app/src/lib/game/requirements.test.ts`

**Interfaces:**
- Consumes: `CountRow`, `RIDX`, `TIERS`, `Tier`, `isTier` from existing `$lib/game/*`.
- Produces: `satisfyingIdx(counts: CountRow[], cycle: number, droid: string, tier: Tier): number` (lowest owned tier index ≥ required with n > 0, else −1) and `earliestReq(reqs: ReqRow[], cycle: number, fromRb: number, droid: string): { rebirth: number; tier: Tier } | null` with `type ReqRow = { cycle: number; rebirth: number; droid: string; tier: string }`.
- Existing fixed math (`ownedIdx`, `isMet`, `totalOf`) is untouched.

- [ ] **Step 1: Write failing tests**

Append to `src/lib/game/inventory.test.ts`:

```ts
import { satisfyingIdx } from './inventory';

describe('satisfyingIdx', () => {
	const rows = [
		{ cycle: 1, droid: 'Mouse', tier: 'Base' as const, n: 1 },
		{ cycle: 1, droid: 'Mouse', tier: 'Diamond' as const, n: 2 },
		{ cycle: 1, droid: 'Probe', tier: 'Beskar' as const, n: 1 }
	];
	it('returns the exact tier when owned', () => {
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Base')).toBe(0);
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Diamond')).toBe(2);
	});
	it('skips unowned tiers up to the first owned one at or above the requirement', () => {
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Gold')).toBe(2); // no Gold, Diamond satisfies
		expect(satisfyingIdx(rows, 1, 'Probe', 'Base')).toBe(4); // only Beskar owned
	});
	it('returns -1 when nothing at or above the requirement is owned', () => {
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Rainbow')).toBe(-1);
		expect(satisfyingIdx(rows, 2, 'Mouse', 'Base')).toBe(-1); // wrong cycle
		expect(satisfyingIdx([], 1, 'Mouse', 'Base')).toBe(-1);
	});
});
```

(If the file has no `describe`/`expect` imports at top, it already imports from `vitest` — reuse the existing import line.)

Create `src/lib/game/requirements.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { earliestReq } from './requirements';

const reqs = [
	{ cycle: 1, rebirth: 3, droid: 'Mouse', tier: 'Gold' },
	{ cycle: 1, rebirth: 9, droid: 'Mouse', tier: 'Beskar' },
	{ cycle: 1, rebirth: 5, droid: 'Probe', tier: 'Base' },
	{ cycle: 2, rebirth: 1, droid: 'Mouse', tier: 'Base' }
];

describe('earliestReq', () => {
	it('finds the earliest requirement at or after fromRb in the given cycle', () => {
		expect(earliestReq(reqs, 1, 1, 'Mouse')).toEqual({ rebirth: 3, tier: 'Gold' });
		expect(earliestReq(reqs, 1, 4, 'Mouse')).toEqual({ rebirth: 9, tier: 'Beskar' });
	});
	it('returns null when the droid is not needed in the remaining cycle', () => {
		expect(earliestReq(reqs, 1, 10, 'Mouse')).toBeNull();
		expect(earliestReq(reqs, 1, 1, 'Ghost')).toBeNull();
	});
	it('scopes to the cycle', () => {
		expect(earliestReq(reqs, 2, 1, 'Mouse')).toEqual({ rebirth: 1, tier: 'Base' });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL — `satisfyingIdx` not exported; `./requirements` unresolved.

- [ ] **Step 3: Implement**

Append to `src/lib/game/inventory.ts`:

```ts
// Lowest owned tier index >= the required tier (counts-as); -1 when unmet.
// Drives the green satisfying-ring and checklist verdicts.
export function satisfyingIdx(counts: CountRow[], cycle: number, droid: string, tier: Tier): number {
	const per = [0, 0, 0, 0, 0];
	for (const c of counts) if (c.cycle === cycle && c.droid === droid) per[RIDX[c.tier]] += c.n;
	for (let i = RIDX[tier]; i <= 4; i++) if (per[i] > 0) return i;
	return -1;
}
```

Create `src/lib/game/requirements.ts`:

```ts
import { isTier, type Tier } from './tiers';

export type ReqRow = { cycle: number; rebirth: number; droid: string; tier: string };

// Earliest rebirth at or after fromRb (same cycle) that requires this droid.
// null => "SELLABLE": not needed in the remaining cycle.
export function earliestReq(
	reqs: ReqRow[],
	cycle: number,
	fromRb: number,
	droid: string
): { rebirth: number; tier: Tier } | null {
	let best: { rebirth: number; tier: Tier } | null = null;
	for (const r of reqs) {
		if (r.cycle !== cycle || r.droid !== droid || r.rebirth < fromRb || !isTier(r.tier)) continue;
		if (!best || r.rebirth < best.rebirth) best = { rebirth: r.rebirth, tier: r.tier };
	}
	return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add ../app
git commit -m "feat: satisfyingIdx and earliestReq game helpers"
```

---

### Task 4: Shared tracker — extensions, context, all views consume it

**Files:**
- Modify: `app/src/lib/client/tracker.svelte.ts`
- Create: `app/src/lib/client/tracker-context.ts`
- Modify: `app/src/routes/+layout.svelte` (create tracker + set context)
- Modify: `app/src/routes/checklist/+page.svelte`, `planner/+page.svelte`, `inventory/+page.svelte`, `droids/+page.svelte`, `keepers/+page.svelte`, `roi/+page.svelte` (one-line tracker swap each)
- Modify: `app/src/routes/login/+page.svelte`, `register/+page.svelte` (full-reload redirect)

**Interfaces:**
- Consumes: `apiFetch`, `toast`, `RIDX` (add `RIDX` import to tracker from `$lib/game/tiers`).
- Produces on the tracker (in addition to existing `state/active/editable/myProfiles/selectProfile/countRows/planFor/setCount/replacePlan`):
  - `cycle(): number` — active profile's cycle, default 1
  - `rebirth(): number` — active profile's currentRebirth clamped to 1–27
  - `hideDone(): boolean`
  - `setCycle(n: 1 | 2): Promise<void>` — optimistic PATCH
  - `setRebirth(n: number): void` — optimistic local, PATCH debounced 400ms trailing
  - `setHideDone(b: boolean): Promise<void>` — PATCH prefs when editable, local-only otherwise
  - `countsFor(cycle: number, droid: string): number[]` — length-5 per-tier counts
- Produces `setTracker(t)` / `getTracker()` in `$lib/client/tracker-context` — `type Tracker = ReturnType<typeof makeTracker>`.
- **Why the redirect change:** the tracker is created once at layout init; `goto(..., { invalidateAll: true })` after login would leave a null tracker (layout never re-inits). A full-page navigation re-initializes the layout. Logout already full-reloads via form POST → 303.

- [ ] **Step 1: Extend `src/lib/client/tracker.svelte.ts`**

Add `RIDX` to imports:

```ts
import { RIDX, type Tier } from '$lib/game/tiers';
```

(replacing the existing `import type { Tier } ...` line), and extend `ProfileRow`:

```ts
type ProfileRow = {
	id: number; userId: number; owner: string; name: string;
	cycle: number; currentRebirth: number; prefs: unknown
};
```

Add `hideDoneOverride: null as boolean | null` to the `$state({...})` object.

In `selectProfile`, reset the override:

```ts
selectProfile(id: number) { state.activeId = id; state.hideDoneOverride = null; },
```

Above the `return {`, add the debounce holders:

```ts
let rbTimer: ReturnType<typeof setTimeout> | undefined;
let rbPrev: number | null = null;
```

Add these methods to the returned object:

```ts
cycle: () => active()?.cycle ?? 1,
rebirth: () => Math.min(27, Math.max(1, active()?.currentRebirth ?? 1)),
hideDone(): boolean {
	if (!editable() && state.hideDoneOverride !== null) return state.hideDoneOverride;
	return ((active()?.prefs ?? {}) as { hideDone?: boolean }).hideDone ?? false;
},
async setCycle(n: 1 | 2) {
	const p = active();
	if (!p || !editable() || p.cycle === n) return;
	const prev = p.cycle;
	p.cycle = n;
	try {
		await apiFetch(`/api/profiles/${p.id}`, { method: 'PATCH', body: JSON.stringify({ cycle: n }) });
	} catch (e) {
		p.cycle = prev;
		toast(`Save failed: ${(e as Error).message}`);
	}
},
setRebirth(n: number) {
	const p = active();
	if (!p || !editable()) return;
	const v = Math.min(27, Math.max(1, Math.round(n)));
	if (rbPrev === null) rbPrev = p.currentRebirth;
	p.currentRebirth = v;
	clearTimeout(rbTimer);
	// coalesce rapid stepper clicks into one PATCH
	rbTimer = setTimeout(async () => {
		const prev = rbPrev ?? p.currentRebirth;
		rbPrev = null;
		try {
			await apiFetch(`/api/profiles/${p.id}`, {
				method: 'PATCH', body: JSON.stringify({ currentRebirth: p.currentRebirth })
			});
		} catch (e) {
			p.currentRebirth = prev;
			toast(`Save failed: ${(e as Error).message}`);
		}
	}, 400);
},
async setHideDone(b: boolean) {
	const p = active();
	if (!p) return;
	if (!editable()) {
		// viewing someone else's profile: local view state only
		state.hideDoneOverride = b;
		return;
	}
	const prevPrefs = { ...((p.prefs ?? {}) as Record<string, unknown>) };
	p.prefs = { ...prevPrefs, hideDone: b };
	try {
		await apiFetch(`/api/profiles/${p.id}`, { method: 'PATCH', body: JSON.stringify({ prefs: p.prefs }) });
	} catch (e) {
		p.prefs = prevPrefs;
		toast(`Save failed: ${(e as Error).message}`);
	}
},
countsFor(cycle: number, droid: string): number[] {
	const out = [0, 0, 0, 0, 0];
	for (const r of state.counts[state.activeId ?? -1] ?? [])
		if (r.cycle === cycle && r.droid === droid) out[RIDX[r.tier]] += r.n;
	return out;
},
```

- [ ] **Step 2: Create `src/lib/client/tracker-context.ts`**

```ts
import { getContext, setContext } from 'svelte';
import type { makeTracker } from './tracker.svelte';

export type Tracker = ReturnType<typeof makeTracker>;

const KEY = Symbol('tracker');
export const setTracker = (t: Tracker) => setContext(KEY, t);
export const getTracker = () => getContext<Tracker>(KEY);
```

- [ ] **Step 3: Create the tracker in `src/routes/+layout.svelte`**

Replace the `<script>` body (keeping the font + css imports from Task 1):

```ts
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '../app.css';
import Toasts from '$lib/components/Toasts.svelte';
import { makeTracker } from '$lib/client/tracker.svelte';
import { setTracker } from '$lib/client/tracker-context';
let { data, children } = $props();
const t = data.user ? makeTracker(data as never) : null;
if (t) setTracker(t);
```

Keep the existing template (old nav) unchanged in this task.

- [ ] **Step 4: Swap all six views to the shared tracker**

In each of `checklist`, `planner`, `inventory`, `droids`, `keepers`, `roi` `+page.svelte`, replace:

```ts
import { makeTracker } from '$lib/client/tracker.svelte';
...
const t = makeTracker(page.data as never);
```

with:

```ts
import { getTracker } from '$lib/client/tracker-context';
...
const t = getTracker()!;
```

(If a page no longer uses `page` after the swap, keep the import only if still referenced — e.g. checklist still reads `page.data.reference`.)

- [ ] **Step 5: Full-reload redirects in login/register**

In `src/routes/login/+page.svelte` and `src/routes/register/+page.svelte` replace:

```ts
await goto('/checklist', { invalidateAll: true });
```

with:

```ts
location.assign('/checklist'); // full reload so the layout re-inits the shared tracker
```

Remove the now-unused `goto` import in both files.

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: 0 errors.

Run: `npm run test:e2e` (dev DB container must be up; from repo root `docker compose -f docker-compose.dev.yml up -d` first)
Expected: existing smoke test PASSES (register → ☐ toggle → reload persists — checklist is still the old UI).

- [ ] **Step 7: Commit**

```bash
git add ../app
git commit -m "feat: shared tracker via context with cycle/rebirth/hide-done persistence"
```

---

### Task 5: Shell — sidebar, header, profile switcher; Toasts restyle

**Files:**
- Create: `app/src/lib/components/Shell.svelte`
- Create: `app/src/lib/client/search.svelte.ts`
- Modify: `app/src/routes/+layout.svelte` (render Shell)
- Modify: `app/src/lib/components/Toasts.svelte` (restyle)

**Interfaces:**
- Consumes: `getTracker()`, `pad2`, `page` from `$app/state`, `search` module.
- Produces: `Shell.svelte` with props `{ user: { id: number; username: string }; reference: App.PageData['reference']; children: Snippet }`; `search` — module-level `$state({ open: false })` imported as `import { search } from '$lib/client/search.svelte';` (Task 7's popover and this header field both flip `search.open`).

- [ ] **Step 1: Create `src/lib/client/search.svelte.ts`**

```ts
// Global search-popover state; header field and hotkeys both flip this.
export const search = $state({ open: false });
```

- [ ] **Step 2: Create `src/lib/components/Shell.svelte`**

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { search } from '$lib/client/search.svelte';
	import { pad2 } from '$lib/client/format';

	let { user, reference, children }: {
		user: { id: number; username: string };
		reference: App.PageData['reference'];
		children: Snippet;
	} = $props();

	const t = getTracker()!;
	const NAV: { label: string; href: string | null }[] = [
		{ label: 'CHECKLIST', href: '/checklist' },
		{ label: 'PLANNER', href: '/planner' },
		{ label: 'INVENTORY', href: '/inventory' },
		{ label: 'DROIDEX', href: '/droids' },
		{ label: 'KEEPERS', href: '/keepers' },
		{ label: 'ROI', href: '/roi' },
		{ label: 'SRB PRE-PLAN', href: null },
		{ label: 'REFERENCE', href: null }
	];
	const TITLES: Record<string, string> = {
		'/checklist': 'CHECKLIST', '/planner': 'PLANNER', '/inventory': 'INVENTORY',
		'/droids': 'DROIDEX', '/keepers': 'KEEPERS', '/roi': 'ROI — PAYBACK TIME'
	};
	const path = $derived(page.url.pathname);
	const title = $derived(TITLES[path] ?? 'TRACKER');
	const pad = $derived(path !== '/checklist');
	const dataV = $derived(
		reference?.version ? new Date(reference.version.ingestedAt).toISOString().slice(0, 10) : null
	);
	let profOpen = $state(false);
	const activeP = $derived(t.active());
</script>

<div class="shell">
	<aside>
		<div class="brand">
			<div class="mark">DT</div>
			<div class="word">TYCOON<span>//</span>TRKR</div>
		</div>
		<nav>
			{#each NAV as n (n.label)}
				{#if n.href}
					<a href={n.href} class:active={path === n.href}>{n.label}</a>
				{:else}
					<div class="soon">{n.label}<span>SOON</span></div>
				{/if}
			{/each}
		</nav>
		<div class="profiles">
			<div class="plabel">PROFILES</div>
			<button class="pcard" onclick={() => (profOpen = !profOpen)}>
				<span class="avatar">{(activeP?.owner ?? user.username)[0].toUpperCase()}</span>
				<span class="pname">{activeP ? `${activeP.owner}/${activeP.name}` : 'no profile'}</span>
				<span class="caret">▾</span>
			</button>
			{#if profOpen}
				<div class="pmenu">
					{#each t.state.profiles as p (p.id)}
						<button class="pitem" class:sel={p.id === t.state.activeId}
							onclick={() => { t.selectProfile(p.id); profOpen = false; }}>
							{p.owner}/{p.name}
							{#if p.userId !== user.id}<span class="rotag">RO</span>{/if}
						</button>
					{/each}
					<div class="pfoot">
						<span>{user.username}</span>
						<form method="POST" action="/api/auth/logout"><button>Log out</button></form>
					</div>
				</div>
			{/if}
		</div>
	</aside>
	<section class="col">
		<header>
			<h1>{title}</h1>
			{#if activeP && !t.editable()}<span class="robadge">READ-ONLY</span>{/if}
			<div class="cycle">
				<button class:on={t.cycle() === 1} disabled={!t.editable()} onclick={() => t.setCycle(1)}>CYCLE 1</button>
				<span class="vsep"></span>
				<button class:on={t.cycle() === 2} disabled={!t.editable()} onclick={() => t.setCycle(2)}>CYCLE 2</button>
			</div>
			<div class="rb notch">
				<span class="rlabel">REBIRTH</span>
				<span class="rval">{pad2(t.rebirth())}<span>/27</span></span>
				<span class="steps">
					<button disabled={!t.editable()} aria-label="rebirth minus" onclick={() => t.setRebirth(t.rebirth() - 1)}>−</button>
					<button class="plus" disabled={!t.editable()} aria-label="rebirth plus" onclick={() => t.setRebirth(t.rebirth() + 1)}>+</button>
				</span>
			</div>
			<button class="searchfield" onclick={() => (search.open = true)}>
				⌕ search droid… <span class="kbd">⌘K</span>
			</button>
			<button class="hidedone" class:on={t.hideDone()} onclick={() => t.setHideDone(!t.hideDone())}>
				{t.hideDone() ? '◉' : '○'} HIDE DONE
			</button>
			{#if dataV}<span class="datav">data v{dataV}</span>{/if}
		</header>
		<main class:pad>{@render children()}</main>
	</section>
</div>

<style>
	.shell {
		display: flex; height: 100vh; min-width: 1180px; overflow: hidden;
	}
	aside {
		width: 190px; flex: none; display: flex; flex-direction: column;
		padding: 14px 0; border-right: 1px solid var(--line); background: rgba(6, 10, 18, 0.7);
	}
	.brand {
		display: flex; align-items: center; gap: 8px;
		padding: 0 16px 14px; border-bottom: 1px solid var(--line);
	}
	.mark {
		width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
		background: linear-gradient(135deg, var(--accent), #1272b8);
		clip-path: polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%);
		font: 700 12px var(--font-mono); color: var(--bg);
	}
	.word { font: 700 12px var(--font-disp); letter-spacing: 1.5px; }
	.word span { color: var(--accent); }
	nav { display: flex; flex-direction: column; gap: 2px; padding: 12px 8px; }
	nav a, .soon {
		display: flex; align-items: center; gap: 8px; padding: 8px 10px;
		font: 600 12px var(--font-disp); letter-spacing: 0.6px; text-decoration: none;
		border-left: 2px solid transparent; color: var(--txt-2); user-select: none;
	}
	nav a:hover { color: var(--txt); }
	nav a.active { background: rgba(53, 200, 255, 0.12); border-left-color: var(--accent); color: var(--accent); }
	.soon { color: var(--txt-4); cursor: default; }
	.soon span { font: 600 7.5px var(--font-mono); color: var(--txt-4); letter-spacing: 0.5px; }
	.profiles {
		margin-top: auto; padding: 12px 12px 0; border-top: 1px solid var(--line);
		display: flex; flex-direction: column; gap: 8px; position: relative;
	}
	.plabel { font: 600 9px var(--font-mono); color: var(--txt-3); letter-spacing: 1px; }
	.pcard {
		display: flex; align-items: center; gap: 8px; padding: 7px 9px;
		background: var(--panel); border: 1px solid var(--line-ctrl); border-radius: 6px;
		color: var(--txt); cursor: pointer;
	}
	.avatar {
		width: 20px; height: 20px; flex: none; border-radius: 50%; background: var(--accent);
		color: var(--bg); font: 700 10px var(--font-mono);
		display: flex; align-items: center; justify-content: center;
	}
	.pname { font: 600 11px var(--font-disp); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.caret { margin-left: auto; color: var(--txt-3); font-size: 9px; }
	.pmenu {
		position: absolute; bottom: 100%; left: 12px; right: 12px; margin-bottom: 6px;
		background: var(--panel); border: 1px solid var(--line-ctrl); border-radius: 6px;
		display: flex; flex-direction: column; overflow: hidden; z-index: 40;
	}
	.pitem {
		display: flex; align-items: center; gap: 6px; padding: 7px 10px; text-align: left;
		background: transparent; border: none; color: var(--txt-2);
		font: 600 11px var(--font-disp); cursor: pointer;
	}
	.pitem:hover { background: rgba(53, 200, 255, 0.08); color: var(--txt); }
	.pitem.sel { color: var(--accent); }
	.rotag { font: 600 7.5px var(--font-mono); color: var(--txt-4); }
	.pfoot {
		display: flex; align-items: center; justify-content: space-between; gap: 8px;
		padding: 7px 10px; border-top: 1px solid var(--line-ctrl);
		font: 600 10px var(--font-mono); color: var(--txt-3);
	}
	.pfoot button {
		background: transparent; border: 1px solid var(--line-ctrl); border-radius: 5px;
		color: var(--txt-2); font: 600 9px var(--font-mono); padding: 2px 8px; cursor: pointer;
	}
	.col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
	header {
		flex: none; display: flex; align-items: center; gap: 12px;
		padding: 12px 18px; border-bottom: 1px solid var(--line);
	}
	h1 { margin: 0; font: 700 14px var(--font-disp); letter-spacing: 1px; }
	.robadge {
		font: 700 8px var(--font-mono); color: var(--alert);
		border: 1px solid var(--alert); border-radius: 99px; padding: 2px 8px; letter-spacing: 0.5px;
	}
	.cycle { display: flex; align-items: stretch; border: 1px solid var(--line-ctrl); border-radius: 7px; overflow: hidden; }
	.cycle button {
		padding: 6px 12px; font: 700 10px var(--font-mono); background: transparent;
		border: none; color: var(--txt-3); cursor: pointer; user-select: none;
	}
	.cycle button.on { background: rgba(53, 200, 255, 0.15); color: var(--accent); }
	.cycle button:disabled { cursor: default; }
	.vsep { width: 1px; background: var(--line-ctrl); }
	.rb {
		display: flex; align-items: center; gap: 10px;
		background: var(--panel); border: 1px solid var(--line-ctrl); padding: 6px 10px;
	}
	.rlabel { font: 600 9px var(--font-mono); color: var(--txt-3); }
	.rval { font: 700 14px var(--font-mono); color: var(--txt); }
	.rval span { color: var(--txt-3); }
	.steps { display: flex; gap: 4px; }
	.steps button {
		width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
		background: transparent; border: 1px solid var(--line-ctrl); color: var(--txt-2);
		font-size: 11px; cursor: pointer; user-select: none;
	}
	.steps button.plus { border-color: var(--accent); color: var(--accent); }
	.steps button:disabled { opacity: 0.5; cursor: default; }
	.searchfield {
		flex: 1; max-width: 320px; display: flex; align-items: center; gap: 8px;
		background: var(--panel); border: 1px solid var(--line-ctrl); border-radius: 6px;
		padding: 7px 11px; color: var(--txt-3); font: 500 11px var(--font-mono);
		cursor: pointer; user-select: none;
	}
	.searchfield .kbd { margin-left: auto; }
	.hidedone {
		margin-left: auto; display: flex; align-items: center; gap: 6px;
		background: transparent; border: none; font: 600 9px var(--font-mono);
		color: var(--txt-3); letter-spacing: 0.5px; cursor: pointer; user-select: none;
	}
	.hidedone.on { color: var(--good); }
	.datav { font: 500 9px var(--font-mono); color: var(--txt-4); }
	main { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; }
	main.pad { padding: 14px 18px; display: block; }
</style>
```

- [ ] **Step 3: Render Shell in `src/routes/+layout.svelte`**

Replace the template (script from Task 4 stays; add the Shell import):

```svelte
{#if data.user && t}
	<Shell user={data.user} reference={data.reference}>{@render children()}</Shell>
{:else}
	{@render children()}
{/if}
<Toasts />
```

with `import Shell from '$lib/components/Shell.svelte';` added to the script. Delete the old `<nav>` block entirely.

- [ ] **Step 4: Restyle `src/lib/components/Toasts.svelte`**

```svelte
<script lang="ts">
	import { toasts } from '$lib/client/toast.svelte';
</script>

<div class="stack" role="status">
	{#each toasts.list as t (t.id)}
		<div class="toast">{t.msg}</div>
	{/each}
</div>

<style>
	.stack { position: fixed; bottom: 1rem; right: 1rem; z-index: 100; }
	.toast {
		background: var(--panel); color: var(--txt);
		border: 1px solid var(--line-ctrl); border-left: 2px solid var(--alert);
		font: 600 11px var(--font-mono); padding: 8px 12px; margin-top: 6px; border-radius: 6px;
	}
</style>
```

- [ ] **Step 5: Verify**

Run: `npm run check`
Expected: 0 errors (a11y warnings acceptable, errors not).

Run: `npm run test:e2e`
Expected: smoke PASSES (it never used the old nav; register → checklist still works).

Manual: `INVITE_CODE=dev npm run dev` — log in, confirm sidebar/header render, cycle + rebirth + hide-done controls persist across reload, profile dropdown switches profiles, READ-ONLY badge on another member's profile, logout works.

- [ ] **Step 6: Commit**

```bash
git add ../app
git commit -m "feat: holo-terminal shell — sidebar, header controls, profile switcher"
```

---

### Task 6: TierChip, StatStrip, TierLadder components

**Files:**
- Create: `app/src/lib/components/TierChip.svelte`
- Create: `app/src/lib/components/StatStrip.svelte`
- Create: `app/src/lib/components/TierLadder.svelte`

**Interfaces:**
- Consumes: `getTracker()`, `earliestReq`, `RIDX/TIERS/Tier`, `pad2`, `.t-<Tier>` classes and tokens from Task 1.
- Produces:
  - `TierChip` props `{ name: string; tier: Tier; count: number; satisfying?: boolean; disabled?: boolean; onInc: () => void; onDec: () => void }` — accessible name is `"{name} {tier}"` (e2e relies on this).
  - `StatStrip` props `{ cells: { label: string; value: string; color?: string }[] }`.
  - `TierLadder` props `{ droid: string }` — self-contained (reads tracker + reference); stepper buttons' accessible names are `"{droid} {tier} plus"` / `"{droid} {tier} minus"` (e2e relies on this).

- [ ] **Step 1: Create `src/lib/components/TierChip.svelte`**

```svelte
<script lang="ts">
	import type { Tier } from '$lib/game/tiers';

	const LETTER: Record<Tier, string> = { Base: 'B', Gold: 'G', Diamond: 'D', Rainbow: 'R', Beskar: 'BK' };

	let { name, tier, count, satisfying = false, disabled = false, onInc, onDec }: {
		name: string; tier: Tier; count: number; satisfying?: boolean; disabled?: boolean;
		onInc: () => void; onDec: () => void;
	} = $props();
</script>

<button
	class="chip t-{tier}"
	class:ring={satisfying}
	{disabled}
	aria-label="{name} {tier}"
	onclick={onInc}
	oncontextmenu={(e) => { e.preventDefault(); if (!disabled) onDec(); }}
>
	{LETTER[tier]} <b>{count}</b>
</button>

<style>
	.chip {
		display: inline-flex; align-items: center; gap: 4px;
		font: 700 9px var(--font-mono); padding: 3px 9px;
		border-radius: 99px; border: 1px solid currentColor;
		cursor: pointer; user-select: none;
	}
	.chip b { font-size: 10px; }
	.chip:disabled { cursor: default; opacity: 0.7; }
	.ring { box-shadow: 0 0 0 2px rgba(61, 223, 138, 0.4); }
</style>
```

(`.t-{tier}` supplies fg/bg from the Task 1 global classes; the border picks up `currentColor`.)

- [ ] **Step 2: Create `src/lib/components/StatStrip.svelte`**

```svelte
<script lang="ts">
	let { cells }: { cells: { label: string; value: string; color?: string }[] } = $props();
</script>

<div class="strip">
	{#each cells as c (c.label)}
		<div class="cell">
			<div class="lbl">{c.label}</div>
			<div class="val" style:color={c.color ?? 'var(--txt)'}>{c.value}</div>
		</div>
	{/each}
</div>

<style>
	.strip { flex: none; display: flex; gap: 1px; background: var(--line); border-bottom: 1px solid var(--line); }
	.cell { flex: 1; background: var(--panel-deep); padding: 8px 18px; }
	.lbl { font: 600 8.5px var(--font-mono); color: var(--txt-3); letter-spacing: 1px; }
	.val { font: 700 16px var(--font-mono); }
</style>
```

- [ ] **Step 3: Create `src/lib/components/TierLadder.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { earliestReq } from '$lib/game/requirements';
	import { RIDX, TIERS } from '$lib/game/tiers';
	import { pad2 } from '$lib/client/format';

	let { droid }: { droid: string } = $props();

	const t = getTracker()!;
	const ref = page.data.reference!;
	const cycle = $derived(t.cycle());
	const req = $derived(earliestReq(ref.rebirthReqs, cycle, t.rebirth(), droid));
	const counts = $derived(t.countsFor(cycle, droid));
	const rows = $derived(
		TIERS.map((tier, i) => {
			let status = 'SELLABLE';
			let needed = false;
			if (req) {
				const ri = RIDX[req.tier];
				if (i === ri) { status = `RB ${pad2(req.rebirth)}`; needed = true; }
				else if (i > ri) { status = `RB ${pad2(req.rebirth)} ↑`; needed = true; }
			}
			return { tier, i, status, needed, n: counts[i] };
		})
	);
</script>

<div class="ladder">
	{#each rows as r (r.tier)}
		<div class="lrow" class:dim={!r.needed}>
			<span class="tname tier-{r.tier}">{r.tier.toUpperCase()}</span>
			<span class="status" class:need={r.needed}>{r.status}</span>
			<span class="step pill">
				<button disabled={!t.editable()} aria-label="{droid} {r.tier} minus"
					onclick={() => t.setCount(cycle, droid, r.tier, Math.max(0, r.n - 1))}>−</button>
				<b>{r.n}</b>
				<button class="plus" disabled={!t.editable()} aria-label="{droid} {r.tier} plus"
					onclick={() => t.setCount(cycle, droid, r.tier, r.n + 1)}>+</button>
			</span>
		</div>
	{/each}
</div>

<style>
	.ladder { display: flex; flex-direction: column; }
	.lrow {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 14px; border-bottom: 1px solid var(--line-row);
	}
	.lrow.dim { opacity: 0.5; }
	.tname { font: 700 9px var(--font-mono); width: 60px; }
	.status { font: 600 9px var(--font-mono); color: var(--txt-2); letter-spacing: 0.5px; }
	.status.need { color: var(--good); }
	.step {
		margin-left: auto; display: inline-flex; align-items: center; gap: 5px;
		border-color: var(--line-ctrl); padding: 2px 5px;
	}
	.step button {
		width: 18px; text-align: center; background: transparent; border: none;
		color: var(--txt-2); cursor: pointer; user-select: none; font-size: 11px;
	}
	.step button.plus { color: var(--accent); }
	.step button:disabled { opacity: 0.5; cursor: default; }
	.step b { font: 700 11px var(--font-mono); color: var(--txt); }
</style>
```

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: 0 errors. (Components mount in Tasks 7–8; e2e coverage lands there.)

- [ ] **Step 5: Commit**

```bash
git add ../app
git commit -m "feat: TierChip, StatStrip, TierLadder components"
```

---

### Task 7: SearchPopover — global droid search with hotkeys

**Files:**
- Create: `app/src/lib/components/SearchPopover.svelte`
- Modify: `app/src/routes/+layout.svelte` (mount inside authed branch)
- Create: `app/e2e/search.spec.ts`

**Interfaces:**
- Consumes: `search` module (Task 5), `TierLadder`, `earliestReq`, `getTracker`, `pad2`.
- Produces: popover open on ⌘K/Ctrl+K, Ctrl+`` ` ``, `/` (not while typing in inputs); Esc/backdrop closes; ↑↓ move the active result; dialog accessible name `droid search`.

- [ ] **Step 1: Create `src/lib/components/SearchPopover.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { search } from '$lib/client/search.svelte';
	import { earliestReq } from '$lib/game/requirements';
	import { pad2 } from '$lib/client/format';
	import TierLadder from '$lib/components/TierLadder.svelte';

	const t = getTracker()!;
	const ref = page.data.reference!;
	let q = $state('');
	let activeIdx = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	const results = $derived.by(() => {
		const s = q.trim().toLowerCase();
		if (!s) return [];
		return ref.droids.filter((d) => d.name.toLowerCase().includes(s)).slice(0, 12);
	});
	const active = $derived(results[Math.min(activeIdx, Math.max(0, results.length - 1))] ?? null);
	const req = $derived(active ? earliestReq(ref.rebirthReqs, t.cycle(), t.rebirth(), active.name) : null);

	$effect(() => {
		if (search.open) {
			q = '';
			activeIdx = 0;
			queueMicrotask(() => inputEl?.focus());
		}
	});

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName ?? '';
		const typing = tag === 'INPUT' || tag === 'TEXTAREA';
		if (!search.open) {
			if (
				((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') ||
				(e.ctrlKey && e.key === '`') ||
				(e.key === '/' && !typing)
			) {
				e.preventDefault();
				search.open = true;
			}
			return;
		}
		if (e.key === 'Escape') { search.open = false; return; }
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.open = false; return; }
		if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(results.length - 1, activeIdx + 1); }
		if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); }
	}
</script>

<svelte:window onkeydown={onKey} />

{#if search.open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={() => (search.open = false)}></div>
	<div class="pop notch10" role="dialog" aria-label="droid search">
		<div class="phead">
			<span class="glass">⌕</span>
			<input bind:this={inputEl} bind:value={q} placeholder="search droid…" spellcheck="false"
				oninput={() => (activeIdx = 0)} />
			<button class="kbd" onclick={() => (search.open = false)}>ESC</button>
		</div>
		{#if results.length > 0}
			<div class="chips">
				{#each results as d, i (d.name)}
					<button class="rchip pill" class:on={i === activeIdx} onclick={() => (activeIdx = i)}>{d.name}</button>
				{/each}
			</div>
			{#if active}
				<div class="ahead">
					<span class="aname">{active.name}</span>
					<span class="ameta">{active.rarity.toUpperCase()} · {active.type.toUpperCase()}</span>
					<span class="averdict" class:keep={!!req}>
						{req ? `KEEP · RB${pad2(req.rebirth)}` : 'SELLABLE'}
					</span>
				</div>
				<TierLadder droid={active.name} />
			{/if}
		{:else if q.trim()}
			<div class="none">NO DROID MATCHES "{q.trim().toUpperCase()}"</div>
		{/if}
		<div class="pfoot">
			<span>+/− ADJUST COUNTS — SYNCS TO CHECKLIST</span>
			<span class="kbd">⌘K</span><span class="kbd">CTRL+`</span>
		</div>
	</div>
{/if}

<style>
	.backdrop { position: fixed; inset: 0; background: rgba(2, 4, 8, 0.55); z-index: 50; }
	.pop {
		position: fixed; top: 70px; left: 50%; transform: translateX(-50%); width: 440px; z-index: 51;
		border: 1px solid var(--accent); background: rgba(5, 9, 16, 0.97);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.75);
		display: flex; flex-direction: column;
	}
	.phead { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
	.glass { color: var(--accent); font-size: 13px; }
	.phead input {
		flex: 1; background: transparent; border: none; outline: none;
		color: var(--txt); font: 600 12px var(--font-mono); caret-color: var(--accent);
	}
	.phead .kbd { cursor: pointer; }
	.chips { display: flex; gap: 5px; flex-wrap: wrap; padding: 9px 14px; border-bottom: 1px solid var(--line); }
	.rchip {
		font: 700 8.5px var(--font-mono); padding: 3px 9px; cursor: pointer;
		background: transparent; color: var(--txt-2); border-color: var(--line-ctrl);
	}
	.rchip.on { color: var(--accent); border-color: var(--accent); background: rgba(53, 200, 255, 0.1); }
	.ahead {
		display: flex; align-items: center; gap: 10px; padding: 9px 14px;
		background: rgba(53, 200, 255, 0.06); border-bottom: 1px solid var(--line);
	}
	.aname { font: 600 12px var(--font-disp); color: var(--base); }
	.ameta { font: 500 7.5px var(--font-mono); color: var(--txt-3); letter-spacing: 0.5px; }
	.averdict { margin-left: auto; font: 700 8.5px var(--font-mono); color: var(--txt-2); letter-spacing: 0.5px; }
	.averdict.keep { color: var(--warn); }
	.none { padding: 16px; font: 600 9px var(--font-mono); color: var(--txt-3); letter-spacing: 0.5px; }
	.pfoot {
		display: flex; align-items: center; gap: 8px; padding: 8px 14px;
		border-top: 1px solid var(--line); font: 600 8px var(--font-mono);
		color: var(--txt-3); letter-spacing: 0.5px;
	}
	.pfoot .kbd:first-of-type { margin-left: auto; }
</style>
```

- [ ] **Step 2: Mount in `src/routes/+layout.svelte`**

Add `import SearchPopover from '$lib/components/SearchPopover.svelte';` and render it inside the authed branch:

```svelte
{#if data.user && t}
	<Shell user={data.user} reference={data.reference}>{@render children()}</Shell>
	<SearchPopover />
{:else}
	{@render children()}
{/if}
<Toasts />
```

- [ ] **Step 3: Write `e2e/search.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';

async function registerWithProfile(page: Page, user: string) {
	await page.goto('/register');
	await page.getByLabel('Username').fill(user);
	await page.getByLabel('Password').fill('password123');
	await page.getByLabel('Invite code').fill('e2e-invite');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/checklist/);
	await page.request.post('/api/profiles', { data: { name: 'main' } });
	await page.reload();
}

test('search popover: hotkeys, arrows, count edit persists', async ({ page }) => {
	await registerWithProfile(page, `srch${Date.now()}`);

	// a droid name guaranteed to exist: first checklist row
	const droid = (await page.locator('.dname').first().textContent())!.trim();

	// Ctrl+K opens; Escape closes; '/' reopens
	await page.keyboard.press('Control+k');
	const dialog = page.getByRole('dialog', { name: 'droid search' });
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await page.keyboard.press('/');
	await expect(dialog).toBeVisible();

	// type, arrow between results, ladder shows steppers
	await dialog.getByPlaceholder('search droid…').fill(droid.slice(0, 3));
	await expect(dialog.locator('.rchip').first()).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowUp');
	await dialog.getByRole('button', { name: droid, exact: true }).click();

	// + on Base persists to the server
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		dialog.getByRole('button', { name: `${droid} Base plus` }).click()
	]);
	await page.keyboard.press('Escape');

	// reopen after reload: count survived
	await page.reload();
	await page.keyboard.press('Control+k');
	await dialog.getByPlaceholder('search droid…').fill(droid.slice(0, 3));
	await dialog.getByRole('button', { name: droid, exact: true }).click();
	await expect(dialog.getByRole('button', { name: `${droid} Base plus` }).locator('..')).toContainText('1');
});
```

**Note:** `.dname` doesn't exist until Task 8 rewrites the checklist. Add `test.skip(true, 'enabled in the checklist rewrite task');` as the first line inside the test body so the suite stays green; Task 8 Step 4 removes that line.

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: 0 errors.

Run: `npm run test:e2e`
Expected: smoke PASSES; search spec is skipped (see note above).

Manual: dev server — ⌘K/Ctrl+`/` `/` open the popover on every view including old ones; typing filters; steppers adjust counts; Esc closes.

- [ ] **Step 5: Commit**

```bash
git add ../app
git commit -m "feat: global droid-search popover with hotkeys and live ladder"
```

---

### Task 8: Checklist rewrite + e2e coverage

**Files:**
- Modify: `app/src/routes/checklist/+page.svelte` (full rewrite)
- Modify: `app/e2e/smoke.spec.ts` (chip-based flow)
- Create: `app/e2e/checklist.spec.ts`
- Modify: `app/e2e/search.spec.ts` (remove the skip line)

**Interfaces:**
- Consumes: everything from Tasks 1–7. Class hooks e2e relies on: `.row` (checklist row), `.dname` (droid name), `.req` (required pill), `.brb` (block RB label), `data-testid="verdict"`, chip accessible name `"{droid} {Tier}"`, ladder-toggle accessible name `"{droid} ladder"`.

- [ ] **Step 1: Rewrite `src/routes/checklist/+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { satisfyingIdx } from '$lib/game/inventory';
	import { RIDX, TIERS, type Tier } from '$lib/game/tiers';
	import { pad2 } from '$lib/client/format';
	import TierChip from '$lib/components/TierChip.svelte';
	import TierLadder from '$lib/components/TierLadder.svelte';
	import StatStrip from '$lib/components/StatStrip.svelte';

	const t = getTracker()!;
	const ref = page.data.reference!; // auth-gated route: reference is always present
	const cycle = $derived(t.cycle());
	const fromRb = $derived(t.rebirth());
	let open = $state<Record<string, boolean>>({});

	const droidMeta = $derived.by(() => {
		const m = new Map<string, string>();
		for (const d of ref.droids) m.set(d.name, `${d.rarity.toUpperCase()} · ${d.type.toUpperCase()}`);
		return m;
	});

	const blocks = $derived.by(() => {
		const by = new Map<number, typeof ref.rebirthReqs>();
		for (const r of ref.rebirthReqs)
			if (r.cycle === cycle && r.rebirth >= fromRb)
				(by.get(r.rebirth) ?? by.set(r.rebirth, []).get(r.rebirth)!).push(r);
		return [...by.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([rb, reqRows]) => {
				const rows = reqRows.map((r) => {
					const tier = r.tier as Tier;
					const sat = satisfyingIdx(t.countRows(), cycle, r.droid, tier);
					return {
						droid: r.droid,
						tier,
						sat,
						met: sat >= 0,
						counts: t.countsFor(cycle, r.droid),
						meta: droidMeta.get(r.droid) ?? '',
						chipTiers: TIERS.slice(RIDX[tier])
					};
				});
				return {
					rb,
					rows,
					met: rows.filter((r) => r.met).length,
					total: rows.length,
					credits: reqRows[0]?.credits ?? '',
					unlock: reqRows.find((r) => r.unlock)?.unlock ?? ''
				};
			});
	});

	const visBlocks = $derived(
		!t.hideDone()
			? blocks
			: blocks
					.map((b) => ({ ...b, rows: b.rows.filter((r) => !r.met) }))
					.filter((b) => b.rows.length > 0)
	);

	const curBlock = $derived(blocks.find((b) => b.rb === fromRb));
	const nova = $derived(ref.rebirthMeta.find((m) => m.rebirth === fromRb)?.nova ?? null);
	const stats = $derived([
		{ label: 'THIS REBIRTH COST', value: curBlock?.credits || '—', color: 'var(--warn)' },
		{ label: 'DROIDS MET', value: curBlock ? `${curBlock.met}/${curBlock.total}` : '—', color: 'var(--good)' },
		{ label: 'CYCLE PROGRESS', value: `${Math.round(((fromRb - 1) / 27) * 100)}%`, color: 'var(--txt)' },
		{ label: 'NOVA @ THIS RB', value: nova ? `${nova} ✦` : '—', color: 'var(--nova)' }
	]);
</script>

{#if !t.active()}
	<div class="empty">NO PROFILE YET — create one, then reload.</div>
{:else}
	<StatStrip cells={stats} />
	<div class="hintbar">TAP CHIP = +1 · RIGHT-CLICK = −1 · GREEN RING = TIER SATISFYING THE REQUIREMENT</div>
	<div class="blocks">
		{#each visBlocks as b (b.rb)}
			<div class="bhead">
				<span class="brb">RB{pad2(b.rb)}</span>
				<span class="bcred">{b.credits}</span>
				<span class="bmet" class:done={b.met === b.total}>{b.met}/{b.total}</span>
				<span class="bunlock">{b.unlock}</span>
			</div>
			{#each b.rows as r (r.droid + r.tier)}
				<div class="row" class:met={r.met}>
					<div class="ncol">
						<span class="dname">{r.droid}</span>
						<span class="dmeta">{r.meta}</span>
					</div>
					<span class="req pill t-{r.tier}">{r.tier.toUpperCase()}</span>
					<span class="chips">
						{#each r.chipTiers as ct (ct)}
							<TierChip
								name={r.droid} tier={ct} count={r.counts[RIDX[ct]]}
								satisfying={RIDX[ct] === r.sat} disabled={!t.editable()}
								onInc={() => t.setCount(cycle, r.droid, ct, r.counts[RIDX[ct]] + 1)}
								onDec={() => t.setCount(cycle, r.droid, ct, Math.max(0, r.counts[RIDX[ct]] - 1))} />
						{/each}
					</span>
					<span class="verdict" data-testid="verdict" class:ok={r.met}>
						{r.met ? `✓ ${TIERS[r.sat].toUpperCase()}` : `KEEP · RB${pad2(b.rb)}`}
					</span>
					<button class="expand" aria-label="{r.droid} ladder" aria-expanded={!!open[`${b.rb}-${r.droid}`]}
						onclick={() => (open[`${b.rb}-${r.droid}`] = !open[`${b.rb}-${r.droid}`])}>▾</button>
				</div>
				{#if open[`${b.rb}-${r.droid}`]}
					<div class="rowladder"><TierLadder droid={r.droid} /></div>
				{/if}
			{/each}
		{/each}
	</div>
{/if}

<style>
	.empty { padding: 24px 18px; font: 600 10px var(--font-mono); color: var(--txt-3); letter-spacing: 1px; }
	.hintbar {
		flex: none; display: flex; align-items: center; gap: 8px; padding: 7px 18px;
		border-bottom: 1px solid var(--line-row);
		font: 600 8px var(--font-mono); color: var(--txt-4); letter-spacing: 1px;
	}
	.blocks { flex: 1; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
	.bhead {
		display: flex; align-items: center; gap: 10px; padding: 8px 18px;
		background: rgba(53, 200, 255, 0.04);
		border-top: 1px solid var(--line-row); border-bottom: 1px solid var(--line-row);
	}
	.brb { font: 700 11px var(--font-mono); color: var(--accent); letter-spacing: 1px; }
	.bcred { font: 600 10px var(--font-mono); color: var(--warn); }
	.bmet { font: 600 9px var(--font-mono); color: var(--txt-2); }
	.bmet.done { color: var(--good); }
	.bunlock { margin-left: auto; font: 600 8.5px var(--font-mono); color: var(--txt-3); letter-spacing: 0.5px; }
	.row {
		display: flex; align-items: center; gap: 12px; padding: 8px 18px;
		border-bottom: 1px solid var(--line-row2);
	}
	.row.met { opacity: 0.6; }
	.ncol { display: flex; flex-direction: column; gap: 2px; width: 170px; flex: none; }
	.dname { font: 600 12px var(--font-disp); color: var(--txt); }
	.dmeta { font: 500 7.5px var(--font-mono); color: var(--txt-3); letter-spacing: 0.5px; }
	.req { font: 700 8px var(--font-mono); padding: 2px 8px; flex: none; width: 58px; text-align: center; border: none; }
	.chips { display: flex; gap: 5px; flex: 1; min-width: 0; }
	.verdict {
		font: 700 9px var(--font-mono); color: var(--warn);
		width: 86px; text-align: right; flex: none; letter-spacing: 0.5px;
	}
	.verdict.ok { color: var(--good); }
	.expand {
		background: transparent; border: none; color: var(--txt-3);
		font-size: 10px; cursor: pointer; user-select: none; padding: 2px 4px;
	}
	.expand[aria-expanded='true'] { color: var(--accent); }
	.rowladder { border-bottom: 1px solid var(--line-row2); background: var(--panel-deep); padding-left: 240px; }
</style>
```

- [ ] **Step 2: Rewrite `e2e/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('register → tap a chip → reload → persisted', async ({ page }) => {
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

	const firstRow = page.locator('.row').first();
	const chip = firstRow.locator('button.chip').first(); // required tier: satisfies on +1
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		chip.click()
	]);
	await expect(firstRow.getByTestId('verdict')).toContainText('✓');

	await page.reload();
	await expect(page.locator('.row').first().getByTestId('verdict')).toContainText('✓');
});
```

- [ ] **Step 3: Create `e2e/checklist.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test';

async function registerWithProfile(page: Page, user: string) {
	await page.goto('/register');
	await page.getByLabel('Username').fill(user);
	await page.getByLabel('Password').fill('password123');
	await page.getByLabel('Invite code').fill('e2e-invite');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/checklist/);
	await page.request.post('/api/profiles', { data: { name: 'main' } });
	await page.reload();
}

test('chips, verdicts, ladder, hide-done, header controls', async ({ page }) => {
	await registerWithProfile(page, `chk${Date.now()}`);

	const firstRow = page.locator('.row').first();
	const droid = (await firstRow.locator('.dname').textContent())!.trim();
	const reqText = (await firstRow.locator('.req').textContent())!.trim(); // e.g. "GOLD"
	const tierName = reqText[0] + reqText.slice(1).toLowerCase(); // "Gold"
	const chip = firstRow.getByRole('button', { name: `${droid} ${tierName}` });

	// tap chip = +1 → met
	await Promise.all([page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()), chip.click()]);
	await expect(chip).toContainText('1');
	await expect(firstRow.getByTestId('verdict')).toContainText(`✓ ${reqText}`);

	// right-click = −1 → unmet
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		chip.click({ button: 'right' })
	]);
	await expect(chip).toContainText('0');
	await expect(firstRow.getByTestId('verdict')).toContainText('KEEP');

	// ▾ inline ladder: + syncs to the row chip
	await firstRow.getByRole('button', { name: `${droid} ladder` }).click();
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		page.getByRole('button', { name: `${droid} ${tierName} plus` }).click()
	]);
	await expect(chip).toContainText('1');

	// hide done hides the now-met row
	await page.getByRole('button', { name: /HIDE DONE/ }).click();
	await expect(page.locator('.row .dname', { hasText: droid }).first()).toBeHidden();
	await page.getByRole('button', { name: /HIDE DONE/ }).click();

	// cycle toggle persists via PATCH (await both PATCHes so the stepper wait below can't
	// accidentally match a straggling cycle response)
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: 'CYCLE 2' }).click()
	]);
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: 'CYCLE 1' }).click()
	]);

	// rebirth stepper: +1 removes the RB01 block; persists across reload (debounced PATCH)
	await expect(page.locator('.brb', { hasText: 'RB01' })).toBeVisible();
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: 'rebirth plus' }).click()
	]);
	await expect(page.locator('.brb', { hasText: 'RB01' })).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.brb', { hasText: 'RB01' })).toHaveCount(0);
});

test('read-only profile disables controls', async ({ page }) => {
	const owner = `own${Date.now()}`;
	await registerWithProfile(page, owner);

	// log out via profile menu
	await page.locator('.pcard').click();
	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/login/);

	// second user selects the owner's profile
	await registerWithProfile(page, `view${Date.now()}`);
	await page.locator('.pcard').click();
	await page.getByRole('button', { name: new RegExp(`${owner}/main`) }).click();

	await expect(page.getByText('READ-ONLY')).toBeVisible();
	await expect(page.locator('.row button.chip').first()).toBeDisabled();
	await expect(page.getByRole('button', { name: 'rebirth plus' })).toBeDisabled();
});

test('old views render inside the shell', async ({ page }) => {
	await registerWithProfile(page, `nav${Date.now()}`);
	for (const [href, title] of [
		['/planner', 'PLANNER'], ['/inventory', 'INVENTORY'], ['/droids', 'DROIDEX'],
		['/keepers', 'KEEPERS'], ['/roi', 'ROI — PAYBACK TIME']
	] as const) {
		await page.goto(href);
		// target the shell's header h1 specifically — old pages keep their own h1s,
		// and role-name matching is case-insensitive (would double-match)
		await expect(page.locator('header h1')).toHaveText(title);
	}
});
```

- [ ] **Step 4: Enable the search spec**

Remove the `test.skip(...)` line added in Task 7 from `e2e/search.spec.ts`.

- [ ] **Step 5: Run the full e2e suite**

Run: `npm run check`
Expected: 0 errors.

Run: `npm run test:e2e`
Expected: smoke + search + checklist specs all PASS.

- [ ] **Step 6: Commit**

```bash
git add ../app
git commit -m "feat: checklist redesign — chip rows, verdicts, inline ladder, stats"
```

---

### Task 9: Full verification, fidelity pass, PR

**Files:**
- Possibly small CSS adjustments from the fidelity pass (no structural changes)

- [ ] **Step 1: Full test sweep**

From repo root: `docker compose -f docker-compose.dev.yml up -d` (if not running). Then in `app/`:

```bash
npm run check
npm run test:unit
npm run test:int
npm run test:e2e
```

Expected: all clean. Fix regressions before proceeding.

- [ ] **Step 2: Visual fidelity pass**

Run `INVITE_CODE=dev npm run dev` and open the prototype (`/Users/jason/Projects/DroidTycoon/design_handoff_tracker_redesign/Droid Tycoon Prototype.dc.html`) side by side. Compare: sidebar nav states, header control shapes (notched rebirth box, cycle segmenting), stat strip, block headers, row spacing/type sizes, chip pills + satisfying ring, verdict colors, search popover framing. Adjust CSS values only where they visibly diverge; keep tokens intact. Commit any adjustments as `fix: fidelity adjustments vs prototype`.

- [ ] **Step 3: Old-view smoke**

In the dev server, visit `/planner`, `/inventory`, `/droids`, `/keepers`, `/roi` — each renders inside the shell, profile switching in the sidebar affects them, no console errors.

- [ ] **Step 4: Push and open draft PR**

```bash
git push -u origin worktree-tracker-redesign-spec
gh pr create --draft --base main \
  --title "Tracker redesign: holo-terminal foundation + checklist" \
  --body "$(cat <<'EOF'
## Summary
- Design tokens + self-hosted fonts (Chakra Petch / JetBrains Mono), dark holo-terminal theme
- App shell: 190px sidebar (nav + profile switcher), header with cycle/rebirth/hide-done/search/data-version
- Shared tracker store via context; optimistic PATCH persistence (cycle, currentRebirth, prefs.hideDone)
- Components: TierChip (tap +1 / right-click −1, satisfying ring), TierLadder, SearchPopover (⌘K / Ctrl+` / "/"), StatStrip
- Checklist rewritten: rebirth blocks, chip rows, KEEP/✓ verdicts, inline ▾ ladder, hide-done
- Old views unchanged, reachable inside the new shell
- No backend changes

Spec: docs/superpowers/specs/2026-07-07-tracker-redesign-foundation-checklist-design.md
Plan: docs/superpowers/plans/2026-07-07-tracker-redesign-foundation-checklist.md

## Testing
- test:unit — game helpers (satisfyingIdx, earliestReq) + format units
- test:e2e — smoke (chip flow), checklist (chips/verdicts/ladder/hide-done/header), search (hotkeys/arrows/persistence), read-only profile
- test:int untouched and passing; svelte-check clean
EOF
)"
```

Expected: draft PR URL printed.
