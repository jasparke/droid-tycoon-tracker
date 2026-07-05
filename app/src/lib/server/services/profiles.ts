import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { profiles, users } from '../schema';
import { ApiError } from '../api-error';

const INT4_MAX = 2_147_483_647;

// patch fields arrive from untrusted JSON; keep them in int4 range before they reach Postgres
function intField(value: unknown, name: string, min: number): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > INT4_MAX)
		throw new ApiError(422, 'invalid_input', `${name} must be an integer between ${min} and ${INT4_MAX}`);
	return value;
}

export async function assertOwner(db: Db, userId: number, profileId: number) {
	const p = await db.query.profiles.findFirst({ where: eq(profiles.id, profileId) });
	if (!p) throw new ApiError(404, 'not_found', 'Profile not found');
	if (p.userId !== userId) throw new ApiError(403, 'not_owner', 'Not your profile');
	return p;
}

export async function listAllProfiles(db: Db) {
	const rows = await db
		.select({
			id: profiles.id, userId: profiles.userId, owner: users.username, name: profiles.name,
			cycle: profiles.cycle, currentRebirth: profiles.currentRebirth, prefs: profiles.prefs
		})
		.from(profiles)
		.innerJoin(users, eq(users.id, profiles.userId));
	return rows;
}

export async function createProfile(db: Db, userId: number, input: { name: string }) {
	const name = input.name?.trim() ?? '';
	if (!name) throw new ApiError(422, 'invalid_input', 'Profile name required');
	const [p] = await db.insert(profiles).values({ userId, name }).returning();
	return p;
}

export async function updateProfile(
	db: Db, userId: number, profileId: number,
	patch: { name?: string; cycle?: number; currentRebirth?: number; prefs?: unknown }
) {
	await assertOwner(db, userId, profileId);
	const allowed: Record<string, unknown> = {};
	if (patch.name !== undefined) allowed.name = String(patch.name).trim();
	if (patch.cycle !== undefined) allowed.cycle = intField(patch.cycle, 'cycle', 1);
	if (patch.currentRebirth !== undefined) allowed.currentRebirth = intField(patch.currentRebirth, 'currentRebirth', 0);
	if (patch.prefs !== undefined) {
		if (typeof patch.prefs !== 'object' || patch.prefs === null || Array.isArray(patch.prefs))
			throw new ApiError(422, 'invalid_input', 'prefs must be a plain object');
		allowed.prefs = patch.prefs;
	}
	if (allowed.name === '') throw new ApiError(422, 'invalid_input', 'Profile name required');
	const [p] = await db.update(profiles).set(allowed).where(eq(profiles.id, profileId)).returning();
	return p;
}

export async function deleteProfile(db: Db, userId: number, profileId: number) {
	await assertOwner(db, userId, profileId);
	await db.delete(profiles).where(eq(profiles.id, profileId));
}
