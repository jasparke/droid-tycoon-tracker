<script lang="ts">
	import { toasts } from '$lib/client/toast.svelte';
</script>

<div class="stack" role="status">
	{#each toasts.list as t (t.id)}
		<div class="toast">{t.msg}</div>
	{/each}
</div>

<style>
	.stack { position: fixed; bottom: 1rem; right: 1rem; z-index: 100; }
	.toast {
		background: var(--panel); color: var(--txt);
		border: 1px solid var(--line-ctrl); border-left: 2px solid var(--alert);
		font: 600 11px var(--font-mono); padding: 8px 12px; margin-top: 6px; border-radius: 6px;
	}
</style>
