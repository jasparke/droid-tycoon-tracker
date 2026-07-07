<script lang="ts">
	import type { Tier } from '$lib/game/tiers';

	const LETTER: Record<Tier, string> = { Base: 'B', Gold: 'G', Diamond: 'D', Rainbow: 'R', Beskar: 'BK' };

	let { name, tier, count, satisfying = false, disabled = false, onInc, onDec }: {
		name: string; tier: Tier; count: number; satisfying?: boolean; disabled?: boolean;
		onInc: () => void; onDec: () => void;
	} = $props();
</script>

<button
	class="chip t-{tier}"
	class:ring={satisfying}
	{disabled}
	aria-label="{name} {tier}"
	onclick={onInc}
	oncontextmenu={(e) => { e.preventDefault(); if (!disabled) onDec(); }}
>
	{LETTER[tier]} <b>{count}</b>
</button>

<style>
	.chip {
		display: inline-flex; align-items: center; gap: 4px;
		font: 700 9px var(--font-mono); padding: 3px 9px;
		border-radius: 99px; border: 1px solid currentColor;
		cursor: pointer; user-select: none;
	}
	.chip b { font-size: 10px; }
	.chip:disabled { cursor: default; opacity: 0.7; }
	.ring { box-shadow: 0 0 0 2px rgba(61, 223, 138, 0.4); }
</style>
