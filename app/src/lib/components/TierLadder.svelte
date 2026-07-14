<script lang="ts">
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { earliestReq } from '$lib/game/requirements';
	import { RIDX, TIERS } from '$lib/game/tiers';
	import { pad2 } from '$lib/client/format';

	let { droid }: { droid: string } = $props();

	const t = getTracker()!;
	const ref = page.data.reference!;
	const cycle = $derived(t.cycle());
	const req = $derived(earliestReq(ref.rebirthReqs, cycle, t.rebirth(), droid));
	const counts = $derived(t.countsFor(cycle, droid));
	const rows = $derived(
		TIERS.map((tier, i) => {
			let status = 'SELLABLE';
			let needed = false;
			if (req) {
				const ri = RIDX[req.tier];
				if (i === ri) { status = `RB ${pad2(req.rebirth)}`; needed = true; }
				else if (i > ri) { status = `RB ${pad2(req.rebirth)} ↑`; needed = true; }
			}
			return { tier, i, status, needed, n: counts[i] };
		})
	);
</script>

<div class="ladder">
	{#each rows as r (r.tier)}
		<div class="lrow" class:dim={!r.needed}>
			<span class="tname tier-{r.tier}">{r.tier.toUpperCase()}</span>
			<span class="status" class:need={r.needed}>{r.status}</span>
			<span class="step pill">
				<button disabled={!t.editable()} aria-label="{droid} {r.tier} minus"
					onclick={() => t.setCount(cycle, droid, r.tier, Math.max(0, r.n - 1))}>−</button>
				<b>{r.n}</b>
				<button class="plus" disabled={!t.editable()} aria-label="{droid} {r.tier} plus"
					onclick={() => t.setCount(cycle, droid, r.tier, r.n + 1)}>+</button>
			</span>
		</div>
	{/each}
</div>

<style>
	.ladder { display: flex; flex-direction: column; }
	.lrow {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 14px; border-bottom: 1px solid var(--line-row);
	}
	.lrow.dim { opacity: 0.5; }
	.tname { font: 700 9px var(--font-mono); width: 60px; }
	.status { font: 600 9px var(--font-mono); color: var(--txt-2); letter-spacing: 0.5px; }
	.status.need { color: var(--good); }
	.step {
		margin-left: auto; display: inline-flex; align-items: center; gap: 5px;
		border-color: var(--line-ctrl); padding: 2px 5px;
	}
	.step button {
		width: 18px; text-align: center; background: transparent; border: none;
		color: var(--txt-2); cursor: pointer; user-select: none; font-size: 11px;
	}
	.step button.plus { color: var(--accent); }
	.step button:disabled { opacity: 0.5; cursor: default; }
	.step b { font: 700 11px var(--font-mono); color: var(--txt); }
</style>
