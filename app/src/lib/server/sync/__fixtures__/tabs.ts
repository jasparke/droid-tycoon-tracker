function row(n: number, cells: Record<number, string>): string {
	const a = Array(n).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

export const DROID_CSV = [
	row(34, { 3: 'banner', 22: 'banner' }),
	row(34, { 3: 'BASE', 6: 'GOLD', 9: 'DIAMOND', 12: 'RAINBOW', 15: 'BESKAR', 18: 'GALACTIC', 22: 'UPGRADE COSTS' }),
	row(34, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'COST', 4: 'INCOME', 5: 'VALUE', 22: 'RARITY', 23: 'BASE -> GOLD', 24: 'GOLD -> DIAMOND', 25: 'DIAMOND -> RAINBOW', 26: 'RAINBOW -> BESKAR', 27: 'BESKAR -> GALACTIC' }),
	row(34, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '950', 4: '2/s', 5: '665', 6: '3.8k', 7: '4/s', 8: '2.66k', 18: '19.00k', 19: '48/s', 22: 'COMMON', 23: '5', 24: '25', 25: '40', 26: '80', 27: '120' }),
	row(34, { 22: 'ICONIC', 23: 'N/A', 24: 'N/A', 25: 'N/A', 26: 'N/A', 27: 'N/A' }),
	row(34, { 22: 'DROID SELL VALUE' }),
	row(34, { 1: 'R2-D2', 2: 'ASTROMECH', 3: 'N/A', 4: '25%/s', 22: 'RARITY', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row(34, { 22: 'COMMON', 23: '4', 24: '7', 25: '10', 26: '13', 27: '16' }),
	row(34, { 22: 'FLAWLESS SPAWN PROBABILITY' }),
	row(34, { 22: 'DEFAULT', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row(34, { 22: '1/1000', 23: '1/500', 24: '1/250', 25: '1/125', 26: '1/100' })
].join('\n');

export const REBIRTH_CSV = [
	row(40, { 11: 'banner' }),
	row(40, { 0: 'RARITY', 1: 'DROID', 11: 'REBIRTH REQUIRMENTS', 15: 'UNLOCKS', 19: 'REBIRTH REQUIRMENTS 2' }),
	row(40, { 11: '0->1', 12: '10K CREDITS', 13: 'BASIC CB', 14: 'COMMON', 15: ' WORKER SLOT', 19: '0->1', 20: '12K CREDITS', 21: 'GOLD R9' }),
	row(40, { 13: 'BASIC MOUSE', 21: 'BASIC BB-9' }),
	row(40, { 13: 'GOLD MONO-WALKER', 21: 'DEFAULT TRI-TEK' })
].join('\n');

export const COSMETIC_CSV = [
	row(14, { 0: 'banner' }),
	row(14, { 0: 'HATS', 7: 'BASE PAINTS', 11: 'DROID EFFECTS' }),
	row(14, { 0: 'HAT', 1: 'REQUIREMENTS', 2: 'BASIC', 3: 'GOLD', 4: 'DIAMOND', 5: 'RAINBOW', 7: 'PAINT', 8: 'REQUIREMENTS', 9: 'OWNED', 11: 'EFFECT', 12: 'REQUIREMENTS', 13: 'OWNED' }),
	row(14, { 0: 'F1l-ON1', 1: 'FIND IN WORLD', 2: 'FALSE', 3: 'FALSE', 4: 'FALSE', 5: 'FALSE', 7: 'RED PAINT (DEFAULT', 8: 'NONE', 9: 'FALSE', 11: 'GROOVY AURA', 12: 'DJ R-3X EVENT', 13: 'FALSE' })
].join('\n');

export const NOVA_CSV = [
	row(38, { 5: 'banner' }),
	row(38, { 0: 'NOVA SHOP - FEATURED', 5: 'NOVA SHOP - CORE UPGRADES', 27: 'NOVA SHOP - COSMETICS' }),
	row(38, { 0: 'NOVA CRYSTAL COST', 5: 'NOVA CRYSTAL COST', 27: 'NOVA CRYSTAL COST', 34: 'INFORMATION' }),
	row(38, { 0: 'LEVEL', 1: 'CRITICAL CHANCE', 5: 'LEVEL', 6: 'MAX HEALTH', 16: 'LEVEL', 17: 'LOUNGE SLOT', 27: 'LEVEL', 28: 'NOVA CRYSTAL BASE PAINT', 34: 'note\nwith newline' }),
	row(38, { 0: '1', 1: '60', 5: '1', 6: '1', 16: '1', 17: '1', 27: '1', 28: '30' }),
	row(38, { 0: '2', 1: '90', 5: '2', 6: '6', 16: '2', 17: '30', 27: '2', 28: '120', 34: 'NOVA CRYSTALS/RB LEVEL' }),
	row(38, { 0: '3', 5: '3', 6: '13', 16: '3', 17: '60', 27: '3', 28: '400', 34: 'RB LEVEL', 35: 'CRYSTAL QUANTITY', 36: 'CREDIT MULT', 37: 'XP MULT' }),
	row(38, { 34: 'RB 12', 35: '11 NOVA CRYSTALS', 36: '22%', 37: '110%' })
].join('\n');

export const CSV_BY_GID = { '1248391507': DROID_CSV, '0': REBIRTH_CSV, '547464940': COSMETIC_CSV, '1548395368': NOVA_CSV };

// A reject-free minimal built payload for stage/apply integration tests (bypasses the parsers,
// so it isn't subject to buildPayload's 360-rebirth assert). validate() finds no rejects here.
import { checksumOf } from '../canonical.js';
import type { PayloadTables, Payload, Flag } from '../types';

export function validTables(): PayloadTables {
	return {
		droids: [{ name: 'MOUSE', rarity: 'Common', type: 'Worker', incomePct: null, buyNc: null }],
		droidTiers: [{ droid: 'MOUSE', tier: 'Base', buy: 1000, income: 2, sell: 700 }],
		rebirthReqs: [{ cycle: 1, rebirth: 1, droid: 'MOUSE', tier: 'Base', credits: '10K', unlock: null }],
		chipCosts: ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'].map((rarity) => ({ rarity, toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80, toGalactic: 120 })),
		rebirthMeta: [{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 }],
		novaShop: [], cosmetics: [{ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' }],
		droidSellValues: [{ rarity: 'Common', tier: 'Gold', multiplier: 4 }],
		flawlessSpawn: [{ tier: 'Base', oneIn: 1000 }], novaPaintStages: [{ stage: 1, crystalCost: 30 }]
	};
}
export function validBuilt(extraFlags: Flag[] = []): { payload: Payload; flags: Flag[]; checksum: string } {
	const tables = validTables();
	const payload: Payload = { meta: { source: 'test', fetchedAt: 't', tabChecksums: {}, rowCounts: {}, orphanReport: [] }, tables };
	return { payload, flags: extraFlags, checksum: checksumOf(tables as unknown as Record<string, unknown[]>) };
}
