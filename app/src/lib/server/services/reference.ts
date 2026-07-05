import { desc } from 'drizzle-orm';
import type { Db } from '../db';
import {
	droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, dataVersions
} from '../schema';

export async function getReference(db: Db) {
	const [d, dt, rr, cc, rm, ns, cos, ver] = await Promise.all([
		db.select().from(droids),
		db.select().from(droidTiers),
		db.select().from(rebirthReqs),
		db.select().from(chipCosts),
		db.select().from(rebirthMeta),
		db.select().from(novaShop),
		db.select().from(cosmetics),
		db.select().from(dataVersions).orderBy(desc(dataVersions.id)).limit(1)
	]);
	return {
		version: ver[0] ?? null,
		droids: d, droidTiers: dt, rebirthReqs: rr, chipCosts: cc,
		rebirthMeta: rm, novaShop: ns, cosmetics: cos
	};
}
