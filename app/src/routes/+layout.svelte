<script lang="ts">
	import '@fontsource/chakra-petch/600.css';
	import '@fontsource/chakra-petch/700.css';
	import '@fontsource/jetbrains-mono/500.css';
	import '@fontsource/jetbrains-mono/600.css';
	import '@fontsource/jetbrains-mono/700.css';
	import '../app.css';
	import Toasts from '$lib/components/Toasts.svelte';
	import Shell from '$lib/components/Shell.svelte';
	import SearchPopover from '$lib/components/SearchPopover.svelte';
	import { untrack } from 'svelte';
	import { makeTracker } from '$lib/client/tracker.svelte';
	import { setTracker } from '$lib/client/tracker-context';
	let { data, children } = $props();
	// initial seed only; navigation updates flow through the $effect below.
	// svelte-ignore state_referenced_locally
	const t = data.user ? makeTracker(data as never) : null;
	if (t) setTracker(t);
	// the layout load reruns on every client-side navigation; re-apply its fresh
	// data so an already-open tab reflects server-side changes without a full reload.
	// Track only `data` — applyServerData reads+writes tracker state, so run it
	// untracked or the effect would invalidate itself (infinite loop).
	$effect(() => {
		const next = data;
		if (t) untrack(() => t.applyServerData(next as never));
	});
</script>

{#if data.user && t}
	<Shell user={data.user} reference={data.reference}>{@render children()}</Shell>
	<SearchPopover />
{:else}
	<!-- logged-out pages (login/register) render outside Shell; restore the base
	     centering + padding that the app-wide reset otherwise leaves to Shell -->
	<div class="auth">{@render children()}</div>
{/if}
<Toasts />

<style>
	.auth {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
