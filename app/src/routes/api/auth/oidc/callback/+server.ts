import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { completeOidcCallback, type OidcConfig } from '$lib/server/oidc';
import { findOrCreateOidcUser, createSession } from '$lib/server/services/users';

function oidcConfig(): OidcConfig {
	return {
		issuerUrl: env.OIDC_ISSUER_URL ?? '',
		clientId: env.OIDC_CLIENT_ID ?? '',
		clientSecret: env.OIDC_CLIENT_SECRET ?? '',
		redirectUri: env.OIDC_REDIRECT_URI ?? '',
		allowInsecure: env.OIDC_ALLOW_INSECURE === '1'
	};
}

const clearTemp = { path: '/' };

export const GET: RequestHandler = async ({ url, cookies }) => {
	const state = cookies.get('oidc_state');
	const nonce = cookies.get('oidc_nonce');
	const codeVerifier = cookies.get('oidc_verifier');
	cookies.delete('oidc_state', clearTemp);
	cookies.delete('oidc_nonce', clearTemp);
	cookies.delete('oidc_verifier', clearTemp);

	if (!state || !nonce || !codeVerifier) redirect(303, '/login?error=oidc_state');

	// Reconstruct the callback URL from the trusted public origin (not proxy Host headers),
	// keeping the incoming query (code, state). Its origin+path must equal OIDC_REDIRECT_URI.
	const base = pub.PUBLIC_BASE_URL ?? url.origin;
	const currentUrl = new URL(url.pathname + url.search, base);

	let claims;
	try {
		claims = await completeOidcCallback(oidcConfig(), currentUrl, { state, nonce, codeVerifier });
	} catch {
		redirect(303, '/login?error=oidc_exchange');
	}

	const user = await findOrCreateOidcUser(db, claims);
	const { token, expiresAt } = await createSession(db, user.id);
	cookies.set('session', token, {
		path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, expires: expiresAt
	});
	redirect(303, '/checklist');
};
