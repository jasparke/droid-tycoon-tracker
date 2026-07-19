# Standalone Planner — per-cycle progress, cycle buttons, super-rebirth + undo — design

- **Status:** approved (design), ready for implementation planning
- **Created:** 2026-07-18
- **Author:** Jason + Claude Code (brainstormed)
- **Target artifact:** the standalone `planner.html` (single-file app: inline HTML/CSS/JS, ~1,244 lines). Canonical copy lives at `standalone/planner.html` on the PR #12 branch (`worktree-standalone-planner-deploy`). This work branches off that branch (`feat/planner-per-cycle-inventory`).
- **NOT in scope:** the SvelteKit app's `/planner` route (a separate 42-line stub / separate sub-project).

## 0. Problem & findings

Jason wants to prep multiple rebirth cycles in parallel — e.g. sit at R25/27 on cycle 4 while separately prepping cycle 1 — with each cycle keeping its own state, and to switch cycles quickly.

Investigation of the current `planner.html` found:

- **Droid inventory is already per-cycle.** The counts key is literally `cycle|DROID|Tier` (`cKey=(cy,d,t)=>cy+'|'+String(d).toUpperCase()+'|'+t`, line 488). Every read (`countAt`/`ownedIdx`/`totalOf`/`isMet`) and write (`setCount`/`addAt`/`subAt`/`toggleTier`) threads a cycle argument that resolves to `state.cycle`. Switching cycles already shows a separate inventory.
- **Rebirth progress is NOT per-cycle.** `state.current` (the "R25/27" marker) is a single shared scalar (`blankProfile`, line 468: `current:9`). It drives which rebirths render as "past" and which droids are "still needed" (reads at lines 548, 560, 693, 701, 836, 1027–1045, 1060, 1094–1096, 1109, 1118). With one shared value, switching to another cycle keeps the old cycle's progress framing, so the (correct, separate) per-cycle inventory looks meaningless. **This shared scalar is the root cause of "inventory feels shared."**
- **A cycle-scoped "Reset owned" already exists** — `#planClear` (markup line 806: label "Reset owned", title "Wipe all owned marks for this cycle"; handler lines 874–876: confirm → delete counts whose key starts with `state.cycle+'|'` → save → re-render). It's buried in the planner toolbar.
- **Persistence:** whole DB (`{active, seq, profiles}`) is stored in `localStorage["droidTycoonTracker_v3"]` and mirrored base64 into the URL hash (`encodeDB`/`saveLocal`, lines 466, 497–500), and round-tripped to Supabase (`pushSync`/`adoptRemote`). `normProfile` (lines 469–478) already performs format migrations on load. The **counts key format is unchanged by this design**, so existing saves, shared URLs, and cloud rows remain compatible.

## 1. Decisions locked (brainstorm outcome)

| Decision | Choice |
|-|-|
| Cycle selector | Replace the `<select id="cycleSel">` dropdown with a row of **plain buttons** `Cycle 1 / 2 / 3 / 4` (drop the `(OG)/(SRB1…)` suffixes; no progress readout on buttons) |
| Rebirth progress | Make it **per-cycle** (`state.currentByCycle[cycle]`); untouched cycles start at **R0** (full ladder) |
| Super Rebirth button | New action: **full-reset the cycle you're leaving** (owned droids + progress→R0 + plan ticks) then **advance to the next cycle, looping 4→1** |
| Undo button | **Single-level** snapshot undo of the destructive actions only (Super Rebirth, Reset owned); in-memory, scoped to the active profile |
| Reset owned | Keep the existing cycle-scoped logic; **relocate it to the controls cluster** near the cycle buttons; wire it into the Undo snapshot |
| Super Rebirth confirm | **No modal confirm** — Undo is the safety net (flag for veto at spec review) |

## 2. Data model

### 2.1 Per-cycle progress

Replace the scalar `state.current` with a per-cycle map, mirroring the existing per-cycle fields `state.plan[cycle]` and `state.planAdd[cycle]`:

```
state.currentByCycle: { [cycle:number|string]: number }   // rebirth level 0..MAXRB per cycle
```

- **Accessor** `getCurrent()` → `state.currentByCycle[state.cycle] ?? 0` (fresh/untouched cycle = R0).
- **Setter** `setCurrent(n)` → `state.currentByCycle[state.cycle] = clamp(n, 0, MAXRB)`.
- All ~14 direct reads of `state.current` and the writes (curSel `change` line 1160, `rebirthBtn` line 1161, `doRebirth` line 548) route through `getCurrent()`/`setCurrent()`.
- `blankProfile` drops `current:9` and initializes `currentByCycle:{}` (all cycles default to R0 via the accessor).

### 2.2 Migration (backward compatible, no LS_KEY bump)

`normProfile(p)` gains one branch that runs idempotently on every load (localStorage, URL hash, and Supabase profiles all pass through it):

```js
// per-cycle progress: migrate the old shared scalar into the active cycle's slot
if (p.current != null) {
  if (!p.currentByCycle) p.currentByCycle = {};
  if (p.currentByCycle[p.cycle] == null) p.currentByCycle[p.cycle] = p.current;
  delete p.current;
}
if (!p.currentByCycle) p.currentByCycle = {};
```

The previously-active cycle keeps its exact progress; every other cycle starts at R0. Because the counts key format is untouched, no `LS_KEY` bump is needed and old shared URLs still load.

### 2.3 Reset scopes (owned-only vs full-cycle)

- **Reset owned** (existing behavior, unchanged in scope): delete `counts` keys prefixed `cy+'|'` for the current cycle only.
- **Full reset of a cycle** `cy` (new, used by Super Rebirth): delete `counts` prefixed `cy+'|'`; `delete state.currentByCycle[cy]` (→ R0); `state.plan[cy] = []`; `state.planAdd[cy] = []`. (Leaves `gapsOpen`, a transient UI-expansion map, untouched.)

## 3. Components (all in `planner.html`)

### 3.1 Cycle buttons (replaces the dropdown)

- **Markup:** replace `<label>Cycle: <select id="cycleSel"></select></label>` (line 284) with a container, e.g. `<span id="cycleBtns" class="cyclebtns"></span>`.
- **Render** (in `renderControls`): one `<button>` per key of `CYCLES`, label `Cycle ${cy}`, `class="active"` when `cy == state.cycle`. Rebuild-or-sync like the current dropdown does.
- **Click:** `state.cycle = cy; save(); renderAll();` (same effect as the old `change` handler at line 1159).
- `CYCLE_LABEL` is simplified to plain `Cycle N` everywhere it appears in prose (intro line 1109, panel headers lines 742/749) for consistency with the buttons.

### 3.2 Super Rebirth button

- **Markup:** new button `#superRebirthBtn` (e.g. label `Super Rebirth ⏭`) in the controls cluster, visually distinct from the existing per-rebirth `Rebirth ▶` (`#rebirthBtn`).
- **Handler:**
  1. Snapshot state for undo (§3.4).
  2. Full-reset the current cycle (§2.3) — the cycle being left.
  3. Advance with wrap: `state.cycle = (state.cycle % cycleCount) + 1` where `cycleCount = Object.keys(CYCLES).length` (4) → loops 4→1.
  4. `save(); renderAll();`
- **No modal confirm** (Undo is the catch).

### 3.3 Reset owned (relocated)

- Move the existing "Reset owned" control (single instance) into the controls cluster next to the cycle buttons; keep its handler logic (confirm dialog + cycle-scoped counts wipe) but add an Undo snapshot (§3.4) before the wipe.

### 3.4 Undo button

- **State:** a module-level `undo = null`. Before any destructive action (Super Rebirth, Reset owned), set `undo = { profileId: DB.active, snapshot: JSON.parse(JSON.stringify(state)) }` (state is already JSON-serializable — it is persisted via `JSON.stringify`).
- **Markup:** new button `#undoBtn` (e.g. `Undo ↶`) in the controls cluster; disabled when `undo == null` or `undo.profileId !== DB.active`.
- **Handler:** if a valid snapshot exists, restore it (`DB.profiles[DB.active] = undo.snapshot; state = DB.profiles[DB.active];`), then `undo = null; save(); renderAll();`.
- **Scope:** single-level (no redo), in-memory (not persisted across reloads), cleared on profile switch. Reassigning the `state` binding is safe because handlers read through the live `state` variable and re-render after undo.

### 3.5 Controls layout

Target arrangement in the `.controls` cluster (lines 277–288):

```
👤 [profile group …]
[Cycle 1][Cycle 2][Cycle 3][Cycle 4]   [Super Rebirth ⏭]  [Undo ↶]  [Reset owned]
Rebirth: <select #curSel>   [Rebirth ▶]
```

The `Rebirth:` selector (`#curSel`) and per-rebirth `Rebirth ▶` (`#rebirthBtn`) are unchanged in behavior; they now read/write the active cycle's progress via the accessor/setter.

## 4. Testing / verification

`planner.html` is a single-file app with no test runner; verification is manual in a browser (serve via the bundle's `assemble.sh` + `Caddyfile`, or open the file over http). The implementation plan will carry an explicit manual checklist covering:

1. **Migration / backward-compat:** load a pre-change save (localStorage and a shared URL hash) → `current` migrates into `currentByCycle` for the previously-active cycle; no inventory loss; old shared URLs still open.
2. **Per-cycle progress:** set R25 on cycle 4, switch to cycle 1 → cycle 1 shows R0 and its full ladder; switch back → cycle 4 still R25. Inventory differs per cycle.
3. **Cycle buttons:** all 4 buttons switch the active cycle; active state highlights correctly; prose labels read `Cycle N`.
4. **Super Rebirth:** from cycle 4, click Super Rebirth → cycle 4 fully reset (owned/progress/plan cleared), active cycle is now 1 with its previously-prepped state intact; from cycle 4 it wraps to 1.
5. **Undo:** after a Super Rebirth, Undo restores cycle 4's owned/progress/plan and returns the active cycle to 4; after Reset owned, Undo restores the wiped counts; Undo is disabled when nothing is undoable and after switching profiles.
6. **Persistence:** all of the above survive a reload (localStorage) and a fresh URL-hash load; cloud sync round-trips `currentByCycle`.

## 5. Risks

- **`state` reassignment on Undo** must not strand closures — mitigated by keeping `state` a reassignable module binding and always re-rendering after undo.
- **Destructive Super Rebirth without a confirm** relies entirely on the single-level Undo; an accidental second destructive action before Undo loses the first snapshot. Acceptable per the brainstorm (flagged for veto). Reset owned retains its confirm.
- **Migration idempotency:** `normProfile` deletes `p.current` after migrating, so repeated loads are safe; new profiles never have `p.current`.
- **Cloud/URL size:** `currentByCycle` adds at most 4 small entries per profile — negligible for the base64 hash and Supabase row.

## 6. Out of scope

Porting the planner UI into the SvelteKit app (separate sub-project); changing the `#curSel` rebirth selector; multi-level undo/redo; altering the underlying `CYCLES`/requirement data; any change to the counts key format.
