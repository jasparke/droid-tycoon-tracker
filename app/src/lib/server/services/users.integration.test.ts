import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone } from '../testing/db';
import { findOrCreateOidcUser, createSession, validateSession, logout } from './users';
import { users, sessions } from '../schema';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => resetUserZone(sql));

describe('findOrCreateOidcUser', () => {
	it('creates a new user from claims', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'a@example.com', name: 'Ada' });
		expect(u.id).toBeGreaterThan(0);
		expect(u.username).toBe('Ada');
		const row = await db.query.users.findFirst({ where: eq(users.oidcSub, 'goog-1') });
		expect(row?.email).toBe('a@example.com');
	});

	it('is idempotent for a returning sub (same id, no duplicate row)', async () => {
		const first = await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'a@example.com', name: 'Ada' });
		const again = await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'a@example.com', name: 'Ada' });
		expect(again.id).toBe(first.id);
		expect(await db.select().from(users)).toHaveLength(1);
	});

	it('updates email on re-login when it changed', async () => {
		await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'old@example.com', name: 'Ada' });
		await findOrCreateOidcUser(db, { sub: 'goog-1', email: 'new@example.com', name: 'Ada' });
		const row = await db.query.users.findFirst({ where: eq(users.oidcSub, 'goog-1') });
		expect(row?.email).toBe('new@example.com');
	});

	it('dedupes username collisions across distinct subs', async () => {
		const a = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const b = await findOrCreateOidcUser(db, { sub: 'goog-2', name: 'Ada' });
		expect(a.username).toBe('Ada');
		expect(b.username).toBe('Ada-2');
	});

	it('derives a username from the email local part when name is absent', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-3', email: 'zed@example.com' });
		expect(u.username).toBe('zed');
	});

	it('falls back to "user" when neither name nor email is present', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-4' });
		expect(u.username).toBe('user');
	});

	it('caps an oversized IdP-derived username at 64 chars', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-long', name: 'x'.repeat(200) });
		expect(u.username).toBe('x'.repeat(64));
	});

	it('trims whitespace left at the cap cut', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-sp', name: 'a'.repeat(63) + ' b' });
		expect(u.username).toBe('a'.repeat(63));
	});

	it('never splits a surrogate pair at the cap cut', async () => {
		// 'a' + 40 rockets = 81 UTF-16 units; a plain slice(0, 64) would cut the
		// 32nd rocket in half, leaving a lone high surrogate at the end
		const u = await findOrCreateOidcUser(db, { sub: 'goog-emoji', name: 'a' + '🚀'.repeat(40) });
		expect(u.username).toBe('a' + '🚀'.repeat(31));
	});

	it('keeps collision-deduped usernames within the 64-char cap', async () => {
		const long = 'y'.repeat(200);
		const a = await findOrCreateOidcUser(db, { sub: 'goog-l1', name: long });
		const b = await findOrCreateOidcUser(db, { sub: 'goog-l2', name: long });
		expect(a.username).toBe('y'.repeat(64));
		expect(b.username).not.toBe(a.username);
		expect(b.username.length).toBeLessThanOrEqual(64);
		expect(b.username.endsWith('-2')).toBe(true);
	});
});

describe('sessions (unchanged behaviour, seeded via OIDC user)', () => {
	it('round-trips: createSession yields a token validateSession accepts', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		expect(await validateSession(db, token)).toMatchObject({ id: u.id, username: 'Ada' });
	});

	it('logout invalidates the token', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		await logout(db, token);
		expect(await validateSession(db, token)).toBeNull();
	});

	it('unknown token is null', async () => {
		expect(await validateSession(db, 'not-a-token')).toBeNull();
	});

	it('expired session is null and its row is deleted', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.token, sha256(token)));
		expect(await validateSession(db, token)).toBeNull();
		expect(await db.query.sessions.findFirst({ where: eq(sessions.token, sha256(token)) })).toBeUndefined();
	});

	it('stores only a hash of the token, never the raw value', async () => {
		const u = await findOrCreateOidcUser(db, { sub: 'goog-1', name: 'Ada' });
		const { token } = await createSession(db, u.id);
		const rows = await db.select().from(sessions);
		expect(rows).toHaveLength(1);
		expect(rows[0].token).toBe(sha256(token));
		expect(rows.some((r) => r.token === token)).toBe(false);
	});
});
