<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { TIERS, type Tier } from '$lib/game/tiers';
	import { ownedIdx } from '$lib/game/inventory';
	import DroidImg from '$lib/components/DroidImg.svelte';
	const t = getTracker()!;
	const ref = page.data.reference!; // guaranteed present: this route is auth-gated by the root layout
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

	const RARITY_ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Iconic'];
	const BUFF_KINDS = [
		{ kind: 'Worker', title: 'Worker companions — crafting speed', unit: '%' },
		{ kind: 'Astromech', title: 'Astromech companions — pickaxe level', unit: '' },
		{ kind: 'Battle', title: 'Battle companions — max health', unit: '' }
	];
	const buffs = $derived(ref.companionBuffs ?? []);
	const buff = (kind: string, rarity: string, tier: Tier) =>
		buffs.find((b: { kind: string; rarity: string; tier: string }) => b.kind === kind && b.rarity === rarity && b.tier === tier)?.value ?? null;
	const buffRarities = $derived(
		RARITY_ORDER.filter((r) => buffs.some((b: { rarity: string }) => b.rarity === r))
	);
	const iconicEffects = $derived(ref.iconicCompanionEffects ?? []);
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
				<td><DroidImg name={d.name} size={20} /> {d.name}</td><td>{d.rarity}</td><td>{d.type}</td>
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

<h2>Companion buffs</h2>
{#each BUFF_KINDS as k}
	<h3>{k.title}</h3>
	<table>
		<thead><tr><th>Rarity</th>{#each TIERS as tier}<th class="tier-{tier}">{tier}</th>{/each}</tr></thead>
		<tbody>
			{#each buffRarities as rarity}
				<tr>
					<td>{rarity}</td>
					{#each TIERS as tier}
						{@const v = buff(k.kind, rarity, tier)}
						<td>{v === null ? 'N/A' : `${k.unit === '%' ? v + '%' : '+' + v}`}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/each}

<h2>Iconic companion effects</h2>
<table>
	<thead><tr><th>Droid</th><th>Effect</th></tr></thead>
	<tbody>
		{#each iconicEffects as e}
			<tr><td><DroidImg name={e.droid} size={20} /> {e.droid}</td><td>{e.effect}</td></tr>
		{/each}
	</tbody>
</table>
