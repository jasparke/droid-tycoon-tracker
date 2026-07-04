import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { counts, droids, plans, profiles } from '../schema';
import { ApiError } from '../api-error';
import { isTier } from '$lib/game/tiers';

type PrototypeProfile = {
	name?: string; cycle?: number; current?: number;
	counts?: Record<string, number>; plan?: Record<string, number[]>;
	hidePast?: boolean; gapsOpen?: Record<string, boolean>;
};

export async function importCode(db: Db, userId: number, code: string) {
	let proto: PrototypeProfile;
	try {
		const raw = JSON.parse(Buffer.from(String(code).trim().replace(/^#/, ''), 'base64').toString('utf8'));
		if (raw?.__dt !== 1 || typeof raw.profile !== 'object' || raw.profile == null) throw new Error();
		proto = raw.profile;
	} catch {
		throw new ApiError(422, 'bad_code', 'Not a valid tracker export code');
	}
	const known = new Set((await db.select({ name: droids.name }).from(droids)).map((r) => r.name));
	const skipped = new Set<string>();
	const countRows: { cycle: number; droid: string; tier: string; n: number }[] = [];
	for (const [key, n] of Object.entries(proto.counts ?? {})) {
		const [cy, droid, tier] = key.split('|');
		if (!known.has(droid)) { skipped.add(droid); continue; }
		if (!isTier(tier) || !Number.isInteger(n) || n <= 0) { skipped.add(droid); continue; }
		countRows.push({ cycle: Number(cy), droid, tier, n });
	}
	return await db.transaction(async (tx) => {
		const [p] = await tx.insert(profiles).values({
			userId,
			name: String(proto.name ?? 'Imported').slice(0, 64),
			cycle: Number.isInteger(proto.cycle) ? (proto.cycle as number) : 1,
			currentRebirth: Number.isInteger(proto.current) ? (proto.current as number) : 0,
			prefs: { hidePast: proto.hidePast ?? true, gapsOpen: proto.gapsOpen ?? {} }
		}).returning();
		if (countRows.length)
			await tx.insert(counts).values(countRows.map((r) => ({ ...r, profileId: p.id })));
		const planRows = Object.entries(proto.plan ?? {}).flatMap(([cy, arr]) =>
			(Array.isArray(arr) ? arr : [])
				.filter((r) => Number.isInteger(r) && r >= 1 && r <= 27)
				.map((rebirth) => ({ profileId: p.id, cycle: Number(cy), rebirth }))
		);
		if (planRows.length) await tx.insert(plans).values(planRows);
		return { profileId: p.id, name: p.name, imported: countRows.length, skipped: [...skipped] };
	});
}
