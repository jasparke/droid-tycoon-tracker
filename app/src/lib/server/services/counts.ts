import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { counts, droids } from '../schema';
import { ApiError } from '../api-error';
import { assertOwner } from './profiles';
import { isTier } from '$lib/game/tiers';

export async function setCount(
	db: Db, userId: number, profileId: number,
	cycle: number, droid: string, tier: string, n: number
) {
	await assertOwner(db, userId, profileId);
	if (!isTier(tier)) throw new ApiError(422, 'bad_tier', `Unknown tier: ${tier}`);
	if (!Number.isInteger(n) || n < 0) throw new ApiError(422, 'bad_count', 'n must be an integer >= 0');
	const d = await db.query.droids.findFirst({ where: eq(droids.name, droid) });
	if (!d) throw new ApiError(422, 'unknown_droid', `Unknown droid: ${droid}`);
	const where = and(
		eq(counts.profileId, profileId), eq(counts.cycle, cycle),
		eq(counts.droid, droid), eq(counts.tier, tier)
	);
	if (n === 0) {
		await db.delete(counts).where(where);
	} else {
		await db
			.insert(counts)
			.values({ profileId, cycle, droid, tier, n })
			.onConflictDoUpdate({ target: [counts.profileId, counts.cycle, counts.droid, counts.tier], set: { n } });
	}
	return { n };
}
