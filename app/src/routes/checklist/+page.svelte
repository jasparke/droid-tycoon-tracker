<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { satisfyingIdx } from '$lib/game/inventory';
	import { RIDX, TIERS, type Tier } from '$lib/game/tiers';
	import { pad2 } from '$lib/client/format';
	import TierChip from '$lib/components/TierChip.svelte';
	import TierLadder from '$lib/components/TierLadder.svelte';
	import StatStrip from '$lib/components/StatStrip.svelte';

	const t = getTracker()!;
	const ref = page.data.reference!; // auth-gated route: reference is always present
	const cycle = $derived(t.cycle());
	const fromRb = $derived(t.rebirth());
	let open = $state<Record<string, boolean>>({});

	const droidMeta = $derived.by(() => {
		const m = new Map<string, string>();
		for (const d of ref.droids) m.set(d.name, `${d.rarity.toUpperCase()} · ${d.type.toUpperCase()}`);
		return m;
	});

	const blocks = $derived.by(() => {
		const by = new Map<number, typeof ref.rebirthReqs>();
		for (const r of ref.rebirthReqs)
			if (r.cycle === cycle && r.rebirth >= fromRb)
				(by.get(r.rebirth) ?? by.set(r.rebirth, []).get(r.rebirth)!).push(r);
		return [...by.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([rb, reqRows]) => {
				const rows = reqRows.map((r) => {
					const tier = r.tier as Tier;
					const sat = satisfyingIdx(t.countRows(), cycle, r.droid, tier);
					return {
						droid: r.droid,
						tier,
						sat,
						met: sat >= 0,
						counts: t.countsFor(cycle, r.droid),
						meta: droidMeta.get(r.droid) ?? '',
						chipTiers: TIERS.slice(RIDX[tier])
					};
				});
				return {
					rb,
					rows,
					met: rows.filter((r) => r.met).length,
					total: rows.length,
					credits: reqRows.find((r) => r.credits)?.credits ?? '',
					unlock: reqRows.find((r) => r.unlock)?.unlock ?? ''
				};
			});
	});

	const visBlocks = $derived(
		!t.hideDone()
			? blocks
			: blocks
					.map((b) => ({ ...b, rows: b.rows.filter((r) => !r.met) }))
					.filter((b) => b.rows.length > 0)
	);

	const curBlock = $derived(blocks.find((b) => b.rb === fromRb));
	const nova = $derived(ref.rebirthMeta.find((m) => m.rebirth === fromRb)?.nova ?? null);
	const stats = $derived([
		{ label: 'THIS REBIRTH COST', value: curBlock?.credits || '—', color: 'var(--warn)' },
		{ label: 'DROIDS MET', value: curBlock ? `${curBlock.met}/${curBlock.total}` : '—', color: 'var(--good)' },
		{ label: 'CYCLE PROGRESS', value: `${Math.round(((fromRb - 1) / 27) * 100)}%`, color: 'var(--txt)' },
		{ label: 'NOVA @ THIS RB', value: nova ? `${nova} ✦` : '—', color: 'var(--nova)' }
	]);
</script>

{#if !t.active()}
	<div class="empty">NO PROFILE YET — create one, then reload.</div>
{:else}
	<StatStrip cells={stats} />
	<div class="hintbar">TAP CHIP = +1 · RIGHT-CLICK = −1 · GREEN RING = TIER SATISFYING THE REQUIREMENT</div>
	<div class="blocks">
		{#each visBlocks as b (b.rb)}
			<div class="bhead">
				<span class="brb">RB{pad2(b.rb)}</span>
				<span class="bcred">{b.credits}</span>
				<span class="bmet" class:done={b.met === b.total}>{b.met}/{b.total}</span>
				<span class="bunlock">{b.unlock}</span>
			</div>
			{#each b.rows as r (r.droid + r.tier)}
				<div class="row" class:met={r.met}>
					<div class="ncol">
						<span class="dname">{r.droid}</span>
						<span class="dmeta">{r.meta}</span>
					</div>
					<span class="req pill t-{r.tier}">{r.tier.toUpperCase()}</span>
					<span class="chips">
						{#each r.chipTiers as ct (ct)}
							<TierChip
								name={r.droid} tier={ct} count={r.counts[RIDX[ct]]}
								satisfying={RIDX[ct] === r.sat} disabled={!t.editable()}
								onInc={() => t.setCount(cycle, r.droid, ct, r.counts[RIDX[ct]] + 1)}
								onDec={() => t.setCount(cycle, r.droid, ct, Math.max(0, r.counts[RIDX[ct]] - 1))} />
						{/each}
					</span>
					<span class="verdict" data-testid="verdict" class:ok={r.met}>
						{r.met ? `✓ ${TIERS[r.sat].toUpperCase()}` : `KEEP · RB${pad2(b.rb)}`}
					</span>
					<button class="expand" aria-label="{r.droid} ladder" aria-expanded={!!open[`${b.rb}-${r.droid}`]}
						onclick={() => (open[`${b.rb}-${r.droid}`] = !open[`${b.rb}-${r.droid}`])}>▾</button>
				</div>
				{#if open[`${b.rb}-${r.droid}`]}
					<div class="rowladder"><TierLadder droid={r.droid} /></div>
				{/if}
			{/each}
		{/each}
	</div>
{/if}

<style>
	.empty { padding: 24px 18px; font: 600 10px var(--font-mono); color: var(--txt-3); letter-spacing: 1px; }
	.hintbar {
		flex: none; display: flex; align-items: center; gap: 8px; padding: 7px 18px;
		border-bottom: 1px solid var(--line-row);
		font: 600 8px var(--font-mono); color: var(--txt-4); letter-spacing: 1px;
	}
	.blocks { flex: 1; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
	.bhead {
		display: flex; align-items: center; gap: 10px; padding: 8px 18px;
		background: rgba(53, 200, 255, 0.04);
		border-top: 1px solid var(--line-row); border-bottom: 1px solid var(--line-row);
	}
	.brb { font: 700 11px var(--font-mono); color: var(--accent); letter-spacing: 1px; }
	.bcred { font: 600 10px var(--font-mono); color: var(--warn); }
	.bmet { font: 600 9px var(--font-mono); color: var(--txt-2); }
	.bmet.done { color: var(--good); }
	.bunlock { margin-left: auto; font: 600 8.5px var(--font-mono); color: var(--txt-3); letter-spacing: 0.5px; }
	.row {
		display: flex; align-items: center; gap: 12px; padding: 8px 18px;
		border-bottom: 1px solid var(--line-row2);
	}
	.row.met { opacity: 0.6; }
	.ncol { display: flex; flex-direction: column; gap: 2px; width: 170px; flex: none; }
	.dname { font: 600 12px var(--font-disp); color: var(--txt); }
	.dmeta { font: 500 7.5px var(--font-mono); color: var(--txt-3); letter-spacing: 0.5px; }
	.req { font: 700 8px var(--font-mono); padding: 2px 8px; flex: none; width: 58px; text-align: center; border: none; }
	.chips { display: flex; gap: 5px; flex: 1; min-width: 0; }
	.verdict {
		font: 700 9px var(--font-mono); color: var(--warn);
		width: 86px; text-align: right; flex: none; letter-spacing: 0.5px;
	}
	.verdict.ok { color: var(--good); }
	.expand {
		background: transparent; border: none; color: var(--txt-3);
		font-size: 10px; cursor: pointer; user-select: none; padding: 2px 4px;
	}
	.expand[aria-expanded='true'] { color: var(--accent); }
	.rowladder { border-bottom: 1px solid var(--line-row2); background: var(--panel-deep); padding-left: 240px; }
</style>
