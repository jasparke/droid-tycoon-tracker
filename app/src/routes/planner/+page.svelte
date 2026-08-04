<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { combinedNeeds, type Requirement } from '$lib/game/planner';
	import { isMet } from '$lib/game/inventory';
	import { craftSeconds, formatHms, planCraftTotal, type CraftTimeRow } from '$lib/game/crafting';
	import type { Tier } from '$lib/game/tiers';
	import DroidImg from '$lib/components/DroidImg.svelte';
	const t = getTracker()!;
	const ref = page.data.reference!; // guaranteed present: this route is auth-gated by the root layout
	const cycle = $derived(t.active()?.cycle ?? 1);
	const reqs = $derived(
		ref.rebirthReqs
			.filter((r) => r.cycle === cycle)
			.map((r) => ({
				rebirth: r.rebirth, droid: r.droid, tier: r.tier as Tier
			})) as Requirement[]
	);
	const selected = $derived(new Set(t.planFor(cycle)));
	const needs = $derived(combinedNeeds(reqs, selected));
	const rebirths = $derived([...new Set(reqs.map((r) => r.rebirth))].sort((a, b) => a - b));
	const craftTimes = $derived((ref.craftingTimes ?? []) as CraftTimeRow[]);
	const craftTotal = $derived(
		planCraftTotal(craftTimes, needs, (droid, tier) => isMet(t.countRows(), cycle, droid, tier))
	);
	function toggleRb(rb: number) {
		const next = new Set(selected);
		next.has(rb) ? next.delete(rb) : next.add(rb);
		t.replacePlan(cycle, [...next]);
	}
</script>

<h1>Planner</h1>
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
<h2>Rebirths</h2>
{#each rebirths as rb}
	<label style="display:block">
		<input type="checkbox" disabled={!t.editable()} checked={selected.has(rb)} onchange={() => toggleRb(rb)} />
		R{rb}: {reqs.filter((r) => r.rebirth === rb).map((r) => `${r.droid} ${r.tier[0]}`).join(', ')}
	</label>
{/each}

<style>
	.craft-total { margin: 0 0 0.5rem; }
	.craft { font-variant-numeric: tabular-nums; opacity: 0.85; }
	.hint { opacity: 0.6; font-size: 0.85em; }
</style>
