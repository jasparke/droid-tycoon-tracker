# Droid Art Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a self-hosted droid thumbnail on every surface that lists droids (Checklist, SearchPopover, Inventory, Keepers, Droidex).

**Architecture:** A pure filename helper (`art.ts`) derives the droid art filename from the droid name; a `DroidImg` component renders it from `/assets/droids/` with an `onerror` fallback to droidtrakr.com then hide. All 340 `.webp` are downloaded once by a repo script and committed under `app/static/`. No backend, DB, or seed changes.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), TypeScript, Vitest (unit), Playwright (e2e), Node 22 (fetch script). Spec: `docs/superpowers/specs/2026-07-10-droid-art-thumbnails-design.md`.

## Global Constraints

- Filename contract: `normName(name) = name.toUpperCase().replace(/[^A-Z0-9]/g, '')`; `droidArtFile = {normName}_{fileTier}.webp` where `fileTier('Base') = 'Default'`, all other tiers unchanged.
- v1 renders **Base/`_Default`** identity thumbnails only — never pass a non-Base tier from a surface.
- No backend, DB, or `seed-data.json` changes. Art filename is derived client-side.
- Loading: plain `<img>` + `onerror` fallback (local → droidtrakr remote → hidden). No IndexedDB.
- Self-host: all 340 `.webp` committed under `app/static/assets/droids/`. Keep droidtrakr attribution in README.
- Code style: tabs for indentation, Svelte 5 runes, conventional-commit messages (`feat:` / `docs:` / `test:`).
- Branch: `droid-art-thumbnails` (stacked on PR #7 head `1455a4f`). Do not push to `worktree-tracker-redesign-spec`.
- Remote base URL (verbatim): `https://droidtrakr.com/droid-tycoon/assets/droids/`.

---

### Task 1: `art.ts` filename helper (pure, TDD)

**Files:**
- Create: `app/src/lib/game/art.ts`
- Test: `app/src/lib/game/art.test.ts`

**Interfaces:**
- Consumes: `Tier` from `app/src/lib/game/tiers.ts`.
- Produces: `normName(name: string): string`, `fileTier(tier: Tier): string`, `droidArtFile(name: string, tier: Tier): string`, `droidArtUrl(name: string, tier: Tier): string`.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/game/art.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normName, fileTier, droidArtFile, droidArtUrl } from './art';

describe('normName', () => {
	it('uppercases and strips non-alphanumerics', () => {
		expect(normName('A-LT')).toBe('ALT');
		expect(normName('DRK-1 PROBE')).toBe('DRK1PROBE');
		expect(normName('IMPERIAL PROBE')).toBe('IMPERIALPROBE');
		expect(normName('2BB')).toBe('2BB');
		expect(normName('MOUSE')).toBe('MOUSE');
	});
});

describe('fileTier', () => {
	it('maps Base to Default and keeps every other tier', () => {
		expect(fileTier('Base')).toBe('Default');
		expect(fileTier('Gold')).toBe('Gold');
		expect(fileTier('Beskar')).toBe('Beskar');
	});
});

describe('droidArtFile / droidArtUrl', () => {
	it('builds the filename from name + tier', () => {
		expect(droidArtFile('MOUSE', 'Rainbow')).toBe('MOUSE_Rainbow.webp');
		expect(droidArtFile('A-LT', 'Gold')).toBe('ALT_Gold.webp');
		expect(droidArtFile('DRK-1 PROBE', 'Base')).toBe('DRK1PROBE_Default.webp');
	});
	it('prefixes the static asset path', () => {
		expect(droidArtUrl('CB', 'Base')).toBe('/assets/droids/CB_Default.webp');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/lib/game/art.test.ts`
Expected: FAIL — `Failed to resolve import "./art"` / `normName is not exported`.

- [ ] **Step 3: Write minimal implementation**

Create `app/src/lib/game/art.ts`:

```ts
import type { Tier } from './tiers';

// Droid art filename convention — mirrors the prototype's droidImg/normName
// (prototype/index.html:541-564) and the asset manifest. Base tier art is
// named _Default; every other tier keeps its own name.
export function normName(name: string): string {
	return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function fileTier(tier: Tier): string {
	return tier === 'Base' ? 'Default' : tier;
}

export function droidArtFile(name: string, tier: Tier): string {
	return `${normName(name)}_${fileTier(tier)}.webp`;
}

export function droidArtUrl(name: string, tier: Tier): string {
	return `/assets/droids/${droidArtFile(name, tier)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/lib/game/art.test.ts`
Expected: PASS (3 files? no — 1 file, 4 tests pass).

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/game/art.ts app/src/lib/game/art.test.ts
git commit -m "feat: droid-art filename helper (art.ts) with tests"
```

---

### Task 2: `DroidImg` component

**Files:**
- Create: `app/src/lib/components/DroidImg.svelte`

**Interfaces:**
- Consumes: `droidArtFile`, `droidArtUrl` from `$lib/game/art`; `Tier` from `$lib/game/tiers`.
- Produces: `<DroidImg name={string} tier?={Tier='Base'} size?={number=28} class?={string} />`. Renders `<img class="dimg …">`. NOTE for later tasks: every surface must key its `{#each}` by droid name so a `DroidImg` instance is never reused for a different droid (the remote-fallback flag is per-instance).

- [ ] **Step 1: Create the component**

Create `app/src/lib/components/DroidImg.svelte`:

```svelte
<script lang="ts">
	import { droidArtFile, droidArtUrl } from '$lib/game/art';
	import type { Tier } from '$lib/game/tiers';

	let {
		name,
		tier = 'Base',
		size = 28,
		class: cls = ''
	}: { name: string; tier?: Tier; size?: number; class?: string } = $props();

	const REMOTE = 'https://droidtrakr.com/droid-tycoon/assets/droids/';
	// local /assets/droids → droidtrakr remote (once) → hidden; never breaks layout.
	let triedRemote = false;
	function onError(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (!triedRemote) {
			triedRemote = true;
			img.src = REMOTE + droidArtFile(name, tier);
		} else {
			img.style.visibility = 'hidden';
		}
	}
</script>

<img
	class="dimg {cls}"
	src={droidArtUrl(name, tier)}
	width={size}
	height={size}
	loading="lazy"
	alt=""
	onerror={onError}
/>

<style>
	.dimg {
		flex: none;
		object-fit: contain;
		border-radius: 5px;
		background: var(--panel-deep, #0a1322);
		vertical-align: middle;
	}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run check`
Expected: `0 errors` (warnings unchanged from baseline 0).

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/components/DroidImg.svelte
git commit -m "feat: DroidImg component with remote fallback"
```

---

### Task 3: Fetch + self-host all 340 droid images

**Files:**
- Create: `scripts/fetch-droid-art.mjs`
- Create (generated, committed): `app/static/assets/droids/*.webp` (340 files)

**Interfaces:**
- Consumes: `app/drizzle/seed-data.json` (`droids: {name}[]`), droidtrakr remote base URL.
- Produces: populated `app/static/assets/droids/`.

- [ ] **Step 1: Write the fetch script**

Create `scripts/fetch-droid-art.mjs`:

```js
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const dir = import.meta.dirname;
const SEED = path.join(dir, '../app/drizzle/seed-data.json');
const OUT = path.join(dir, '../app/static/assets/droids');
const REMOTE = 'https://droidtrakr.com/droid-tycoon/assets/droids/';
const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar'];

const normName = (n) => String(n).toUpperCase().replace(/[^A-Z0-9]/g, '');
const fileTier = (t) => (t === 'Base' ? 'Default' : t);
const artFile = (name, tier) => `${normName(name)}_${fileTier(tier)}.webp`;
const exists = (p) => access(p).then(() => true, () => false);

const { droids } = JSON.parse(await readFile(SEED, 'utf8'));
await mkdir(OUT, { recursive: true });
const files = droids.flatMap((d) => TIERS.map((t) => artFile(d.name, t)));
console.log(`${droids.length} droids × ${TIERS.length} tiers = ${files.length} files`);

let ok = 0;
let skipped = 0;
const failed = [];
for (const f of files) {
	const dest = path.join(OUT, f);
	if (await exists(dest)) {
		skipped++;
		ok++;
		continue;
	}
	try {
		const res = await fetch(REMOTE + f);
		const ct = res.headers.get('content-type') || '';
		if (!res.ok || !ct.includes('image/webp')) {
			failed.push(`${f} (HTTP ${res.status}, ${ct})`);
			continue;
		}
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length === 0) {
			failed.push(`${f} (empty body)`);
			continue;
		}
		await writeFile(dest, buf);
		ok++;
	} catch (e) {
		failed.push(`${f} (${e.message})`);
	}
}
console.log(`present ${ok}/${files.length} (${skipped} already on disk)`);
if (failed.length) {
	console.error(`FAILED ${failed.length}:`);
	for (const x of failed) console.error('  ' + x);
	process.exit(1);
}
console.log('all droid art present');
```

- [ ] **Step 2: Run the fetch script**

Run: `node scripts/fetch-droid-art.mjs`
Expected: `68 droids × 5 tiers = 340 files` … `all droid art present`, exit 0. If it exits non-zero, read the FAILED list — do not commit a partial set; investigate (droidtrakr availability was verified in the manifest, so a failure is likely transient — re-run, it is idempotent).

- [ ] **Step 3: Verify the count**

Run: `ls app/static/assets/droids | wc -l`
Expected: `340`

- [ ] **Step 4: Commit the script and assets**

```bash
git add scripts/fetch-droid-art.mjs app/static/assets/droids
git commit -m "feat: self-host 340 droid tier-art webp (fetch script + assets)"
```

---

### Task 4: Checklist row thumbnails

**Files:**
- Modify: `app/src/routes/checklist/+page.svelte`

**Interfaces:**
- Consumes: `DroidImg` (Task 2). Rows already keyed by `(r.droid + r.tier)`.

- [ ] **Step 1: Import DroidImg**

In `app/src/routes/checklist/+page.svelte`, add to the imports (after the `StatStrip` import line):

```svelte
	import DroidImg from '$lib/components/DroidImg.svelte';
```

- [ ] **Step 2: Add the thumbnail to each row**

Find:

```svelte
				<div class="row" class:met={r.met}>
					<div class="ncol">
```

Replace with:

```svelte
				<div class="row" class:met={r.met}>
					<DroidImg name={r.droid} size={28} />
					<div class="ncol">
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run check`
Expected: `0 errors`.

- [ ] **Step 4: Visual check**

Start the app against a seeded dev DB and register a profile (see spec / existing dev flow), open `/checklist`, confirm a droid thumbnail renders at the left of each row and the row layout is intact. Screenshot for the review gate.

- [ ] **Step 5: Commit**

```bash
git add app/src/routes/checklist/+page.svelte
git commit -m "feat: droid thumbnails in checklist rows"
```

---

### Task 5: SearchPopover thumbnail

**Files:**
- Modify: `app/src/lib/components/SearchPopover.svelte`

**Interfaces:**
- Consumes: `DroidImg` (Task 2).

- [ ] **Step 1: Import DroidImg**

In `app/src/lib/components/SearchPopover.svelte`, add to the component imports:

```svelte
	import DroidImg from '$lib/components/DroidImg.svelte';
```

- [ ] **Step 2: Add the thumbnail to the active-droid header**

Find:

```svelte
				<div class="ahead">
					<span class="aname">{active.name}</span>
```

Replace with:

```svelte
				<div class="ahead">
					<DroidImg name={active.name} size={22} />
					<span class="aname">{active.name}</span>
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run check`
Expected: `0 errors`.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/components/SearchPopover.svelte
git commit -m "feat: droid thumbnail in search popover header"
```

---

### Task 6: Old-view thumbnails (Inventory, Keepers, Droidex)

**Files:**
- Modify: `app/src/routes/inventory/+page.svelte`
- Modify: `app/src/routes/keepers/+page.svelte`
- Modify: `app/src/routes/droids/+page.svelte`

**Interfaces:**
- Consumes: `DroidImg` (Task 2). These are table rows already keyed by droid; each name cell gets a 20 px inline thumbnail before the name.

- [ ] **Step 1: Inventory — import + name cell**

In `app/src/routes/inventory/+page.svelte`, add `import DroidImg from '$lib/components/DroidImg.svelte';` to the script imports.

Find:

```svelte
			<tr><td>{droid}</td>
```

Replace with:

```svelte
			<tr><td><DroidImg name={droid} size={20} /> {droid}</td>
```

- [ ] **Step 2: Keepers — import + name cell**

In `app/src/routes/keepers/+page.svelte`, add `import DroidImg from '$lib/components/DroidImg.svelte';` to the script imports.

Find:

```svelte
				<td>{droid}{e.needs.length >= 4 ? ' ★' : ''}</td>
```

Replace with:

```svelte
				<td><DroidImg name={droid} size={20} /> {droid}{e.needs.length >= 4 ? ' ★' : ''}</td>
```

- [ ] **Step 3: Droidex — import + name cell**

In `app/src/routes/droids/+page.svelte`, add `import DroidImg from '$lib/components/DroidImg.svelte';` to the script imports.

Find:

```svelte
				<td>{d.name}</td><td>{d.rarity}</td><td>{d.type}</td>
```

Replace with:

```svelte
				<td><DroidImg name={d.name} size={20} /> {d.name}</td><td>{d.rarity}</td><td>{d.type}</td>
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npm run check`
Expected: `0 errors`.

- [ ] **Step 5: Commit**

```bash
git add app/src/routes/inventory/+page.svelte app/src/routes/keepers/+page.svelte app/src/routes/droids/+page.svelte
git commit -m "feat: droid thumbnails in inventory, keepers, droidex"
```

---

### Task 7: E2e coverage + README attribution

**Files:**
- Create: `app/e2e/droid-art.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the running app (checklist rows render `img.dimg`), `registerWithProfile` pattern from `e2e/checklist.spec.ts`.

- [ ] **Step 1: Write the e2e test**

Create `app/e2e/droid-art.spec.ts`:

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

test('checklist rows show a droid thumbnail with the derived local src', async ({ page }) => {
	await registerWithProfile(page, `art${Date.now()}`);
	const firstRow = page.locator('.row').first();
	const droid = (await firstRow.locator('.dname').textContent())!.trim();
	const norm = droid.toUpperCase().replace(/[^A-Z0-9]/g, '');
	const img = firstRow.locator('img.dimg').first();
	await expect(img).toHaveAttribute('src', new RegExp(`/assets/droids/${norm}_Default\\.webp$`));
});

test('a missing local image falls the src back to the droidtrakr host', async ({ page }) => {
	// abort every droid-art request (local and remote) — proves the onerror wiring
	// swaps the src to the remote host without depending on droidtrakr being reachable.
	await page.route('**/assets/droids/**', (r) => r.abort());
	await registerWithProfile(page, `artfb${Date.now()}`);
	const img = page.locator('.row').first().locator('img.dimg').first();
	await expect(img).toHaveAttribute(
		'src',
		/droidtrakr\.com\/droid-tycoon\/assets\/droids\/.*_Default\.webp$/
	);
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `cd app && npm run test:e2e`
Expected: all specs pass, including the two new `droid-art` tests.

- [ ] **Step 3: Add README attribution note**

In `README.md`, the Data section already credits droidtrakr.com. Append one sentence to that paragraph:

```markdown
Droid images are self-hosted copies of the droidtrakr.com art (fetched via `scripts/fetch-droid-art.mjs`); credit remains with droidtrakr.com.
```

- [ ] **Step 4: Commit**

```bash
git add app/e2e/droid-art.spec.ts README.md
git commit -m "test: e2e for droid thumbnails + fallback; README attribution"
```

---

## Final verification

- [ ] `cd app && npm run test:unit` → all pass (includes `art.test.ts`).
- [ ] `cd app && npm run test:int` → 40/40 (unchanged; no server changes).
- [ ] `cd app && npm run test:e2e` → all pass (includes new droid-art specs).
- [ ] `cd app && npm run check` → 0 errors, 0 warnings.
- [ ] `ls app/static/assets/droids | wc -l` → 340.
- [ ] Push `droid-art-thumbnails`; open a **draft PR stacked on PR #7** (base = `worktree-tracker-redesign-spec`). Do not merge; do not push to the PR #7 branch.
