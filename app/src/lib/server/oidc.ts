import * as client from 'openid-client';

export type OidcConfig = {
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	/** test-only: allow http (localhost stub). Never set in production. */
	allowInsecure?: boolean;
};

export type OidcStart = {
	authorizationUrl: string;
	state: string;
	nonce: string;
	codeVerifier: string;
};

export type OidcClaims = { sub: string; email: string | null; name: string | null };

const SCOPE = 'openid email profile';

export const OIDC_DISCOVERY_TTL_MS = 10 * 60_000;

// discovery() fetches the issuer metadata (and, transitively, JWKS) on every call; one
// Configuration per client config is reusable across requests, so cache the in-flight
// promise. TTL'd so an IdP metadata change is picked up without a restart.
const discoveryCache = new Map<string, { at: number; config: Promise<client.Configuration> }>();

function discover(cfg: OidcConfig): Promise<client.Configuration> {
	const key = `${cfg.issuerUrl}|${cfg.clientId}|${cfg.clientSecret}|${cfg.allowInsecure ? 1 : 0}`;
	const hit = discoveryCache.get(key);
	if (hit && Date.now() - hit.at < OIDC_DISCOVERY_TTL_MS) return hit.config;
	const config = client.discovery(
		new URL(cfg.issuerUrl),
		cfg.clientId,
		undefined,
		client.ClientSecretPost(cfg.clientSecret),
		cfg.allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined
	);
	discoveryCache.set(key, { at: Date.now(), config });
	// never cache a failure; guard against evicting a newer entry for the same key
	config.catch(() => {
		if (discoveryCache.get(key)?.config === config) discoveryCache.delete(key);
	});
	return config;
}

/** Discover + build a PKCE + state + nonce authorize URL. Caller stashes the checks in cookies. */
export async function buildOidcStart(cfg: OidcConfig): Promise<OidcStart> {
	const config = await discover(cfg);
	const codeVerifier = client.randomPKCECodeVerifier();
	const code_challenge = await client.calculatePKCECodeChallenge(codeVerifier);
	const state = client.randomState();
	const nonce = client.randomNonce();
	const url = client.buildAuthorizationUrl(config, {
		redirect_uri: cfg.redirectUri,
		scope: SCOPE,
		code_challenge,
		code_challenge_method: 'S256',
		state,
		nonce
	});
	return { authorizationUrl: url.href, state, nonce, codeVerifier };
}

/** Exchange the code at `currentUrl`, validating state/nonce/PKCE, and return normalized id_token claims. */
export async function completeOidcCallback(
	cfg: OidcConfig,
	currentUrl: URL,
	checks: { state: string; nonce: string; codeVerifier: string }
): Promise<OidcClaims> {
	const config = await discover(cfg);
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		pkceCodeVerifier: checks.codeVerifier,
		expectedState: checks.state,
		expectedNonce: checks.nonce,
		idTokenExpected: true
	});
	const claims = tokens.claims();
	if (!claims) throw new Error('OIDC callback: id_token had no claims');
	// claim values are IdP-controlled JSON — only accept non-empty strings
	const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
	const name = str(claims.preferred_username) ?? str(claims.name);
	const email = str(claims.email);
	return { sub: claims.sub, email, name };
}
