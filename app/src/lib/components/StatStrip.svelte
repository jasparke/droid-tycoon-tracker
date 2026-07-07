<script lang="ts">
	let { cells }: { cells: { label: string; value: string; color?: string }[] } = $props();
</script>

<div class="strip">
	{#each cells as c (c.label)}
		<div class="cell">
			<div class="lbl">{c.label}</div>
			<div class="val" style:color={c.color ?? 'var(--txt)'}>{c.value}</div>
		</div>
	{/each}
</div>

<style>
	.strip { flex: none; display: flex; gap: 1px; background: var(--line); border-bottom: 1px solid var(--line); }
	.cell { flex: 1; background: var(--panel-deep); padding: 8px 18px; }
	.lbl { font: 600 8.5px var(--font-mono); color: var(--txt-3); letter-spacing: 1px; }
	.val { font: 700 16px var(--font-mono); }
</style>
