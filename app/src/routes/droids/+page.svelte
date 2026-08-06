<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { TIERS, type Tier } from '$lib/game/tiers';
	import { ownedIdx } from '$lib/game/inventory';
	import DroidImg from '$lib/components/DroidImg.svelte';
	import { flawlessProgress, isFlawlessEligible } from '$lib/game/flawless';
	const t = getTracker()!;
	const ref = page.data.reference!; // guaranteed present: this route is auth-gated by the root layout
	const cycle = $derived(t.active()?.cycle ?? 1);
	const flawless = $derived(flawlessProgress(t.flawlessList(), ref.droids));
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
<p class="metrics">
	Flawless <strong data-testid="flawless-metric">{flawless.owned}/{flawless.total}</strong>
	<span class="hint">— an ownership axis, excluded from the droid tier total</span>
</p>
<input placeholder="search" bind:value={q} />
<table>
	<thead><tr><th>Droid</th><th>Rarity</th><th>Type</th><th>Own</th><th>Flawless</th>
		{#each TIERS as tier}<th class="tier-{tier}">{tier} buy / inc</th>{/each}</tr></thead>
	<tbody>
		{#each list as d}
			{@const oi = ownedIdx(t.countRows(), cycle, d.name)}
			<tr>
				<td><DroidImg name={d.name} size={20} /> {d.name}</td><td>{d.rarity}</td><td>{d.type}</td>
				<td>{oi >= 0 ? TIERS[oi] : '—'}</td>
				<td>
					{#if isFlawlessEligible(d)}
						<button class="flawless" class:owned={t.flawlessOwned(d.name)} disabled={!t.editable()}
							aria-pressed={t.flawlessOwned(d.name)} aria-label="{d.name} flawless" title="{d.name} flawless"
							onclick={() => t.setFlawlessOwned(d.name, !t.flawlessOwned(d.name))}>✦</button>
					{:else}
						<span class="na" title="Iconic droids have no flawless variant">—</span>
					{/if}
				</td>
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
{#if buffs.length}
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
{:else}
	<p class="hint">Companion buffs are not available for this data version</p>
{/if}

<h2>Iconic companion effects</h2>
{#if iconicEffects.length}
	<table>
		<thead><tr><th>Droid</th><th>Effect</th></tr></thead>
		<tbody>
			{#each iconicEffects as e}
				<tr><td><DroidImg name={e.droid} size={20} /> {e.droid}</td><td>{e.effect}</td></tr>
			{/each}
		</tbody>
	</table>
{:else}
	<p class="hint">Iconic companion effects are not available for this data version</p>
{/if}

<style>
	.metrics { margin: 0 0 0.5rem; }
	.hint { opacity: 0.6; font-size: 0.85em; }
	.flawless {
		border: 1px solid var(--accent, #7fd7ff);
		background: transparent;
		color: var(--accent, #7fd7ff);
		border-radius: 999px;
		width: 1.75rem;
		line-height: 1.5rem;
		cursor: pointer;
	}
	.flawless.owned { background: var(--accent, #7fd7ff); color: var(--panel-deep, #0a1322); }
	.flawless:disabled { opacity: 0.4; cursor: default; }
	.na { opacity: 0.35; }
</style>
