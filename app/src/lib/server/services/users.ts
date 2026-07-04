import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { users, sessions } from '../schema';
import { ApiError } from '../api-error';

const SESSION_DAYS = 30;

export async function register(
	db: Db,
	input: { username: string; password: string; inviteCode: string },
	expectedInvite: string
) {
	if (input.inviteCode !== expectedInvite) throw new ApiError(403, 'bad_invite', 'Invalid invite code');
	const username = input.username?.trim() ?? '';
	if (username.length < 2 || (input.password?.length ?? 0) < 8)
		throw new ApiError(422, 'invalid_input', 'Username min 2 chars, password min 8');
	const pwHash = await hash(input.password);
	try {
		const [u] = await db.insert(users).values({ username, pwHash }).returning();
		return { id: u.id, username: u.username };
	} catch (e: unknown) {
		const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
		if (code === '23505') throw new ApiError(409, 'username_taken', 'Username already exists');
		throw e;
	}
}

export async function createSession(db: Db, userId: number) {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
	await db.insert(sessions).values({ token, userId, expiresAt });
	return { token, expiresAt };
}

export async function login(db: Db, input: { username: string; password: string }) {
	const u = await db.query.users.findFirst({ where: eq(users.username, input.username ?? '') });
	if (!u || !(await verify(u.pwHash, input.password ?? '')))
		throw new ApiError(401, 'bad_credentials', 'Wrong username or password');
	const s = await createSession(db, u.id);
	return { user: { id: u.id, username: u.username }, ...s };
}

export async function validateSession(db: Db, token: string) {
	const s = await db.query.sessions.findFirst({ where: eq(sessions.token, token) });
	if (!s) return null;
	if (s.expiresAt < new Date()) {
		await db.delete(sessions).where(eq(sessions.token, token));
		return null;
	}
	const u = await db.query.users.findFirst({ where: eq(users.id, s.userId) });
	return u ? { id: u.id, username: u.username } : null;
}

export async function logout(db: Db, token: string) {
	await db.delete(sessions).where(eq(sessions.token, token));
}
