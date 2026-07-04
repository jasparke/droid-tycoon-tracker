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
