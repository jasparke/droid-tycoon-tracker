<script lang="ts">
	import { apiFetch } from '$lib/client/api';
	import { toast } from '$lib/client/toast.svelte';
	let username = $state(''), password = $state(''), inviteCode = $state('');
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		try {
			await apiFetch('/api/auth/register', {
				method: 'POST', body: JSON.stringify({ username, password, inviteCode })
			});
			location.assign('/checklist'); // full reload so the layout re-inits the shared tracker
		} catch (err) { toast((err as Error).message); }
	}
</script>

<h1>Register</h1>
<form onsubmit={submit}>
	<label>Username <input bind:value={username} autocomplete="username" /></label>
	<label>Password <input type="password" bind:value={password} autocomplete="new-password" /></label>
	<label>Invite code <input bind:value={inviteCode} /></label>
	<button>Create account</button>
</form>
