import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone } from '../testing/db';
import { register, login, validateSession, logout } from './users';
import { ApiError } from '../api-error';
import { sessions } from '../schema';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => resetUserZone(sql));

const INVITE = 'sekrit';
const good = { username: 'jasparke', password: 'hunter2hunter2', inviteCode: INVITE };

describe('register', () => {
	it('creates a user with a valid invite', async () => {
		const u = await register(db, good, INVITE);
		expect(u.username).toBe('jasparke');
	});
	it('rejects a bad invite with 403', async () => {
		await expect(register(db, { ...good, inviteCode: 'nope' }, INVITE)).rejects.toMatchObject({
			status: 403, code: 'bad_invite'
		});
	});
	it('rejects duplicate username with 409', async () => {
		await register(db, good, INVITE);
		await expect(register(db, good, INVITE)).rejects.toMatchObject({ status: 409 });
	});
	it('rejects short password with 422', async () => {
		await expect(register(db, { ...good, password: 'short' }, INVITE)).rejects.toBeInstanceOf(ApiError);
	});
});

describe('login + sessions', () => {
	it('round-trips: login yields a token validateSession accepts', async () => {
		await register(db, good, INVITE);
		const { token, user } = await login(db, { username: 'jasparke', password: good.password });
		expect(await validateSession(db, token)).toMatchObject({ id: user.id, username: 'jasparke' });
	});
	it('rejects wrong password with 401', async () => {
		await register(db, good, INVITE);
		await expect(login(db, { username: 'jasparke', password: 'wrongwrong' })).rejects.toMatchObject({
			status: 401
		});
	});
	it('logout invalidates the token', async () => {
		await register(db, good, INVITE);
		const { token } = await login(db, { username: 'jasparke', password: good.password });
		await logout(db, token);
		expect(await validateSession(db, token)).toBeNull();
	});
	it('unknown token is null', async () => {
		expect(await validateSession(db, 'not-a-token')).toBeNull();
	});
	it('expired session is null and its row is deleted', async () => {
		await register(db, good, INVITE);
		const { token } = await login(db, { username: 'jasparke', password: good.password });
		await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.token, token));
		expect(await validateSession(db, token)).toBeNull();
		expect(await db.query.sessions.findFirst({ where: eq(sessions.token, token) })).toBeUndefined();
	});
});
