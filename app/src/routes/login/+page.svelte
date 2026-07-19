<script lang="ts">
	// SSO-only: a single link that starts the Authentik OIDC flow.
	// A full navigation (not fetch) so the browser follows the 302 to the IdP.
	import { page } from '$app/state';

	// codes set by /api/auth/oidc/callback redirects
	const MESSAGES: Record<string, string> = {
		oidc_state: 'Your sign-in attempt expired or was interrupted. Please try again.',
		oidc_exchange: 'Sign-in could not be completed with the identity provider. Please try again.',
		oidc_internal: 'Something went wrong on our side while signing you in. Please try again.'
	};
	const code = $derived(page.url.searchParams.get('error'));
	const errorMessage = $derived(
		code === null ? null : (MESSAGES[code] ?? 'Sign-in failed. Please try again.')
	);
</script>

<h1>Log in</h1>
<p>Sign in with your Google account to sync your progress.</p>
{#if errorMessage}
	<p class="error" role="alert" data-testid="login-error">{errorMessage}</p>
{/if}
<a class="sso" href="/api/auth/oidc/start" data-testid="sso-login">Sign in with Google</a>

<style>
	.error {
		margin-top: 0.75rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--alert);
		border-radius: 6px;
		color: var(--alert);
	}
	.sso {
		display: inline-block;
		margin-top: 1rem;
		padding: 0.6rem 1.1rem;
		border: 1px solid currentColor;
		border-radius: 6px;
		text-decoration: none;
		font: inherit;
	}
</style>
