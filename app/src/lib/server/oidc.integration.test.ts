import { describe, it, expect, vi, beforeEach } from 'vitest';

// hoisted mock of the functional openid-client API
const m = vi.hoisted(() => ({
	discovery: vi.fn(),
	randomPKCECodeVerifier: vi.fn(() => 'verifier-xyz'),
	calculatePKCECodeChallenge: vi.fn(async () => 'challenge-xyz'),
	randomState: vi.fn(() => 'state-abc'),
	randomNonce: vi.fn(() => 'nonce-def'),
	buildAuthorizationUrl: vi.fn(),
	authorizationCodeGrant: vi.fn(),
	allowInsecureRequests: vi.fn(),
	ClientSecretPost: vi.fn((s: string) => ({ __auth: 'post', s }))
}));
vi.mock('openid-client', () => m);

import { buildOidcStart, completeOidcCallback } from './oidc';

const cfg = {
	issuerUrl: 'https://idp.test/app/o/x/',
	clientId: 'cid',
	clientSecret: 'secret',
	redirectUri: 'https://app.test/api/auth/oidc/callback'
};

beforeEach(() => vi.clearAllMocks());

describe('buildOidcStart', () => {
	it('discovers, builds a PKCE+state+nonce authorize URL, and returns the checks', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.buildAuthorizationUrl.mockReturnValue(new URL('https://idp.test/authorize?x=1'));

		const out = await buildOidcStart(cfg);

		expect(m.discovery).toHaveBeenCalledWith(
			new URL(cfg.issuerUrl), cfg.clientId, undefined, { __auth: 'post', s: 'secret' }, undefined
		);
		expect(m.buildAuthorizationUrl).toHaveBeenCalledWith(
			{ id: 'config' },
			{
				redirect_uri: cfg.redirectUri,
				scope: 'openid email profile',
				code_challenge: 'challenge-xyz',
				code_challenge_method: 'S256',
				state: 'state-abc',
				nonce: 'nonce-def'
			}
		);
		expect(out).toEqual({
			authorizationUrl: 'https://idp.test/authorize?x=1',
			state: 'state-abc',
			nonce: 'nonce-def',
			codeVerifier: 'verifier-xyz'
		});
	});

	it('passes allowInsecureRequests through discovery options when allowInsecure is set', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.buildAuthorizationUrl.mockReturnValue(new URL('https://idp.test/authorize'));
		await buildOidcStart({ ...cfg, allowInsecure: true });
		expect(m.discovery).toHaveBeenCalledWith(
			new URL(cfg.issuerUrl), cfg.clientId, undefined, { __auth: 'post', s: 'secret' },
			{ execute: [m.allowInsecureRequests] }
		);
	});
});

describe('completeOidcCallback', () => {
	it('exchanges the code with the stored checks and returns normalized claims', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({
			claims: () => ({ sub: 'goog-1', email: 'a@example.com', name: 'Ada', preferred_username: 'ada' })
		});
		const currentUrl = new URL('https://app.test/api/auth/oidc/callback?code=c&state=state-abc');

		const claims = await completeOidcCallback(cfg, currentUrl, {
			state: 'state-abc', nonce: 'nonce-def', codeVerifier: 'verifier-xyz'
		});

		expect(m.authorizationCodeGrant).toHaveBeenCalledWith(
			{ id: 'config' }, currentUrl,
			{ pkceCodeVerifier: 'verifier-xyz', expectedState: 'state-abc', expectedNonce: 'nonce-def', idTokenExpected: true }
		);
		expect(claims).toEqual({ sub: 'goog-1', email: 'a@example.com', name: 'ada' });
	});

	it('prefers preferred_username, falls back to name, then null; email null when absent', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({ claims: () => ({ sub: 'goog-2' }) });
		const claims = await completeOidcCallback(cfg, new URL('https://app.test/cb?code=c'), {
			state: 's', nonce: 'n', codeVerifier: 'v'
		});
		expect(claims).toEqual({ sub: 'goog-2', email: null, name: null });
	});

	it('ignores a non-string preferred_username and falls back to name', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({
			claims: () => ({ sub: 'goog-5', preferred_username: 12345, name: 'Ada' })
		});
		const claims = await completeOidcCallback(cfg, new URL('https://app.test/cb?code=c'), {
			state: 's', nonce: 'n', codeVerifier: 'v'
		});
		expect(claims).toEqual({ sub: 'goog-5', email: null, name: 'Ada' });
	});

	it('ignores a non-string email claim instead of passing it through', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({
			claims: () => ({ sub: 'goog-6', email: { evil: true }, name: ['Ada'] })
		});
		const claims = await completeOidcCallback(cfg, new URL('https://app.test/cb?code=c'), {
			state: 's', nonce: 'n', codeVerifier: 'v'
		});
		expect(claims).toEqual({ sub: 'goog-6', email: null, name: null });
	});

	it('normalizes empty-string claims to null', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({
			claims: () => ({ sub: 'goog-7', preferred_username: '', name: '', email: '' })
		});
		const claims = await completeOidcCallback(cfg, new URL('https://app.test/cb?code=c'), {
			state: 's', nonce: 'n', codeVerifier: 'v'
		});
		expect(claims).toEqual({ sub: 'goog-7', email: null, name: null });
	});

	it('throws when the id_token has no claims', async () => {
		m.discovery.mockResolvedValue({ id: 'config' });
		m.authorizationCodeGrant.mockResolvedValue({ claims: () => undefined });
		await expect(
			completeOidcCallback(cfg, new URL('https://app.test/cb?code=c'), { state: 's', nonce: 'n', codeVerifier: 'v' })
		).rejects.toThrow(/claims/i);
	});
});
