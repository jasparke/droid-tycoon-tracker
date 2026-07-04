<script lang="ts">
	import '../app.css';
	import Toasts from '$lib/components/Toasts.svelte';
	let { data, children } = $props();
</script>

{#if data.user}
	<nav>
		<a href="/checklist">Checklist</a><a href="/planner">Planner</a>
		<a href="/inventory">Inventory</a><a href="/droids">All Droids</a>
		<a href="/keepers">Keepers</a><a href="/roi">ROI</a>
		<span style="float:right">
			{data.user.username}
			{#if data.reference?.version}· data as of {new Date(data.reference.version.ingestedAt).toLocaleDateString()}{/if}
			<form method="POST" action="/api/auth/logout" style="display:inline"><button>Log out</button></form>
		</span>
	</nav>
{/if}
{@render children()}
<Toasts />
