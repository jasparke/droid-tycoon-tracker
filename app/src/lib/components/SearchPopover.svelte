<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { search } from '$lib/client/search.svelte';
	import { earliestReq } from '$lib/game/requirements';
	import { pad2 } from '$lib/client/format';
	import TierLadder from '$lib/components/TierLadder.svelte';
	import DroidImg from '$lib/components/DroidImg.svelte';

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
					<DroidImg name={active.name} size={22} />
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
