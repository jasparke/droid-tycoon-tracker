<script lang="ts">
	import '@fontsource/chakra-petch/600.css';
	import '@fontsource/chakra-petch/700.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '@fontsource/jetbrains-mono/600.css';
	import '@fontsource/jetbrains-mono/700.css';
	import '../app.css';
	import Toasts from '$lib/components/Toasts.svelte';
	import Shell from '$lib/components/Shell.svelte';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { setTracker } from '$lib/client/tracker-context';
	let { data, children } = $props();
	const t = data.user ? makeTracker(data as never) : null;
	if (t) setTracker(t);
</script>

{#if data.user && t}
	<Shell user={data.user} reference={data.reference}>{@render children()}</Shell>
{:else}
	{@render children()}
{/if}
<Toasts />
