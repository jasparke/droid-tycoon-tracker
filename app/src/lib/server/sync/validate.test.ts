import { describe, it, expect } from 'vitest';
import { validate, rejectsOf } from './validate';
import type { PayloadTables } from './types';

function base(): PayloadTables {
	return {
		droids: [{ name: 'IG', rarity: 'Mythic', type: 'Battle', incomePct: null, buyNc: null }, { name: 'KX', rarity: 'Mythic', type: 'Battle', incomePct: null, buyNc: null }],
		droidTiers: [
			{ droid: 'KX', tier: 'Base', buy: 300_000_000, income: 7200, sell: 210_000_000 },
			{ droid: 'KX', tier: 'Gold', buy: 1_200_000_000, income: null, sell: null },
			{ droid: 'IG', tier: 'Base', buy: 300_000_000, income: 7000, sell: 210_000_000 },
			{ droid: 'IG', tier: 'Gold', buy: 1_200_000_000, income: null, sell: null }
		],
		rebirthReqs: [], chipCosts: [{ rarity: 'Common', toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80, toGalactic: 120 },
			{ rarity: 'Rare', toGold: 30, toDiamond: 60, toRainbow: 100, toBeskar: 250, toGalactic: 400 },
			{ rarity: 'Epic', toGold: 120, toDiamond: 180, toRainbow: 240, toBeskar: 5000, toGalactic: 9000 },
			{ rarity: 'Legendary', toGold: 400, toDiamond: 1200, toRainbow: 4000, toBeskar: 12000, toGalactic: 35000 },
			{ rarity: 'Mythic', toGold: 6000, toDiamond: 13000, toRainbow: 30000, toBeskar: 75000, toGalactic: 120000 }],
		rebirthMeta: [{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 }],
		novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: []
	};
}

describe('validate', () => {
	it('clean payload has no reject flags', () => {
		expect(rejectsOf(validate(base(), []))).toHaveLength(0);
	});
	it('holds a droid whose value≈0.7×cost invariant breaks (the IG corruption)', () => {
		const t = base();
		const igBase = t.droidTiers.find((x) => x.droid === 'IG' && x.tier === 'Base')!;
		igBase.buy = 228_000_000;   // real IG Base cost
		igBase.sell = 239_400_000;  // real IG Base value — exceeds cost (ratio 1.05), the actual corruption
		const flags = validate(t, []);
		expect(flags.some((f) => f.kind === 'hold' && f.table === 'droidTiers' && f.key?.includes('IG'))).toBe(true);
	});
	it('rejects a bad rarity enum', () => {
		const t = base(); t.droids[0].rarity = 'Ultra';
		expect(rejectsOf(validate(t, [])).length).toBeGreaterThan(0);
	});
	it('reports orphaned counts when a referenced droid is absent', () => {
		const flags = validate(base(), [{ droid: 'GONE', tier: 'Base', profileId: 7 }]);
		expect(flags.some((f) => f.kind === 'report' && f.code === 'orphan_count' && f.message.includes('GONE'))).toBe(true);
	});
});
