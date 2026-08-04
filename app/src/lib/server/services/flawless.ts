import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { flawlessOwned, droids } from '../schema';
import { ApiError } from '../api-error';
import { assertOwner } from './profiles';
import { isFlawlessEligible } from '$lib/game/flawless';

// Row presence = owned (same idiom as `plans`); owned:false deletes.
export async function setFlawless(db: Db, userId: number, profileId: number, droid: string, owned: boolean) {
	await assertOwner(db, userId, profileId);
	const d = await db.query.droids.findFirst({ where: eq(droids.name, droid) });
	if (!d) throw new ApiError(422, 'unknown_droid', `Unknown droid: ${droid}`);
	if (!isFlawlessEligible(d)) {
		throw new ApiError(422, 'not_flawless_eligible', `${droid} is Iconic — it has no flawless variant`);
	}
	if (owned) {
		await db.insert(flawlessOwned).values({ profileId, droid }).onConflictDoNothing();
	} else {
		await db.delete(flawlessOwned).where(and(eq(flawlessOwned.profileId, profileId), eq(flawlessOwned.droid, droid)));
	}
	return { owned };
}

export async function listFlawless(db: Db, profileId: number): Promise<string[]> {
	const rows = await db
		.select({ droid: flawlessOwned.droid })
		.from(flawlessOwned)
		.where(eq(flawlessOwned.profileId, profileId))
		.orderBy(asc(flawlessOwned.droid));
	return rows.map((r) => r.droid);
}
