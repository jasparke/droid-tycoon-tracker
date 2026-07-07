<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { getTracker } from '$lib/client/tracker-context';
	import { search } from '$lib/client/search.svelte';
	import { pad2 } from '$lib/client/format';

	let { user, reference, children }: {
		user: { id: number; username: string };
		reference: App.PageData['reference'];
		children: Snippet;
	} = $props();

	const t = getTracker()!;
	const NAV: { label: string; href: string | null }[] = [
		{ label: 'CHECKLIST', href: '/checklist' },
		{ label: 'PLANNER', href: '/planner' },
		{ label: 'INVENTORY', href: '/inventory' },
		{ label: 'DROIDEX', href: '/droids' },
		{ label: 'KEEPERS', href: '/keepers' },
		{ label: 'ROI', href: '/roi' },
		{ label: 'SRB PRE-PLAN', href: null },
		{ label: 'REFERENCE', href: null }
	];
	const TITLES: Record<string, string> = {
		'/checklist': 'CHECKLIST', '/planner': 'PLANNER', '/inventory': 'INVENTORY',
		'/droids': 'DROIDEX', '/keepers': 'KEEPERS', '/roi': 'ROI — PAYBACK TIME'
	};
	const path = $derived(page.url.pathname);
	const title = $derived(TITLES[path] ?? 'TRACKER');
	const pad = $derived(path !== '/checklist');
	const dataV = $derived(
		reference?.version ? new Date(reference.version.ingestedAt).toISOString().slice(0, 10) : null
	);
	let profOpen = $state(false);
	let profilesEl = $state<HTMLElement | null>(null);
	const activeP = $derived(t.active());

	function onWindowClick(e: MouseEvent) {
		if (!profOpen) return;
		if (!profilesEl?.contains(e.target as Node)) profOpen = false;
	}
	function onWindowKeydown(e: KeyboardEvent) {
		if (!profOpen) return;
		if (e.key === 'Escape') profOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="shell">
	<aside>
		<div class="brand">
			<div class="mark">DT</div>
			<div class="word">TYCOON<span>//</span>TRKR</div>
		</div>
		<nav>
			{#each NAV as n (n.label)}
				{#if n.href}
					<a href={n.href} class:active={path === n.href}>{n.label}</a>
				{:else}
					<div class="soon">{n.label}<span>SOON</span></div>
				{/if}
			{/each}
		</nav>
		<div class="profiles" bind:this={profilesEl}>
			<div class="plabel">PROFILES</div>
			<button class="pcard" aria-expanded={profOpen} aria-haspopup="menu" onclick={() => (profOpen = !profOpen)}>
				<span class="avatar">{(activeP?.owner ?? user.username)[0].toUpperCase()}</span>
				<span class="pname">{activeP ? `${activeP.owner}/${activeP.name}` : 'no profile'}</span>
				<span class="caret">▾</span>
			</button>
			{#if profOpen}
				<div class="pmenu">
					{#each t.state.profiles as p (p.id)}
						<button class="pitem" class:sel={p.id === t.state.activeId}
							onclick={() => { t.selectProfile(p.id); profOpen = false; }}>
							{p.owner}/{p.name}
							{#if p.userId !== user.id}<span class="rotag">RO</span>{/if}
						</button>
					{/each}
					<div class="pfoot">
						<span>{user.username}</span>
						<form method="POST" action="/api/auth/logout"><button>Log out</button></form>
					</div>
				</div>
			{/if}
		</div>
	</aside>
	<section class="col">
		<header>
			<h1>{title}</h1>
			{#if activeP && !t.editable()}<span class="robadge">READ-ONLY</span>{/if}
			<div class="cycle">
				<button class:on={t.cycle() === 1} disabled={!t.editable()} onclick={() => t.setCycle(1)}>CYCLE 1</button>
				<span class="vsep"></span>
				<button class:on={t.cycle() === 2} disabled={!t.editable()} onclick={() => t.setCycle(2)}>CYCLE 2</button>
			</div>
			<div class="rb notch">
				<span class="rlabel">REBIRTH</span>
				<span class="rval">{pad2(t.rebirth())}<span>/27</span></span>
				<span class="steps">
					<button disabled={!t.editable()} aria-label="rebirth minus" onclick={() => t.setRebirth(t.rebirth() - 1)}>−</button>
					<button class="plus" disabled={!t.editable()} aria-label="rebirth plus" onclick={() => t.setRebirth(t.rebirth() + 1)}>+</button>
				</span>
			</div>
			<button class="searchfield" onclick={() => (search.open = true)}>
				⌕ search droid… <span class="kbd">⌘K</span>
			</button>
			<button class="hidedone" class:on={t.hideDone()} onclick={() => t.setHideDone(!t.hideDone())}>
				{t.hideDone() ? '◉' : '○'} HIDE DONE
			</button>
			{#if dataV}<span class="datav">data v{dataV}</span>{/if}
		</header>
		<main class:pad>{@render children()}</main>
	</section>
</div>

<style>
	.shell {
		display: flex; height: 100vh; min-width: 1180px; overflow: hidden;
	}
	aside {
		width: 190px; flex: none; display: flex; flex-direction: column;
		padding: 14px 0; border-right: 1px solid var(--line); background: rgba(6, 10, 18, 0.7);
	}
	.brand {
		display: flex; align-items: center; gap: 8px;
		padding: 0 16px 14px; border-bottom: 1px solid var(--line);
	}
	.mark {
		width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
		background: linear-gradient(135deg, var(--accent), #1272b8);
		clip-path: polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%);
		font: 700 12px var(--font-mono); color: var(--bg);
	}
	.word { font: 700 12px var(--font-disp); letter-spacing: 1.5px; }
	.word span { color: var(--accent); }
	nav { display: flex; flex-direction: column; gap: 2px; padding: 12px 8px; }
	nav a, .soon {
		display: flex; align-items: center; gap: 8px; padding: 8px 10px;
		font: 600 12px var(--font-disp); letter-spacing: 0.6px; text-decoration: none;
		border-left: 2px solid transparent; color: var(--txt-2); user-select: none;
	}
	nav a:hover { color: var(--txt); }
	nav a.active { background: rgba(53, 200, 255, 0.12); border-left-color: var(--accent); color: var(--accent); }
	.soon { color: var(--txt-4); cursor: default; }
	.soon span { font: 600 7.5px var(--font-mono); color: var(--txt-4); letter-spacing: 0.5px; }
	.profiles {
		margin-top: auto; padding: 12px 12px 0; border-top: 1px solid var(--line);
		display: flex; flex-direction: column; gap: 8px; position: relative;
	}
	.plabel { font: 600 9px var(--font-mono); color: var(--txt-3); letter-spacing: 1px; }
	.pcard {
		display: flex; align-items: center; gap: 8px; padding: 7px 9px;
		background: var(--panel); border: 1px solid var(--line-ctrl); border-radius: 6px;
		color: var(--txt); cursor: pointer;
	}
	.avatar {
		width: 20px; height: 20px; flex: none; border-radius: 50%; background: var(--accent);
		color: var(--bg); font: 700 10px var(--font-mono);
		display: flex; align-items: center; justify-content: center;
	}
	.pname { font: 600 11px var(--font-disp); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.caret { margin-left: auto; color: var(--txt-3); font-size: 9px; }
	.pmenu {
		position: absolute; bottom: 100%; left: 12px; right: 12px; margin-bottom: 6px;
		background: var(--panel); border: 1px solid var(--line-ctrl); border-radius: 6px;
		display: flex; flex-direction: column; overflow: hidden; z-index: 40;
	}
	.pitem {
		display: flex; align-items: center; gap: 6px; padding: 7px 10px; text-align: left;
		background: transparent; border: none; color: var(--txt-2);
		font: 600 11px var(--font-disp); cursor: pointer;
	}
	.pitem:hover { background: rgba(53, 200, 255, 0.08); color: var(--txt); }
	.pitem.sel { color: var(--accent); }
	.rotag { font: 600 7.5px var(--font-mono); color: var(--txt-4); }
	.pfoot {
		display: flex; align-items: center; justify-content: space-between; gap: 8px;
		padding: 7px 10px; border-top: 1px solid var(--line-ctrl);
		font: 600 10px var(--font-mono); color: var(--txt-3);
	}
	.pfoot button {
		background: transparent; border: 1px solid var(--line-ctrl); border-radius: 5px;
		color: var(--txt-2); font: 600 9px var(--font-mono); padding: 2px 8px; cursor: pointer;
	}
	.col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
	header {
		flex: none; display: flex; align-items: center; gap: 12px;
		padding: 12px 18px; border-bottom: 1px solid var(--line);
	}
	h1 { margin: 0; font: 700 14px var(--font-disp); letter-spacing: 1px; }
	.robadge {
		font: 700 8px var(--font-mono); color: var(--alert);
		border: 1px solid var(--alert); border-radius: 99px; padding: 2px 8px; letter-spacing: 0.5px;
	}
	.cycle { display: flex; align-items: stretch; border: 1px solid var(--line-ctrl); border-radius: 7px; overflow: hidden; }
	.cycle button {
		padding: 6px 12px; font: 700 10px var(--font-mono); background: transparent;
		border: none; color: var(--txt-3); cursor: pointer; user-select: none;
	}
	.cycle button.on { background: rgba(53, 200, 255, 0.15); color: var(--accent); }
	.cycle button:disabled { cursor: default; }
	.vsep { width: 1px; background: var(--line-ctrl); }
	.rb {
		display: flex; align-items: center; gap: 10px;
		background: var(--panel); border: 1px solid var(--line-ctrl); padding: 6px 10px;
	}
	.rlabel { font: 600 9px var(--font-mono); color: var(--txt-3); }
	.rval { font: 700 14px var(--font-mono); color: var(--txt); }
	.rval span { color: var(--txt-3); }
	.steps { display: flex; gap: 4px; }
	.steps button {
		width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
		background: transparent; border: 1px solid var(--line-ctrl); color: var(--txt-2);
		font-size: 11px; cursor: pointer; user-select: none;
	}
	.steps button.plus { border-color: var(--accent); color: var(--accent); }
	.steps button:disabled { opacity: 0.5; cursor: default; }
	.searchfield {
		flex: 1; max-width: 320px; display: flex; align-items: center; gap: 8px;
		background: var(--panel); border: 1px solid var(--line-ctrl); border-radius: 6px;
		padding: 7px 11px; color: var(--txt-3); font: 500 11px var(--font-mono);
		cursor: pointer; user-select: none;
	}
	.searchfield .kbd { margin-left: auto; }
	.hidedone {
		margin-left: auto; display: flex; align-items: center; gap: 6px;
		background: transparent; border: none; font: 600 9px var(--font-mono);
		color: var(--txt-3); letter-spacing: 0.5px; cursor: pointer; user-select: none;
	}
	.hidedone.on { color: var(--good); }
	.datav { font: 500 9px var(--font-mono); color: var(--txt-4); }
	main { flex: 1; overflow-y: auto; min-height: 0; display: flex; flex-direction: column; }
	main.pad { padding: 14px 18px; display: block; }
</style>
