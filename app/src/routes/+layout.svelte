<script lang="ts">
	import '@fontsource/chakra-petch/600.css';
	import '@fontsource/chakra-petch/700.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '@fontsource/jetbrains-mono/600.css';
	import '@fontsource/jetbrains-mono/700.css';
	import '../app.css';
	import Toasts from '$lib/components/Toasts.svelte';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { setTracker } from '$lib/client/tracker-context';
	let { data, children } = $props();
	const t = data.user ? makeTracker(data as never) : null;
	if (t) setTracker(t);
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
