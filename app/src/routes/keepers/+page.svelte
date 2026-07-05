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
	type Entry = { nextRb: number; needs: { rebirth: number; tier: Tier; met: boolean }[] };
	const future = $derived.by(() => {
		const m = new Map<string, Entry>();
		for (const r of ref.rebirthReqs.filter(
			(r: { cycle: number; rebirth: number }) => r.cycle === cycle && r.rebirth > current
		)) {
			const met = isMet(t.countRows(), cycle, r.droid, r.tier);
			const e: Entry = m.get(r.droid) ?? { nextRb: r.rebirth, needs: [] };
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
