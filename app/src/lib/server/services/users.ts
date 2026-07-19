import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { users, sessions } from '../schema';

const SESSION_DAYS = 30;

// session tokens are stored hashed so a DB leak yields no usable credentials
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const PG_UNIQUE_VIOLATION = '23505';
const pgCode = (e: unknown) =>
	(e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;

// usernames are IdP-derived and unbounded at the schema level (text column),
// so the length invariant lives here: base and deduped forms both fit the cap
const USERNAME_MAX = 64;

// a cap cut can land mid-surrogate-pair or leave boundary whitespace — tidy both
function cleanCut(s: string): string {
	const last = s.charCodeAt(s.length - 1);
	return (last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s).trim();
}

// derive a friendly, non-empty display handle from the IdP claims
function baseUsername(input: { email?: string | null; name?: string | null }): string {
	const fromName = cleanCut((input.name ?? '').trim().slice(0, USERNAME_MAX));
	if (fromName) return fromName;
	const local = cleanCut((input.email?.split('@')[0] ?? '').trim().slice(0, USERNAME_MAX));
	if (local) return local;
	return 'user';
}

// `${base}-${n}` truncated so the suffix survives and the whole stays ≤ USERNAME_MAX
function suffixedUsername(base: string, n: number): string {
	const suffix = `-${n}`;
	return cleanCut(base.slice(0, USERNAME_MAX - suffix.length)) + suffix;
}

/**
 * Upsert a user keyed by the stable OIDC subject.
 * - returning sub: refresh email if changed; username stays stable (unique invariant).
 * - new sub: insert with a collision-deduped username.
 */
export async function findOrCreateOidcUser(
	db: Db,
	input: { sub: string; email?: string | null; name?: string | null }
): Promise<{ id: number; username: string }> {
	const existing = await db.query.users.findFirst({ where: eq(users.oidcSub, input.sub) });
	if (existing) {
		if (input.email != null && input.email !== existing.email) {
			await db.update(users).set({ email: input.email }).where(eq(users.id, existing.id));
		}
		return { id: existing.id, username: existing.username };
	}

	const base = baseUsername(input);
	for (let attempt = 0; attempt < 100; attempt++) {
		const username = attempt === 0 ? base : suffixedUsername(base, attempt + 1);
		try {
			const [u] = await db
				.insert(users)
				.values({ oidcSub: input.sub, username, email: input.email ?? null })
				.returning();
			return { id: u.id, username: u.username };
		} catch (e: unknown) {
			if (pgCode(e) !== PG_UNIQUE_VIOLATION) throw e;
			// A racing login may have created this sub concurrently — prefer the winner.
			const now = await db.query.users.findFirst({ where: eq(users.oidcSub, input.sub) });
			if (now) return { id: now.id, username: now.username };
			// else it was a username collision — loop and try the next suffix.
		}
	}
	throw new Error('findOrCreateOidcUser: exhausted username dedup attempts');
}

export async function createSession(db: Db, userId: number) {
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
	await db.insert(sessions).values({ token: hashToken(token), userId, expiresAt });
	return { token, expiresAt };
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
