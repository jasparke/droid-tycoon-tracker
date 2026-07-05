import { randomBytes, createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { eq, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { users, sessions } from '../schema';
import { ApiError } from '../api-error';

const SESSION_DAYS = 30;

// session tokens are stored hashed so a DB leak yields no usable credentials
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// hash of a throwaway string; verified for unknown users so login latency doesn't reveal username existence
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$winwLiBhdA0z9MbskKV2Lg$41e8zS9FXUSr5XUm2pibON0+4/7U+V9HxZWz3ye2dFs';

export async function register(
	db: Db,
	input: { username: string; password: string; inviteCode: string },
	expectedInvite: string
) {
	if (!expectedInvite)
		throw new ApiError(503, 'invite_unconfigured', 'Registration is not configured on this server');
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
	await db.insert(sessions).values({ token: hashToken(token), userId, expiresAt });
	return { token, expiresAt };
}

export async function login(db: Db, input: { username: string; password: string }) {
	const u = await db.query.users.findFirst({ where: eq(users.username, input.username ?? '') });
	const ok = await verify(u?.pwHash ?? DUMMY_HASH, input.password ?? '');
	if (!u || !ok) throw new ApiError(401, 'bad_credentials', 'Wrong username or password');
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
	const s = await createSession(db, u.id);
	return { user: { id: u.id, username: u.username }, ...s };
}

export async function validateSession(db: Db, token: string) {
	const digest = hashToken(token);
	const s = await db.query.sessions.findFirst({ where: eq(sessions.token, digest) });
	if (!s) return null;
	if (s.expiresAt < new Date()) {
		await db.delete(sessions).where(eq(sessions.token, digest));
		return null;
	}
	const u = await db.query.users.findFirst({ where: eq(users.id, s.userId) });
	return u ? { id: u.id, username: u.username } : null;
}

export async function logout(db: Db, token: string) {
	await db.delete(sessions).where(eq(sessions.token, hashToken(token)));
}
