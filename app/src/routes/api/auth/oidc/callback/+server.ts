import { error, isRedirect, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { env as pub } from '$env/dynamic/public';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { completeOidcCallback, type OidcConfig } from '$lib/server/oidc';
import { oidcTempCookieNames } from '$lib/server/oidc-cookies';
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
	const names = oidcTempCookieNames();
	const state = cookies.get(names.state);
	const nonce = cookies.get(names.nonce);
	const codeVerifier = cookies.get(names.verifier);
	cookies.delete(names.state, clearTemp);
	cookies.delete(names.nonce, clearTemp);
	cookies.delete(names.verifier, clearTemp);

	if (!state || !nonce || !codeVerifier) redirect(303, '/login?error=oidc_state');

	// Reconstruct the callback URL from the trusted public origin (not proxy Host headers),
	// keeping the incoming query (code, state). Its origin+path must equal OIDC_REDIRECT_URI.
	// The request-origin fallback is dev-only: in production a missing PUBLIC_BASE_URL would
	// silently trust the proxy Host header, so it fails loudly instead.
	const base = pub.PUBLIC_BASE_URL || (dev ? url.origin : null);
	if (!base) {
		console.error('OIDC callback: PUBLIC_BASE_URL is not set; refusing to derive it from request headers');
		error(500, 'PUBLIC_BASE_URL is not configured');
	}
	const currentUrl = new URL(url.pathname + url.search, base);

	let claims;
	try {
		claims = await completeOidcCallback(oidcConfig(), currentUrl, { state, nonce, codeVerifier });
	} catch (e) {
		console.error('OIDC callback: token exchange failed', e);
		redirect(303, '/login?error=oidc_exchange');
	}

	try {
		const user = await findOrCreateOidcUser(db, claims);
		const { token, expiresAt } = await createSession(db, user.id);
		cookies.set('session', token, {
			path: '/', httpOnly: true, sameSite: 'lax', secure: !dev, expires: expiresAt
		});
	} catch (e) {
		if (isRedirect(e)) throw e;
		console.error('OIDC callback: user upsert / session mint failed', e);
		redirect(303, '/login?error=oidc_internal');
	}
	redirect(303, '/checklist');
};
