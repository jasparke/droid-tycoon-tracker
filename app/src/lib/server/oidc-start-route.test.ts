import { describe, it, expect, vi, beforeEach } from 'vitest';

const envState = vi.hoisted(() => ({ dev: false, priv: {} as Record<string, string | undefined> }));
vi.mock('$app/environment', () => ({
	get dev() {
		return envState.dev;
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: envState.priv }));
vi.mock('$lib/server/oidc', () => ({ buildOidcStart: vi.fn() }));

import { GET } from '../../routes/api/auth/oidc/start/+server';
import { buildOidcStart } from '$lib/server/oidc';

const start = vi.mocked(buildOidcStart);

function makeEvent() {
	const setCalls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
	const cookies = {
		set: (name: string, value: string, opts: Record<string, unknown>) =>
			void setCalls.push({ name, value, opts })
	};
	return { event: { cookies }, setCalls };
}

const callGET = (event: unknown) => GET(event as Parameters<typeof GET>[0]);

beforeEach(() => {
	vi.clearAllMocks();
	envState.dev = false;
	start.mockResolvedValue({
		authorizationUrl: 'https://idp.test/authorize?x=1',
		state: 'state-abc',
		nonce: 'nonce-def',
		codeVerifier: 'verifier-xyz'
	});
});

describe('GET /api/auth/oidc/start', () => {
	it('in production stashes the checks in __Host- cookies and redirects to the IdP', async () => {
		const { event, setCalls } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({ status: 302, location: 'https://idp.test/authorize?x=1' });
		expect(setCalls.map((c) => c.name).sort()).toEqual(['__Host-oidc_nonce', '__Host-oidc_state', '__Host-oidc_verifier']);
		for (const c of setCalls) {
			expect(c.opts).toMatchObject({ path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 600 });
		}
	});

	it('in dev keeps bare cookie names — browsers reject __Host- on plain http', async () => {
		envState.dev = true;
		const { event, setCalls } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({ status: 302 });
		expect(setCalls.map((c) => c.name).sort()).toEqual(['oidc_nonce', 'oidc_state', 'oidc_verifier']);
		for (const c of setCalls) expect(c.opts).toMatchObject({ secure: false });
	});
});
