import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { plans } from '../schema';
import { ApiError } from '../api-error';
import { assertOwner } from './profiles';

export async function replacePlan(
	db: Db, userId: number, profileId: number, cycle: number, rebirths: number[]
) {
	await assertOwner(db, userId, profileId);
	if (!Array.isArray(rebirths) || rebirths.some((r) => !Number.isInteger(r) || r < 1 || r > 27))
		throw new ApiError(422, 'bad_rebirth', 'rebirths must be integers 1-27');
	const uniq = [...new Set(rebirths)];
	await db.transaction(async (tx) => {
		await tx.delete(plans).where(and(eq(plans.profileId, profileId), eq(plans.cycle, cycle)));
		if (uniq.length)
			await tx.insert(plans).values(uniq.map((rebirth) => ({ profileId, cycle, rebirth })));
	});
	return { rebirths: uniq };
}
