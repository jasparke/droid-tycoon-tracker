<script lang="ts">
	import { page } from '$app/state';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { roiTable, type TierStat } from '$lib/game/roi';
	import { TIERS, RIDX, type Tier } from '$lib/game/tiers';
	import { ownedIdx } from '$lib/game/inventory';
	const t = makeTracker(page.data as never);
	const ref = page.data.reference!; // guaranteed present: this route is auth-gated by the root layout
	const cycle = $derived(t.active()?.cycle ?? 1);
	let rarity = $state('all'), type = $state('all'), tier = $state('all');
	type DroidMeta = { name: string; rarity: string; type: string };
	const meta = new Map<string, DroidMeta>(ref.droids.map((d): [string, DroidMeta] => [d.name, d]));
	const stats: TierStat[] = ref.droidTiers.map((s) => ({
		droid: s.droid, tier: s.tier as Tier, buy: s.buy, income: s.income,
		rarity: meta.get(s.droid)?.rarity ?? '?', type: meta.get(s.droid)?.type ?? '?'
	}));
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
