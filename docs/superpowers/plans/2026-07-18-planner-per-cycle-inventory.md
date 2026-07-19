# Standalone Planner — per-cycle progress, cycle buttons, super-rebirth + undo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each rebirth cycle its own progress marker (not just its own inventory), replace the cycle dropdown with buttons, and add a Super Rebirth action (full-reset the cycle you leave, wrap 4→1) with a single-level Undo.

**Architecture:** All edits are in the single file `standalone/planner.html` (inline HTML/CSS/JS). The shared scalar `state.current` becomes a per-cycle map `state.currentByCycle`, reached through one accessor/setter pair, migrated on load. The cycle `<select>` becomes a button row. Two new controls — Super Rebirth and Undo — plus the existing Reset-owned relocate into the controls cluster. The `counts` key format (`cycle|DROID|Tier`) is untouched, so existing localStorage saves, shared URL hashes, and Supabase rows stay compatible.

**Tech Stack:** Vanilla HTML/CSS/JS, no build, no framework. State persisted in `localStorage["droidTycoonTracker_v3"]` + base64 URL hash + optional Supabase sync. **No test runner exists** (and none should be added — YAGNI for a single-file app), so each task ends with a concrete **manual browser verification** instead of an automated test.

## Global Constraints

- **Single file only:** `standalone/planner.html`. Do not add build tooling, dependencies, or split the file.
- **No save-format break:** never change the `counts` key format (`cKey=(cy,d,t)=>cy+'|'+String(d).toUpperCase()+'|'+t`). Migration is additive and idempotent; `LS_KEY` stays `"droidTycoonTracker_v3"`.
- **Source of truth:** the design spec `docs/superpowers/specs/2026-07-18-planner-per-cycle-inventory-design.md`. Locked decisions: plain `Cycle 1–4` buttons; untouched cycles start at R0; Super Rebirth full-resets the leaving cycle (owned + progress→R0 + plan) and wraps 4→1; single-level in-memory Undo of destructive actions only; Super Rebirth has **no confirm** (Undo is the catch); Reset owned keeps its confirm.
- **Manual verification tool:** serve the file over http (localStorage needs http, not `file://`). From `standalone/`: `./assemble.sh` then serve `dist/` (or any static server rooted so `planner.html` loads with its assets). Open in a browser; use DevTools console + Application→Local Storage to inspect state.
- **Verify no stragglers:** after the accessor sweep, `grep -n "state\.current" standalone/planner.html` must show **no matches** (the line ~543 legacy detector reads `obj.current`, a different token; see Task 1).
- **Rollout note (from review):** while any device still runs the OLD app against the same cloud sync code, its `normProfile` re-adds `current:9` and pushes; the new app's migration then seeds the active cycle to R9 only if that slot is empty. Transient — resolves once all devices update; harmless for single-device use.

---

## Task 1: Per-cycle progress data model + migration

**Files:** Modify `standalone/planner.html`.

**Interfaces:**
- Produces: `getProgress()` → current cycle's rebirth level (0..MAXRB, default 0); `setProgress(n)` → clamps and stores into `state.currentByCycle[state.cycle]`; `state.currentByCycle` map on every profile.
- Consumes: existing `state`, `state.cycle`, `CYCLES`, `MAXRB`, `normProfile`, `blankProfile`.

- [ ] **Step 1: Add the accessor + setter**

Immediately after the counts helpers (after `function subAt(...)`, currently line 496), add:

```js
// per-cycle rebirth progress (level 0..MAXRB). Untouched cycles default to R0 (full ladder).
function getProgress(){ return state.currentByCycle[state.cycle] ?? 0; }
function setProgress(n){ state.currentByCycle[state.cycle] = Math.max(0, Math.min(MAXRB, n|0)); }
```

- [ ] **Step 2: Initialize `currentByCycle` in `blankProfile` and drop the old scalar default**

In `blankProfile` (line 468), remove `current:9,` and add `currentByCycle:{},`. New line:

```js
function blankProfile(name){return {name:name||"Player",currentByCycle:{},cycle:1,view:"rebirths",hidePast:true,_hideDefault:true,counts:{},plan:{},gapsOpen:{}};}
```

- [ ] **Step 3: Add the migration branch to `normProfile`**

In `normProfile` (lines 469–478), change the defaults line 471. It currently is:

```js
if(p.current==null)p.current=9; if(p.cycle==null)p.cycle=1; if(!p.view)p.view="rebirths"; if(!p.name)p.name="Player";
```

Replace with (drop the `p.current` default; add the per-cycle migration):

```js
if(p.cycle==null)p.cycle=1; if(!p.view)p.view="rebirths"; if(!p.name)p.name="Player";
// migrate the old shared scalar progress into the active cycle's slot (idempotent)
if(!p.currentByCycle)p.currentByCycle={};
if(p.current!=null){ if(p.currentByCycle[p.cycle]==null)p.currentByCycle[p.cycle]=p.current; delete p.current; }
```

Leave the legacy `checked`/`owned`/`qty` migrations (lines 472–475) and everything else in `normProfile` unchanged.

- [ ] **Step 4: Route every `state.current` read/write through the accessor**

Do a global find for `state.current` in the file and replace:
- every **read** of `state.current` → `getProgress()`
- every **write** (`state.current = X`, `state.current++`) → `setProgress(...)` (e.g. `state.current++` → `setProgress(getProgress()+1)`)

Known sites (not exhaustive — some share a line with `//…current` comments, so use a global find, not this list alone):
- `doRebirth` (548): `if(state.current<MAXRB){state.current++;save();renderAll();}` → `if(getProgress()<MAXRB){setProgress(getProgress()+1);save();renderAll();}`
- needs/threshold reads (560, 693, 701): `>state.current` → `>getProgress()`
- (836): `const curR=state.current||0;` → `const curR=getProgress();`
- `renderControls` (1029): `if(sel)sel.value=state.current;` → `if(sel)sel.value=getProgress();`
- `renderStats` (1032,1036,1040,1043,1044,1045): every `state.current` → `getProgress()`
- `renderRebirths`/`flushRun` (1085): `gF>state.current` → `gF>getProgress()` — **live in the default rebirths view; easy to miss because the line has an inline `//…current` comment**
- `rbCardEl` (1060) + planner rows (1094,1096,1109,1118): every `state.current` → `getProgress()`
- `#curSel` change (1160): `state.current=+e.target.value;` → `setProgress(+e.target.value);`
- `#rebirthBtn` click (1161): `if(state.current<MAXRB){state.current++;...}` → `if(getProgress()<MAXRB){setProgress(getProgress()+1);...}`

**Do NOT change** line 543 `else if(obj&&(obj.owned||obj.current!=null)) profs=[obj];` — that intentionally detects an *old* flat-state format on import and must keep reading `obj.current`.

- [ ] **Step 5: Verify no stray `state.current` reads remain**

Run: `grep -n "state\.current" standalone/planner.html`
Expected: **no matches** — every site is now `getProgress()`/`setProgress()`. (Line ~543's legacy-import detector reads `obj.current`, which this pattern does NOT match and which must stay unchanged.) Any match here is a missed site — most likely line 1085 — so fix it and re-run.

- [ ] **Step 6: Manual verification in the browser**

Serve and open the planner. Then:
1. **Migration/back-compat:** with an existing pre-change save present (or paste an old shared `#…` URL), reload → the previously-active cycle shows the same rebirth level it had; no inventory lost. In DevTools console: `JSON.parse(localStorage.droidTycoonTracker_v3).profiles` shows `currentByCycle` and no `current` field.
2. **Per-cycle progress:** on the active cycle set the Rebirth dropdown to R25. Switch cycle (via the still-present dropdown) to a different cycle → its rebirth marker reads R0 and the full ladder shows. Switch back → R25 preserved. Inventory differs per cycle as before.
3. The `Rebirth ▶` button and the `Rebirth:` dropdown advance only the active cycle's level. (The standalone has no `#stats` "big rebirth card" — `renderStats()` is effectively dead here — so there is nothing to check there.)

- [ ] **Step 7: Commit**

```bash
cd /Users/jason/Projects/DroidTycoon/droid-tycoon-tracker/.claude/worktrees/planner-per-cycle
git add standalone/planner.html
git commit -m "feat(planner): per-cycle rebirth progress (currentByCycle) + migration"
```

---

## Task 2: Cycle dropdown → buttons

**Files:** Modify `standalone/planner.html`.

**Interfaces:**
- Consumes: `CYCLES`, `CYCLE_LABEL`, `state.cycle`, `renderAll`, `renderControls`.
- Produces: `#cycleBtns` button row; simplified `CYCLE_LABEL`.

- [ ] **Step 1: Simplify `CYCLE_LABEL` to plain names**

Line 461 currently:

```js
const CYCLE_LABEL={1:"Cycle 1 (OG)",2:"Cycle 2 (SRB1)",3:"Cycle 3 (SRB2)",4:"Cycle 4 (SRB3)"};
```
Replace with:
```js
const CYCLE_LABEL={1:"Cycle 1",2:"Cycle 2",3:"Cycle 3",4:"Cycle 4"};
```

- [ ] **Step 2: Replace the dropdown markup with a button container**

Line 284 currently:

```html
      <label>Cycle: <select id="cycleSel"></select></label>
```
Replace with:
```html
      <span id="cycleBtns" class="cyclebtns" role="group" aria-label="Cycle"></span>
```

- [ ] **Step 3: Render the buttons in `renderControls`**

Replace the cycleSel-populating lines 1024–1026:

```js
  const cs=document.getElementById('cycleSel');
  if(!cs.options.length)Object.keys(CYCLES).forEach(cy=>{const o=document.createElement('option');o.value=cy;o.textContent=CYCLE_LABEL[cy];cs.appendChild(o);});
  cs.value=state.cycle;
```
with:
```js
  const cb=document.getElementById('cycleBtns');
  cb.innerHTML=Object.keys(CYCLES).map(cy=>`<button type="button" class="cybtn${(+cy===+state.cycle)?' active':''}" data-cycle="${cy}">${CYCLE_LABEL[cy]}</button>`).join("");
```

- [ ] **Step 4: Replace the change handler with click delegation**

Line 1159 currently:

```js
document.getElementById('cycleSel').addEventListener('change',e=>{state.cycle=+e.target.value;save();renderAll();});
```
Replace with:
```js
document.getElementById('cycleBtns').addEventListener('click',e=>{const b=e.target.closest('[data-cycle]');if(!b)return;state.cycle=+b.dataset.cycle;save();renderAll();});
```

- [ ] **Step 5: Add button CSS**

In the `<style>` block (near the existing `.minibtn`/`.rb.current` rules), add:

```css
.cyclebtns{display:inline-flex;gap:4px;flex-wrap:wrap}
.cyclebtns .cybtn{padding:4px 10px;border:1px solid var(--muted);border-radius:6px;background:transparent;color:inherit;cursor:pointer;font:inherit;line-height:1.2}
.cyclebtns .cybtn:hover{border-color:var(--accent)}
.cyclebtns .cybtn.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset;color:var(--accent)}
```

Adjust the border/hover colors to sit naturally beside the existing `.minibtn` controls (match whatever variables that rule uses).

- [ ] **Step 6: Manual verification**

Serve/reload. Confirm: four buttons `Cycle 1`–`Cycle 4` render where the dropdown was; the active cycle is highlighted; clicking a button switches cycle and updates the whole view (progress + inventory) exactly like the old dropdown did; intro/panel prose now reads `Cycle N` (no `(OG)/(SRB#)`).

- [ ] **Step 7: Commit**

```bash
git add standalone/planner.html
git commit -m "feat(planner): cycle selector as buttons; plain Cycle N labels"
```

---

## Task 3: Undo mechanism + button; relocate Reset owned

**Files:** Modify `standalone/planner.html`.

**Interfaces:**
- Produces: module var `undo`; `snapshot()`; `doUndo()`; `#undoBtn`; `#resetOwnedBtn` in the controls cluster (single instance).
- Consumes: `DB`, `state`, `save`, `renderAll`, `renderControls`, `CYCLE_LABEL`, `state.counts`, `state.cycle`.

- [ ] **Step 1: Add the undo state + helpers**

After `let state=DB.profiles[DB.active];` (line 486), add:

```js
// single-level, in-memory undo for destructive actions (Super Rebirth, Reset owned)
let undo=null;
function snapshot(){ undo={profileId:DB.active, snap:JSON.parse(JSON.stringify(state))}; }
function undoAvailable(){ return !!undo && undo.profileId===DB.active; }
function doUndo(){ if(!undoAvailable())return; DB.profiles[DB.active]=undo.snap; state=DB.profiles[DB.active]; undo=null; save(); renderAll(); }
```

Also clear the snapshot when the active profile changes, per spec §3.4: in `switchProfile`, `addProfile`, and `deleteProfile` (lines ~531/532/534) add `undo=null;` at the top. (The `undoAvailable()` guard already disables the button while another profile is active, but nulling prevents a stale snapshot from reverting later edits after switching back to the original profile.)

- [ ] **Step 2: Relocate the Reset-owned button into the controls cluster**

Remove the button from the planner toolbar template — line 806 currently:

```html
    <button id="planClear" class="minibtn danger spring" title="Wipe all owned marks for this cycle">Reset owned</button>
```
Delete that line from the template string.

Remove its toolbar-time handler — lines 874–876 currently:

```js
  const cl=document.getElementById('planClear'); if(cl) cl.onclick=(ev)=>{ev.preventDefault();
    if(confirm('Clear all owned marks for '+CYCLE_LABEL[state.cycle]+'? This can\'t be undone.')){
      Object.keys(state.counts).forEach(k=>{if(k.startsWith(state.cycle+'|'))delete state.counts[k];}); save(); renderPlanner(); }};
```
Delete those three lines.

- [ ] **Step 3: Add the new controls-cluster buttons markup**

In the `.controls` cluster, right after the `#cycleBtns` span (added in Task 2), add:

```html
      <button id="superRebirthBtn" class="minibtn" title="Super rebirth: reset this cycle and advance to the next">Super Rebirth ⏭</button>
      <button id="undoBtn" class="minibtn" title="Undo the last reset / super rebirth" disabled>Undo ↶</button>
      <button id="resetOwnedBtn" class="minibtn danger" title="Wipe all owned marks for this cycle">Reset owned</button>
```

(The `#superRebirthBtn` handler is wired in Task 4; adding the markup now keeps the cluster layout stable.)

- [ ] **Step 4: Wire Undo + Reset-owned once, and sync the Undo disabled state**

In the controls handler block (after line 1161), add:

```js
document.getElementById('undoBtn').addEventListener('click',doUndo);
document.getElementById('resetOwnedBtn').addEventListener('click',()=>{
  if(!confirm('Clear all owned marks for '+CYCLE_LABEL[state.cycle]+'?')) return;
  snapshot();
  Object.keys(state.counts).forEach(k=>{ if(k.startsWith(state.cycle+'|')) delete state.counts[k]; });
  save(); renderAll();
});
```

In `renderControls` (before its closing `}`, after line 1029), add the disabled-state sync:

```js
  const ub=document.getElementById('undoBtn'); if(ub) ub.disabled=!undoAvailable();
```

- [ ] **Step 5: Manual verification**

Serve/reload. Confirm:
1. "Reset owned" now sits next to the cycle buttons (and is gone from the planner toolbar).
2. Add some owned droids on the current cycle, click **Reset owned**, confirm the prompt → they clear; the **Undo** button becomes enabled; click **Undo** → the owned marks come back and Undo disables again.
3. Switch to another profile (＋ new or the profile dropdown) → Undo is disabled (snapshot doesn't cross profiles).

- [ ] **Step 6: Commit**

```bash
git add standalone/planner.html
git commit -m "feat(planner): single-level undo; relocate Reset owned into controls"
```

---

## Task 4: Super Rebirth (full-reset leaving cycle, wrap 4→1)

**Files:** Modify `standalone/planner.html`.

**Interfaces:**
- Consumes: `snapshot` (Task 3), `state.counts`, `state.currentByCycle`, `state.plan`, `state.planAdd`, `state.cycle`, `CYCLES`, `save`, `renderAll`.
- Produces: `fullResetCycle(cy)`; `#superRebirthBtn` behavior.

- [ ] **Step 1: Add the full-cycle-reset helper**

Near the other state helpers (e.g. after `setProgress` from Task 1), add:

```js
// full reset of one cycle: owned droids + progress (->R0) + plan ticks
function fullResetCycle(cy){
  Object.keys(state.counts).forEach(k=>{ if(k.startsWith(cy+'|')) delete state.counts[k]; });
  delete state.currentByCycle[cy];
  if(state.plan) delete state.plan[cy];
  if(state.planAdd) delete state.planAdd[cy];
}
```

- [ ] **Step 2: Wire the Super Rebirth button (no confirm — Undo is the catch)**

In the controls handler block (near the Undo/Reset wiring from Task 3), add:

```js
document.getElementById('superRebirthBtn').addEventListener('click',()=>{
  snapshot();
  const leaving=state.cycle;
  fullResetCycle(leaving);
  const n=Object.keys(CYCLES).length;      // 4 requirement sets
  state.cycle=(leaving % n)+1;             // wrap 4 -> 1
  save(); renderAll();
});
```

- [ ] **Step 3: Manual verification**

Serve/reload. Confirm:
1. On Cycle 4 with owned droids + progress + some plan ticks, click **Super Rebirth** → active cycle becomes **Cycle 1**; go back to Cycle 4 and confirm it is fully cleared (no owned droids, R0, no plan ticks).
2. If you had prepped Cycle 1 beforehand (owned marks there), those are intact after landing on Cycle 1.
3. Immediately click **Undo** → Cycle 4's owned/progress/plan are restored and the active cycle returns to Cycle 4.
4. Wrap check: from each of Cycle 1/2/3, Super Rebirth advances to the next number; from Cycle 4 it wraps to Cycle 1.
5. Reload → the results persisted (localStorage + hash).

- [ ] **Step 4: Commit**

```bash
git add standalone/planner.html
git commit -m "feat(planner): Super Rebirth — full-reset leaving cycle, wrap 4->1"
```

---

## Task 5: Whole-file verification + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Full manual regression pass**

Serve/reload and run the complete spec §4 checklist end-to-end in one session: migration/back-compat, per-cycle progress, cycle buttons, Super Rebirth (+ wrap), Undo (both actions + profile scoping), persistence across reload and a fresh URL-hash load. Also confirm the pre-existing planner features still work (rebirth ladder, inventory + keepers + plan views, hover cards, long-press picker, cloud sync setup) — the accessor sweep touched shared render code.

**Pre-existing bug (do not attribute to this change):** the `data-qt` `−/+` handler (line 1170) calls `renderStats()`, but the standalone has no `#stats` element, so `renderStats()` throws — a `−/+` quantity tap saves the count but then errors before the view refreshes. This is broken on `main` today, independent of this change. Optional one-line drive-by (out of spec, Jason's call): delete the dead `renderStats();` call at line 1170.

- [ ] **Step 2: Sanity grep**

Run: `grep -n "state\.current\b\|cycleSel\|planClear" standalone/planner.html`
Expected: only the intentional legacy-import detector (`obj.current!=null`) remains; no `cycleSel` or `planClear` references linger.

- [ ] **Step 3: Push the branch and open a draft PR**

```bash
cd /Users/jason/Projects/DroidTycoon/droid-tycoon-tracker/.claude/worktrees/planner-per-cycle
git push -u origin feat/planner-per-cycle-inventory
gh pr create --draft --base main \
  --title "feat(planner): per-cycle progress, cycle buttons, super-rebirth + undo" \
  --body "Implements docs/superpowers/specs/2026-07-18-planner-per-cycle-inventory-design.md in standalone/planner.html: per-cycle rebirth progress (currentByCycle + migration, no save-format break), cycle selector as buttons, Super Rebirth (full-reset leaving cycle, wrap 4->1) and single-level Undo. Single-file app, no test runner — verified manually per the spec checklist. Branches off PR #12's standalone bundle; retarget as Jason prefers."
```

Do not merge — Jason merges. Note the branch is based on PR #12's `worktree-standalone-planner-deploy`; if #12 lands first, this can be retargeted/rebased onto `main`.

---

## Self-Review

**Spec coverage:** §1 cycle buttons → Task 2; per-cycle progress + R0 default → Task 1; Super Rebirth full-reset + wrap → Task 4; single-level Undo → Task 3; Reset-owned relocation + Undo wiring → Task 3; no-confirm Super Rebirth → Task 4 Step 2; `CYCLE_LABEL` simplification → Task 2 Step 1. §2 data model/migration → Task 1. §3 components → Tasks 2–4. §4 testing → each task's manual verification + Task 5. §5 risks (state reassignment on undo, migration idempotency) → handled in Task 3 Step 1 / Task 1 Step 3.

**Placeholder scan:** every edit shows the exact current code and its replacement; the one deliberately non-enumerated edit (the `state.current` sweep, Task 1 Step 4) is bounded by a global-find instruction + a verifying grep (Step 5) because some sites share a line with comments. No TBD/TODO.

**Review fixes applied (Fable, 2026-07-18):** added the missed live site line 1085 to the accessor sweep; corrected both verifying-grep expectations to "no matches" (the pattern never matches line 543's `obj.current`); trimmed verification of the non-existent `#stats` card and ROI/global-search views; added undo-clear on profile switch (spec §3.4); flagged the pre-existing `renderStats()`/`−/+` crash and the mixed-version cloud-sync R9 rollout note. Verified-clean by the review: all quoted snippets match char-for-char; `state` reassignment on Undo is safe (no stale module-level caches); `fullResetCycle` key coercions + wrap arithmetic + migration idempotency + export/import/Supabase round-trip all correct.

**Type/name consistency:** `getProgress`/`setProgress`, `snapshot`/`doUndo`/`undoAvailable`/`undo`, `fullResetCycle`, `#cycleBtns`/`.cybtn`, `#superRebirthBtn`/`#undoBtn`/`#resetOwnedBtn` are used identically across the tasks that define and consume them. `cur()` (cycle's rebirth data) is left untouched and is deliberately distinct from `getProgress()` (the level) to avoid the existing naming overlap.

**Scope:** one file, four focused edits + a verification pass — a single coherent implementation plan.
