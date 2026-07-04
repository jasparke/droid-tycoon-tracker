<script lang="ts">
	import { toasts } from '$lib/client/toast.svelte';
</script>

<div style="position:fixed;bottom:1rem;right:1rem" role="status">
	{#each toasts.list as t (t.id)}
		<div style="background:#a00;color:#fff;padding:6px 12px;margin-top:6px;border-radius:6px">{t.msg}</div>
	{/each}
</div>
