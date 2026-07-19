import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { buildOidcStart, type OidcConfig } from '$lib/server/oidc';

function oidcConfig(): OidcConfig {
	return {
		issuerUrl: env.OIDC_ISSUER_URL ?? '',
		clientId: env.OIDC_CLIENT_ID ?? '',
		clientSecret: env.OIDC_CLIENT_SECRET ?? '',
		redirectUri: env.OIDC_REDIRECT_URI ?? '',
		allowInsecure: env.OIDC_ALLOW_INSECURE === '1'
	};
}

const tempCookie = { path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: 600 } as const;

export const GET: RequestHandler = async ({ cookies }) => {
	const { authorizationUrl, state, nonce, codeVerifier } = await buildOidcStart(oidcConfig());
	cookies.set('oidc_state', state, tempCookie);
	cookies.set('oidc_nonce', nonce, tempCookie);
	cookies.set('oidc_verifier', codeVerifier, tempCookie);
	redirect(302, authorizationUrl);
};
