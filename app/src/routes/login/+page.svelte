<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/client/api';
	import { toast } from '$lib/client/toast.svelte';
	let username = $state(''), password = $state('');
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
			await goto('/checklist', { invalidateAll: true });
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
