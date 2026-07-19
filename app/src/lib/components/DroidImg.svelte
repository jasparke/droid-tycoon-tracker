<script lang="ts">
	import { droidArtFile, droidArtUrl } from '$lib/game/art';
	import type { Tier } from '$lib/game/tiers';

	let {
		name,
		tier = 'Base',
		size = 28,
		class: cls = ''
	}: { name: string; tier?: Tier; size?: number; class?: string } = $props();

	const REMOTE = 'https://droidtrakr.com/droid-tycoon/assets/droids/';
	// local /assets/droids → droidtrakr remote (once) → hidden; never breaks layout.
	let img: HTMLImageElement;
	let triedRemote = false;
	function onError() {
		if (!triedRemote) {
			triedRemote = true;
			img.src = REMOTE + droidArtFile(name, tier);
		} else {
			img.style.visibility = 'hidden';
		}
	}
	// reset the fallback state whenever the droid/tier changes on a reused instance
	$effect(() => {
		name;
		tier;
		triedRemote = false;
		if (img) img.style.visibility = '';
	});
</script>

<img
	bind:this={img}
	class="dimg {cls}"
	src={droidArtUrl(name, tier)}
	width={size}
	height={size}
	loading="lazy"
	alt=""
	onerror={onError}
/>

<style>
	.dimg {
		flex: none;
		object-fit: contain;
		border-radius: 5px;
		background: var(--panel-deep, #0a1322);
		vertical-align: middle;
	}
</style>
