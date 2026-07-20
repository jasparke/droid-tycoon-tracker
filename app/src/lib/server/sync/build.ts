import { parseDroidReference } from './parsers/droidReference';
import { parseRebirths } from './parsers/rebirths';
import { parseCosmetics } from './parsers/cosmetics';
import { parseNovaShop } from './parsers/novaShop';
import { validate } from './validate';
import { checksumOf } from './canonical.js';
import { createHash } from 'node:crypto';
import type { Payload, PayloadTables, Flag } from './types';

export function buildPayload(
	csvByGid: Record<string, string>,
	existingCountKeys: { droid: string; tier: string; profileId: number }[],
	source: string,
	fetchedAt: string
): { payload: Payload; flags: Flag[]; checksum: string } {
	const dr = parseDroidReference(csvByGid['1248391507']);
	const rb = parseRebirths(csvByGid['0']);
	const cos = parseCosmetics(csvByGid['547464940']);
	const nv = parseNovaShop(csvByGid['1548395368']);

	const tables: PayloadTables = {
		droids: dr.droids, droidTiers: dr.droidTiers, chipCosts: dr.chipCosts,
		droidSellValues: dr.droidSellValues, flawlessSpawn: dr.flawlessSpawn,
		rebirthReqs: rb.rebirthReqs, cosmetics: cos.cosmetics,
		novaShop: nv.novaShop, rebirthMeta: nv.rebirthMeta, novaPaintStages: nv.novaPaintStages
	};

	const flags = validate(tables, existingCountKeys);

	// cross-parser rebirth-shape assert: 30 rebirths × 4 cycles × 3 reqs
	if (tables.rebirthReqs.length !== 360) {
		flags.push({ kind: 'reject', code: 'rebirth_count', message: `expected 360 rebirth reqs, got ${tables.rebirthReqs.length}`, table: 'rebirthReqs' });
	}
	const roster = new Set(tables.droids.map((d) => d.name));
	for (const req of tables.rebirthReqs) {
		if (!roster.has(req.droid)) {
			flags.push({ kind: 'reject', code: 'unresolved_droid', message: `rebirth req droid "${req.droid}" not in roster`, table: 'rebirthReqs', key: `${req.cycle}/${req.rebirth}/${req.droid}` });
		}
	}

	const tabChecksums: Record<string, string> = {};
	for (const [gid, csv] of Object.entries(csvByGid)) tabChecksums[gid] = createHash('sha256').update(csv).digest('hex');
	const rowCounts: Record<string, number> = {};
	for (const [name, rows] of Object.entries(tables)) rowCounts[name] = (rows as unknown[]).length;

	const checksum = checksumOf(tables as unknown as Record<string, unknown[]>);
	const orphanReport = flags.filter((f) => f.code === 'orphan_count').map((f) => {
		const [droid, tier] = (f.key ?? '/').split('/');
		return { droid, tier, profileId: 0 };
	});
	const payload: Payload = { meta: { source, fetchedAt, tabChecksums, rowCounts, orphanReport }, tables };
	return { payload, flags, checksum };
}
