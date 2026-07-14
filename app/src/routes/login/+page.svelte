<script lang="ts">
	import { apiFetch } from '$lib/client/api';
	import { toast } from '$lib/client/toast.svelte';
	let username = $state(''), password = $state('');
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
			location.assign('/checklist'); // full reload so the layout re-inits the shared tracker
		} catch (err) { toast((err as Error).message); }
	}
</script>

<h1>Log in</h1>
<form onsubmit={submit}>
	<label>Username <input bind:value={username} autocomplete="username" /></label>
	<label>Password <input type="password" bind:value={password} autocomplete="current-password" /></label>
	<button>Log in</button>
</form>
<p>No account? <a href="/register">Register with an invite code</a>.</p>
