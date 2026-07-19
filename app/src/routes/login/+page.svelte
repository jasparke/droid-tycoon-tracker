<script lang="ts">
	// SSO-only: a single link that starts the Authentik OIDC flow.
	// A full navigation (not fetch) so the browser follows the 302 to the IdP.
</script>

<h1>Log in</h1>
<p>Sign in with your Google account to sync your progress.</p>
<a class="sso" href="/api/auth/oidc/start" data-testid="sso-login">Sign in with Google</a>

<style>
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
