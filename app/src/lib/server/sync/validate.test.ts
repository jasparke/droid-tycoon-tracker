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
		novaShop: [{ category: 'Featured', item: 'Critical Chance', level: 1, cost: 60 },
			{ category: 'Core upgrades', item: 'Max Health', level: 1, cost: 1 },
			{ category: 'Workshop upgrades', item: 'Lounge Slot', level: 1, cost: 1 }],
		cosmetics: [], droidSellValues: [], flawlessSpawn: [],
		novaPaintStages: [{ stage: 1, crystalCost: 30 }]
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
	it('holds a droidTiers row that references a droid missing from the reference tab', () => {
		const t = base();
		t.droidTiers.push({ droid: 'PHANTOM', tier: 'Base', buy: 1000, income: 2, sell: 700 });
		const flags = validate(t, []);
		expect(flags.some((f) => f.kind === 'hold' && f.code === 'unknown_droid' && f.key === 'PHANTOM/Base')).toBe(true);
	});
	it('does not flag known droids as unknown', () => {
		expect(validate(base(), []).some((f) => f.code === 'unknown_droid')).toBe(false);
	});
	it('rejects negative buy/income/sell values in the tier grid', () => {
		const t = base();
		t.droidTiers[0].buy = -5;        // KX/Base
		t.droidTiers[2].income = -1;     // IG/Base
		const negs = rejectsOf(validate(t, [])).filter((f) => f.code === 'negative_value');
		expect(negs.map((f) => f.key).sort()).toEqual(['IG/Base', 'KX/Base']);
	});
	it('reports orphaned counts when a referenced droid is absent', () => {
		const flags = validate(base(), [{ droid: 'GONE', tier: 'Base', profileId: 7 }]);
		expect(flags.some((f) => f.kind === 'report' && f.code === 'orphan_count' && f.message.includes('GONE'))).toBe(true);
	});
	it('rejects an empty novaShop / rebirthMeta / novaPaintStages (silent geometry drift)', () => {
		for (const table of ['novaShop', 'rebirthMeta', 'novaPaintStages'] as const) {
			const t = base();
			(t[table] as unknown[]) = [];
			const rejects = rejectsOf(validate(t, []));
			expect(rejects.some((f) => f.code === 'empty_table' && f.table === table)).toBe(true);
		}
	});
	it('rejects a missing shop category', () => {
		const t = base();
		t.novaShop = t.novaShop.filter((n) => n.category !== 'Workshop upgrades');
		expect(rejectsOf(validate(t, [])).some((f) => f.code === 'missing_shop_category')).toBe(true);
	});
	it('rejects a structural header parsed as a shop item', () => {
		const t = base();
		t.novaShop.push({ category: 'Core upgrades', item: 'Level', level: 30, cost: 1 });
		expect(rejectsOf(validate(t, [])).some((f) => f.code === 'structural_item')).toBe(true);
	});
	it('rejects a non-positive shop level and a negative cost', () => {
		const t = base();
		t.novaShop.push({ category: 'Featured', item: 'Critical Chance', level: 0, cost: 5 });
		t.novaShop.push({ category: 'Featured', item: 'Critical Amount', level: 1, cost: -5 });
		const codes = rejectsOf(validate(t, [])).map((f) => f.code);
		expect(codes).toContain('bad_shop_level');
		expect(codes).toContain('bad_shop_cost');
	});
	it('rejects a non-finite shop level or cost', () => {
		// novaShop levels and costs come off the sheet through parseInt, which yields NaN for an
		// unparseable cell rather than throwing — the row would otherwise reach the DB as a null.
		const t = base();
		t.novaShop.push({ category: 'Featured', item: 'Critical Chance', level: 2, cost: NaN });
		t.novaShop.push({ category: 'Featured', item: 'Critical Amount', level: NaN, cost: 30 });
		t.novaShop.push({ category: 'Featured', item: 'Daily Crystals', level: 1, cost: Infinity });
		const rejects = rejectsOf(validate(t, []));
		expect(rejects.some((f) => f.code === 'bad_shop_cost' && f.key === 'Featured/Critical Chance/2')).toBe(true);
		expect(rejects.some((f) => f.code === 'bad_shop_level' && f.key === 'Featured/Critical Amount/NaN')).toBe(true);
		expect(rejects.some((f) => f.code === 'bad_shop_cost' && f.key === 'Featured/Daily Crystals/1')).toBe(true);
	});
});
