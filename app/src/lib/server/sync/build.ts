import { parseDroidReference } from './parsers/droidReference';
import { parseRebirths } from './parsers/rebirths';
import { parseCosmetics } from './parsers/cosmetics';
import { parseNovaShop } from './parsers/novaShop';
import { parseCraftingCompanions } from './parsers/craftingCompanions';
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
	const cf = parseCraftingCompanions(csvByGid['1131770079']);

	const tables: PayloadTables = {
		droids: dr.droids, droidTiers: dr.droidTiers, chipCosts: dr.chipCosts,
		droidSellValues: dr.droidSellValues, flawlessSpawn: dr.flawlessSpawn,
		rebirthReqs: rb.rebirthReqs, cosmetics: cos.cosmetics,
		novaShop: nv.novaShop, rebirthMeta: nv.rebirthMeta, novaPaintStages: nv.novaPaintStages,
		craftingTimes: cf.craftingTimes, companionBuffs: cf.companionBuffs,
		iconicCompanionEffects: cf.iconicCompanionEffects
	};

	const flags = validate(tables, existingCountKeys);

	// cross-parser rebirth-shape assert: 30 rebirths × 4 cycles × 3 reqs
	if (tables.rebirthReqs.length !== 360) {
		flags.push({ kind: 'reject', code: 'rebirth_count', message: `expected 360 rebirth reqs, got ${tables.rebirthReqs.length}`, table: 'rebirthReqs' });
	}
	// live-sheet nova shop total: Featured 39 + Core 80 + Workshop 56. New shop levels legitimately
	// extend this — bump it deliberately after re-verifying the export, never to make a sync pass.
	if (tables.novaShop.length !== 175) {
		flags.push({ kind: 'reject', code: 'nova_row_count', message: `expected 175 nova shop rows, got ${tables.novaShop.length}`, table: 'novaShop' });
	}
	// The next three are the backstop behind parseCraftingCompanions' block scans: anchoring can
	// resolve cleanly and still lose a ladder or a whole block, and a short table looks well-formed.
	// Same rule as nova — bump one only after re-verifying the export, never to make a sync pass.
	// 70 droids × 6 tiers; Iconic and unpublished cells are null-valued rows, still counted here.
	if (tables.craftingTimes.length !== 420) {
		flags.push({ kind: 'reject', code: 'crafting_time_row_count', message: `expected 420 craft time rows, got ${tables.craftingTimes.length}`, table: 'craftingTimes' });
	}
	// 3 kinds (Worker/Astromech/Battle) × 6 rarities × 6 tiers
	if (tables.companionBuffs.length !== 108) {
		flags.push({ kind: 'reject', code: 'companion_buff_row_count', message: `expected 108 companion buff rows, got ${tables.companionBuffs.length}`, table: 'companionBuffs' });
	}
	// one row per iconic droid — the same 8 whose craft cells are N/A (8 × 6 = 48 of the 53 nulls)
	if (tables.iconicCompanionEffects.length !== 8) {
		flags.push({ kind: 'reject', code: 'iconic_effect_row_count', message: `expected 8 iconic companion effects, got ${tables.iconicCompanionEffects.length}`, table: 'iconicCompanionEffects' });
	}
	const roster = new Set(tables.droids.map((d) => d.name));
	for (const req of tables.rebirthReqs) {
		if (!roster.has(req.droid)) {
			flags.push({ kind: 'reject', code: 'unresolved_droid', message: `rebirth req droid "${req.droid}" not in roster`, table: 'rebirthReqs', key: `${req.cycle}/${req.rebirth}/${req.droid}` });
		}
	}
	// same no-FK reasoning as droidTiers: an unparsed/renamed droid would land as dead rows
	for (const c of tables.craftingTimes) {
		if (!roster.has(c.droid)) {
			flags.push({ kind: 'hold', code: 'unknown_droid', message: `craft time for "${c.droid}" (${c.tier}) has no roster entry`, table: 'craftingTimes', key: `${c.droid}/${c.tier}` });
		}
	}
	for (const e of tables.iconicCompanionEffects) {
		if (!roster.has(e.droid)) {
			flags.push({ kind: 'hold', code: 'unknown_droid', message: `iconic companion effect for "${e.droid}" has no roster entry`, table: 'iconicCompanionEffects', key: e.droid });
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
