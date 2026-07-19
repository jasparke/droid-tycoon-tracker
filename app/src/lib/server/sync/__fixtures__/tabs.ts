function row(n: number, cells: Record<number, string>): string {
	const a = Array(n).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

export const DROID_CSV = [
	row(24, { 0: 'banner', 19: 'banner' }),
	row(24, { 19: 'UPGRADE COSTS' }),
	row(24, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'COST', 4: 'INCOME', 5: 'VALUE', 19: 'RARITY', 20: 'BASE -> GOLD', 21: 'GOLD -> DIAMOND', 22: 'DIAMOND -> RAINBOW', 23: 'RAINBOW -> BESKAR' }),
	row(24, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '950', 4: '2/s', 5: '665', 6: '3.8k', 7: '8/s', 8: '2.66k', 19: 'COMMON', 20: '5 CHIPS', 21: '25 CHIPS', 22: '40 CHIPS', 23: '80 CHIPS' }),
	row(24, { 19: 'ICONIC', 20: 'N/A', 21: 'N/A', 22: 'N/A', 23: 'N/A' }),
	row(24, { 19: 'DROID SELL VALUE' }),
	row(24, { 1: 'R2-D2', 2: 'ASTROMECH', 3: 'N/A', 4: '25%/s', 19: 'RARITY', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row(24, { 19: 'COMMON', 20: '4', 21: '7', 22: '10', 23: '13' }),
	row(24, { 19: 'FLAWLESS SPAWN PROBABILITY' }),
	row(24, { 19: 'DEFAULT', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row(24, { 19: '1/1000', 20: '1/500', 21: '1/250', 22: '1/125', 23: '1/100' })
].join('\n');

export const REBIRTH_CSV = [
	row(34, { 10: 'banner' }),
	row(34, { 10: 'REBIRTH REQUIRMENTS', 11: 'CREDITS', 12: 'DROID', 13: 'RARITY', 14: 'UNLOCKS', 15: 'FLAWLESS' }),
	row(34, { 10: '0->1', 11: '10K CREDITS', 12: 'BASIC CB', 13: 'COMMON', 14: 'Worker Slot' }),
	row(34, { 12: 'BASIC MOUSE' }),
	row(34, { 12: 'GOLD MONO-WALKER' })
].join('\n');

export const COSMETIC_CSV = [
	row(11, { 0: 'banner' }),
	row(11, { 0: 'HATS', 4: 'BASE PAINTS', 8: 'DROID EFFECTS' }),
	row(11, { 0: 'HAT', 1: 'REQUIREMENTS', 2: 'OWNED', 4: 'PAINT', 5: 'REQUIREMENTS', 6: 'OWNED', 8: 'EFFECT', 9: 'REQUIREMENTS', 10: 'OWNED' }),
	row(11, { 0: 'F1l-ON1', 1: 'FIND IN WORLD', 2: 'FALSE', 4: 'RED PAINT (DEFAULT', 5: 'NONE', 6: 'FALSE', 8: 'GROOVY AURA', 9: 'DJ R-3X EVENT', 10: 'FALSE' })
].join('\n');

export const NOVA_CSV = [
	row(33, { 0: 'banner' }),
	row(33, { 22: 'NOVA SHOP - COSMETICS' }),
	row(33, { 22: 'NOVA CRYSTAL COST', 29: 'INFORMATION' }),
	row(33, { 0: 'LEVEL', 1: 'Income Boost', 22: 'LEVEL', 23: 'NOVA CRYSTAL BASE PAINT', 29: 'note\nwith newline' }),
	row(33, { 0: '1', 1: '50', 22: '1', 23: '30' }),
	row(33, { 0: '2', 1: '120', 22: '2', 23: '120', 29: 'NOVA CRYSTALS/RB LEVEL' }),
	row(33, { 0: '3', 22: '3', 23: '400', 29: 'RB LEVEL', 30: 'CRYSTAL QUANTITY', 31: 'CREDIT MULT', 32: 'XP MULT' }),
	row(33, { 29: 'RB 12', 30: '11 NOVA CRYSTALS', 31: '22%', 32: '110%' })
].join('\n');

export const CSV_BY_GID = { '1248391507': DROID_CSV, '0': REBIRTH_CSV, '547464940': COSMETIC_CSV, '1548395368': NOVA_CSV };

// A reject-free minimal built payload for stage/apply integration tests (bypasses the parsers,
// so it isn't subject to buildPayload's 324-rebirth assert). validate() finds no rejects here.
import { checksumOf } from '../canonical.js';
import type { PayloadTables, Payload, Flag } from '../types';

export function validTables(): PayloadTables {
	return {
		droids: [{ name: 'MOUSE', rarity: 'Common', type: 'Worker', incomePct: null, buyNc: null }],
		droidTiers: [{ droid: 'MOUSE', tier: 'Base', buy: 1000, income: 2, sell: 700 }],
		rebirthReqs: [{ cycle: 1, rebirth: 1, droid: 'MOUSE', tier: 'Base', credits: '10K', unlock: null }],
		chipCosts: ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'].map((rarity) => ({ rarity, toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80 })),
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
