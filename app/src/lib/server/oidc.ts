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

async function discover(cfg: OidcConfig): Promise<client.Configuration> {
	return client.discovery(
		new URL(cfg.issuerUrl),
		cfg.clientId,
		undefined,
		client.ClientSecretPost(cfg.clientSecret),
		cfg.allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined
	);
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
	const name = (claims.preferred_username as string | undefined) ?? (claims.name as string | undefined) ?? null;
	const email = (claims.email as string | undefined) ?? null;
	return { sub: claims.sub, email, name };
}
