<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { toast } from '$lib/client/toast.svelte';
	import { isMet, ownedIdx } from '$lib/game/inventory';
	import { TIERS, type Tier } from '$lib/game/tiers';
	const t = getTracker()!;
	const ref = page.data.reference!; // guaranteed present: this route is auth-gated by the root layout
	const cycle = $derived(t.active()?.cycle ?? 1);
	const reqs = $derived(
		ref.rebirthReqs.filter((r: { cycle: number }) => r.cycle === cycle)
	);
	const byRebirth = $derived.by(() => {
		const m = new Map<number, typeof reqs>();
		for (const r of reqs) (m.get(r.rebirth) ?? m.set(r.rebirth, []).get(r.rebirth)!).push(r);
		return [...m.entries()].sort((a, b) => a[0] - b[0]);
	});
	const meta = (rb: number) => ref.rebirthMeta.find((m: { rebirth: number }) => m.rebirth === rb);
	function toggle(droid: string, tier: Tier) {
		const met = isMet(t.countRows(), cycle, droid, tier);
		if (met) {
			const exact = t.countRows().some(
				(c) => c.cycle === cycle && c.droid === droid && c.tier === tier && c.n > 0
			);
			if (!exact) {
				toast('Met via a higher tier — adjust counts in Inventory');
				return;
			}
		}
		t.setCount(cycle, droid, tier, met ? 0 : 1);
	}
</script>

<h1>Rebirth Checklist</h1>
<label>Profile:
	<select onchange={(e) => t.selectProfile(Number(e.currentTarget.value))}>
		{#each t.state.profiles as p}
			<option value={p.id} selected={p.id === t.state.activeId}>{p.owner}/{p.name}</option>
		{/each}
	</select>
</label>
{#if !t.editable()}<p><em>Viewing {t.active()?.owner}'s profile — read-only.</em></p>{/if}

{#each byRebirth as [rb, rows]}
	{@const info = rows.find((r: { credits: string }) => r.credits) ?? rows[0]}
	<section>
		<h2>R{rb} <small>{info.credits} credits
			{#if meta(rb)}· {meta(rb)?.nova} nova · +{meta(rb)?.creditMult}% cr · +{meta(rb)?.xpMult}% xp{/if}
			{#if info.unlock}· unlocks {info.unlock}{/if}</small></h2>
		<ul>
			{#each rows as r}
				{@const tier = r.tier as Tier}
				{@const oi = ownedIdx(t.countRows(), cycle, r.droid)}
				{@const met = isMet(t.countRows(), cycle, r.droid, tier)}
				<li>
					<button disabled={!t.editable()} onclick={() => toggle(r.droid, tier)}>
						{met ? '☑' : '☐'}
					</button>
					<span class={oi >= 0 ? `tier-${TIERS[oi]}` : ''} title="requires {r.tier}{oi >= 0 ? ` · have ${TIERS[oi]}` : ''}">{r.droid}</span>
					<span class="tier-{r.tier}">[{r.tier}]</span>
				</li>
			{/each}
		</ul>
	</section>
{/each}
