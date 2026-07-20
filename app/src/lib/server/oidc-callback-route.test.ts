import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The callback route's error handling is what's under test, so every collaborator
// (OIDC exchange, user service, db, SvelteKit env) is mocked; the mocks are the
// only way to make the exchange / upsert / session-mint steps fail on demand.
const envState = vi.hoisted(() => ({
	dev: false,
	priv: {} as Record<string, string | undefined>,
	pub: {} as Record<string, string | undefined>
}));

vi.mock('$app/environment', () => ({
	get dev() {
		return envState.dev;
	}
}));
vi.mock('$env/dynamic/private', () => ({ env: envState.priv }));
vi.mock('$env/dynamic/public', () => ({ env: envState.pub }));
vi.mock('$lib/server/db', () => ({ db: { __tag: 'db' } }));
vi.mock('$lib/server/oidc', () => ({ completeOidcCallback: vi.fn() }));
vi.mock('$lib/server/services/users', () => ({
	findOrCreateOidcUser: vi.fn(),
	createSession: vi.fn()
}));

import { redirect } from '@sveltejs/kit';
import { GET } from '../../routes/api/auth/oidc/callback/+server';
import { completeOidcCallback } from '$lib/server/oidc';
import { findOrCreateOidcUser, createSession } from '$lib/server/services/users';

const exchange = vi.mocked(completeOidcCallback);
const upsertUser = vi.mocked(findOrCreateOidcUser);
const mintSession = vi.mocked(createSession);

const CLAIMS = { sub: 'goog-1', email: 'a@example.com', name: 'Ada' };

// prod uses __Host- names (dev can't: the prefix requires https); jar keys follow envState.dev
const cookieName = (base: string) => (envState.dev ? base : `__Host-${base}`);

function makeEvent(url = 'http://localhost:4173/api/auth/oidc/callback?code=c&state=state-abc') {
	const jar = new Map([
		[cookieName('oidc_state'), 'state-abc'],
		[cookieName('oidc_nonce'), 'nonce-def'],
		[cookieName('oidc_verifier'), 'verifier-xyz']
	]);
	const setCalls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
	const cookies = {
		get: (n: string) => jar.get(n),
		delete: (n: string) => void jar.delete(n),
		set: (n: string, value: string, opts: Record<string, unknown>) =>
			void setCalls.push({ name: n, value, opts })
	};
	return { event: { url: new URL(url), cookies }, setCalls, jar };
}

const callGET = (event: unknown) => GET(event as Parameters<typeof GET>[0]);

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	vi.clearAllMocks();
	envState.dev = false;
	envState.pub.PUBLIC_BASE_URL = 'http://localhost:4173';
	errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	exchange.mockResolvedValue(CLAIMS);
	upsertUser.mockResolvedValue({ id: 1, username: 'Ada' });
	mintSession.mockResolvedValue({ token: 'tok', expiresAt: new Date(Date.now() + 1000) });
});
afterEach(() => errorSpy.mockRestore());

describe('GET /api/auth/oidc/callback error handling', () => {
	// pins the pre-existing happy path so the try/catch restructuring can't regress it
	it('happy path: mints a session cookie and redirects to /checklist', async () => {
		const { event, setCalls } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({ status: 303, location: '/checklist' });
		expect(setCalls).toHaveLength(1);
		expect(setCalls[0]).toMatchObject({ name: 'session', value: 'tok' });
	});

	it('in production the temp cookies are read and cleared under their __Host- names', async () => {
		const { event, jar } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({ status: 303, location: '/checklist' });
		expect(exchange.mock.calls[0][2]).toEqual({ state: 'state-abc', nonce: 'nonce-def', codeVerifier: 'verifier-xyz' });
		expect([...jar.keys()]).toHaveLength(0); // all three deleted under the prefixed names
	});

	it('a user-upsert failure redirects to /login?error=oidc_internal instead of a raw 500', async () => {
		upsertUser.mockRejectedValue(new Error('db down'));
		const { event } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({
			status: 303,
			location: '/login?error=oidc_internal'
		});
		expect(errorSpy).toHaveBeenCalled();
	});

	it('a Redirect thrown inside the persistence block propagates instead of becoming oidc_internal', async () => {
		// guards the catch against swallowing SvelteKit control flow if a future
		// edit adds a redirect() inside the try
		let thrownRedirect: unknown;
		try {
			redirect(303, '/somewhere-else');
		} catch (e) {
			thrownRedirect = e;
		}
		upsertUser.mockRejectedValue(thrownRedirect);
		const { event } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({
			status: 303,
			location: '/somewhere-else'
		});
	});

	it('a session-mint failure redirects to /login?error=oidc_internal instead of a raw 500', async () => {
		mintSession.mockRejectedValue(new Error('db down'));
		const { event, setCalls } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({
			status: 303,
			location: '/login?error=oidc_internal'
		});
		expect(setCalls).toHaveLength(0);
	});

	it('a token-exchange failure still redirects to oidc_exchange, and is logged (not silent)', async () => {
		exchange.mockRejectedValue(new Error('idp unreachable'));
		const { event } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({
			status: 303,
			location: '/login?error=oidc_exchange'
		});
		expect(errorSpy).toHaveBeenCalled();
	});
});

describe('PUBLIC_BASE_URL fail-fast', () => {
	it('in production an unset PUBLIC_BASE_URL is a hard, logged 500 — never a silent Host-header fallback', async () => {
		envState.pub.PUBLIC_BASE_URL = undefined;
		const { event } = makeEvent();
		await expect(callGET(event)).rejects.toMatchObject({ status: 500 });
		expect(errorSpy).toHaveBeenCalled();
		expect(exchange).not.toHaveBeenCalled();
	});

	// pins the dev fallback: bare `vite dev` keeps working without a .env
	it('in dev an unset PUBLIC_BASE_URL falls back to the request origin', async () => {
		envState.dev = true;
		envState.pub.PUBLIC_BASE_URL = undefined;
		const { event } = makeEvent('http://localhost:5173/api/auth/oidc/callback?code=c&state=state-abc');
		await expect(callGET(event)).rejects.toMatchObject({ status: 303, location: '/checklist' });
		const currentUrl = exchange.mock.calls[0][1];
		expect(currentUrl.origin).toBe('http://localhost:5173');
	});
});
