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
	const owned = (droid: string, tier: Tier) =>
		t.countRows().find((c) => c.cycle === cycle && c.droid === droid && c.tier === tier)?.n ?? 0;
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
							onclick={() => t.setCount(cycle, d.name, tier, owned(d.name, tier) + 1)}>+</button>
						{s?.buy?.toLocaleString() ?? '—'} / {s?.income ?? '—'}/s
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
