// Minimal auto-approving OIDC provider for e2e. NOT for production.
// Serves discovery + JWKS + /authorize (immediate redirect) + /token (RS256 id_token).
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const PORT = Number(process.env.FAKE_OIDC_PORT ?? 9099);
const ISSUER = process.env.FAKE_OIDC_ISSUER ?? `http://localhost:${PORT}`;
const CLIENT_ID = process.env.FAKE_OIDC_CLIENT_ID ?? 'test-client';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };

// code -> { nonce, sub, email, name } stashed at /authorize, consumed at /token
const codes = new Map();

const send = (res, status, body, type = 'application/json') => {
	res.writeHead(status, { 'content-type': type });
	res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = createServer(async (req, res) => {
	const url = new URL(req.url, ISSUER);

	if (url.pathname === '/.well-known/openid-configuration') {
		return send(res, 200, {
			issuer: ISSUER,
			authorization_endpoint: `${ISSUER}/authorize`,
			token_endpoint: `${ISSUER}/token`,
			jwks_uri: `${ISSUER}/jwks`,
			response_types_supported: ['code'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			code_challenge_methods_supported: ['S256'],
			scopes_supported: ['openid', 'email', 'profile'],
			grant_types_supported: ['authorization_code']
		});
	}

	if (url.pathname === '/jwks') return send(res, 200, { keys: [jwk] });

	if (url.pathname === '/authorize') {
		// Auto-approve: mint a fresh identity and redirect straight back with a code.
		const redirectUri = url.searchParams.get('redirect_uri');
		const state = url.searchParams.get('state');
		const nonce = url.searchParams.get('nonce');
		const code = randomUUID();
		const n = codes.size + 1;
		codes.set(code, {
			nonce,
			sub: `stub-${randomUUID()}`,
			email: `friend${n}@example.com`,
			name: `Friend ${n}`,
			preferred_username: `friend${n}`
		});
		const back = new URL(redirectUri);
		back.searchParams.set('code', code);
		if (state) back.searchParams.set('state', state);
		res.writeHead(302, { location: back.href });
		return res.end();
	}

	if (url.pathname === '/token' && req.method === 'POST') {
		let raw = '';
		for await (const chunk of req) raw += chunk;
		const form = new URLSearchParams(raw);
		const rec = codes.get(form.get('code'));
		if (!rec) return send(res, 400, { error: 'invalid_grant' });
		codes.delete(form.get('code'));
		const now = Math.floor(Date.now() / 1000);
		const idToken = await new SignJWT({
			email: rec.email,
			name: rec.name,
			preferred_username: rec.preferred_username,
			nonce: rec.nonce
		})
			.setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
			.setIssuer(ISSUER)
			.setSubject(rec.sub)
			.setAudience(CLIENT_ID)
			.setIssuedAt(now)
			.setExpirationTime(now + 300)
			.sign(privateKey);
		return send(res, 200, {
			access_token: randomUUID(),
			token_type: 'Bearer',
			expires_in: 300,
			id_token: idToken,
			scope: 'openid email profile'
		});
	}

	return send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => console.log(`fake-oidc listening on ${ISSUER}`));
