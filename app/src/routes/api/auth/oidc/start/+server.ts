import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { buildOidcStart, type OidcConfig } from '$lib/server/oidc';
import { oidcTempCookieNames, oidcTempCookieOpts } from '$lib/server/oidc-cookies';

function oidcConfig(): OidcConfig {
	return {
		issuerUrl: env.OIDC_ISSUER_URL ?? '',
		clientId: env.OIDC_CLIENT_ID ?? '',
		clientSecret: env.OIDC_CLIENT_SECRET ?? '',
		redirectUri: env.OIDC_REDIRECT_URI ?? '',
		allowInsecure: env.OIDC_ALLOW_INSECURE === '1'
	};
}

export const GET: RequestHandler = async ({ cookies }) => {
	const { authorizationUrl, state, nonce, codeVerifier } = await buildOidcStart(oidcConfig());
	const names = oidcTempCookieNames();
	const opts = oidcTempCookieOpts();
	cookies.set(names.state, state, opts);
	cookies.set(names.nonce, nonce, opts);
	cookies.set(names.verifier, codeVerifier, opts);
	redirect(302, authorizationUrl);
};
