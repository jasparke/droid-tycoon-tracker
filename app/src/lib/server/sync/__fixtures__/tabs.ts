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
	row(34, { 22: 'RARE', 23: '30', 24: '60', 25: '100', 26: '250', 27: '400' }),
	row(34, { 22: 'EPIC', 23: '120', 24: '180', 25: '240', 26: '3,000', 27: '6,000' }),
	row(34, { 22: 'LEGENDARY', 23: '400', 24: '1,200', 25: '3,000', 26: '7,500', 27: '20,000' }),
	row(34, { 22: 'MYTHIC', 23: '4,000', 24: '8,000', 25: '20,000', 26: '40,000', 27: '70,000' }),
	row(34, { 22: 'ICONIC', 23: 'N/A', 24: 'N/A', 25: 'N/A', 26: 'N/A', 27: 'N/A' }),
	row(34, {}),                          // separator: blank col 22 ends the UPGRADE COSTS block
	row(34, { 22: 'DROID SELL VALUE' }),
	row(34, { 1: 'R2-D2', 2: 'ASTROMECH', 3: 'N/A', 4: '25%/s', 22: 'RARITY', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row(34, { 22: 'COMMON', 23: '4', 24: '7', 25: '10', 26: '13', 27: '16' }),
	row(34, {}),                          // separator: ends the DROID SELL VALUE block
	row(34, { 22: 'FLAWLESS SPAWN PROBABILITY' }),
	row(34, { 22: 'DEFAULT', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row(34, { 22: '1/1000', 23: '1/500', 24: '1/250', 25: '1/125', 26: '1/100', 27: '1/75' })
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
	row(40, { 7: 'banner' }),
	row(40, { 0: 'NOVA SHOP - FEATURED', 7: 'NOVA SHOP - CORE UPGRADES', 18: 'NOVA SHOP - WORKSHOP UPGRADES', 29: 'NOVA SHOP - COSMETICS' }),
	row(40, { 0: 'NOVA CRYSTAL COST', 8: 'NOVA CRYSTAL COST', 19: 'NOVA CRYSTAL COST', 29: 'NOVA CRYSTAL COST', 36: 'INFORMATION' }),
	row(40, { 0: 'LEVEL', 1: 'CRITICAL CHANCE', 2: 'CRITICAL AMOUNT', 3: 'COMPANION SLOT', 4: 'UPGRADE CHIP STATION', 5: 'DAILY CRYSTALS',
	          7: 'LEVEL', 8: 'MAX HEALTH', 11: 'FLAWLESS CHARM',
	          18: 'LEVEL', 19: 'LOUNGE SLOT', 23: 'CRAFTING SPEED',
	          29: 'LEVEL', 30: 'NOVA CRYSTAL BASE PAINT', 36: 'note\nwith newline' }),
	row(40, { 0: '1', 1: '60', 2: '30', 3: '250', 4: '120', 5: '30', 7: '1', 8: '1', 11: '500', 18: '1', 19: '1', 23: '3', 29: '1', 30: '30' }),
	row(40, { 0: '2', 1: '90', 2: '90', 7: '2', 8: '6', 18: '2', 19: '30', 23: '18', 29: '2', 30: '120', 36: 'NOVA CRYSTALS/RB LEVEL' }),
	row(40, { 0: '3', 1: '120', 2: '150', 7: '3', 8: '13', 18: '3', 19: '60', 23: '33', 29: '3', 30: '400',
	          36: 'RB LEVEL', 37: 'CRYSTAL QUANTITY', 38: 'CREDIT MULT', 39: 'XP MULT' }),
	row(40, { 36: 'RB 12', 37: '11 NOVA CRYSTALS', 38: '22%', 39: '110%' }),
	row(40, { 36: 'RB 13', 37: '16 NOVA CRYSTALS', 38: '32%', 39: '160%' })
].join('\n');

// Width 17. `COMPAINION` and the trailing space in 'ICONIC ' are the sheet's own text,
// reproduced deliberately — the parser matches them, it never corrects them.
export const CRAFTING_CSV = [
	row(17, { 3: 'banner', 10: 'banner' }),
	row(17, { 3: 'CRAFTING TIME - NO BUFF', 10: 'WORKER COMPAINION DROIDS - CRAFTING SPEED BUFFS' }),
	row(17, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'BASIC', 4: 'GOLD', 5: 'DIAMOND', 6: 'RAINBOW', 7: 'BESKAR', 8: 'GALACTIC',
	          10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '0:00:33', 4: '0:02:14', 5: '0:03:54', 6: '0:05:35', 7: '0:04:28', 8: '0:08:22',
	          10: 'COMMON', 11: '20%', 12: '40%', 13: '60%', 14: '80%', 15: '100%', 16: '100%' }),
	row(17, { 1: 'HAUL-R', 2: 'BATTLE', 3: '0:08:23', 4: '0:33:35', 5: '0:58:46', 6: '1:23:58', 7: '1:07:10',
	          10: 'ICONIC ', 11: 'N/A', 12: 'N/A', 13: 'N/A', 14: 'N/A', 15: 'N/A', 16: 'N/A' }),
	row(17, { 0: 'ICONIC ', 1: 'BB-8', 2: 'ASTROMECH', 3: 'N/A' }),
	row(17, { 10: 'ASTROMECH COMPAINION DROIDS - PICKAXE LEVEL BUFFS' }),
	row(17, { 10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 10: 'COMMON', 11: '+1', 12: '+2', 13: '+3', 14: '+4', 15: '+5', 16: '+6' }),
	row(17, {}),
	row(17, { 10: 'BATTLE COMPAINION DROIDS - MAX HEALTH BUFFS' }),
	row(17, { 10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 10: 'COMMON', 11: '+20', 12: '+60', 13: '+100', 14: '+140', 15: '+180', 16: '+220' }),
	row(17, {}),
	row(17, { 10: 'COMPAINION DROIDS - ICONIC DROIDS' }),
	row(17, { 10: 'DROID', 11: 'BASIC' }),
	row(17, { 10: 'BB-8', 11: '100% UPGRADE CHIPS' }),
	row(17, { 10: 'CHOPPER', 11: '+50% CRIT CHANCE & DAMAGE' })
].join('\n');

export const CSV_BY_GID = { '1248391507': DROID_CSV, '0': REBIRTH_CSV, '547464940': COSMETIC_CSV, '1548395368': NOVA_CSV, '1131770079': CRAFTING_CSV };

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
		// one row per shop category — validate() rejects an empty novaShop or a missing category
		novaShop: [{ category: 'Featured', item: 'Critical Chance', level: 1, cost: 60 },
			{ category: 'Core upgrades', item: 'Max Health', level: 1, cost: 1 },
			{ category: 'Workshop upgrades', item: 'Lounge Slot', level: 1, cost: 1 }],
		cosmetics: [{ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' }],
		droidSellValues: [{ rarity: 'Common', tier: 'Gold', multiplier: 4 }],
		flawlessSpawn: [{ tier: 'Base', oneIn: 1000 }], novaPaintStages: [{ stage: 1, crystalCost: 30 }],
		craftingTimes: [{ droid: 'MOUSE', tier: 'Base', seconds: 33 }],
		companionBuffs: [{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 }],
		iconicCompanionEffects: [{ droid: 'BB8', effect: '100% UPGRADE CHIPS' }]
	};
}
export function validBuilt(extraFlags: Flag[] = []): { payload: Payload; flags: Flag[]; checksum: string } {
	const tables = validTables();
	const payload: Payload = { meta: { source: 'test', fetchedAt: 't', tabChecksums: {}, rowCounts: {}, orphanReport: [] }, tables };
	return { payload, flags: extraFlags, checksum: checksumOf(tables as unknown as Record<string, unknown[]>) };
}
