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
		cosmetics: [{ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' }],
		droidSellValues: [{ rarity: 'Common', tier: 'Gold', multiplier: 4 }],
		flawlessSpawn: [{ tier: 'Base', oneIn: 1000 }],
		novaPaintStages: [{ stage: 1, crystalCost: 30 }],
		craftingTimes: [{ droid: 'IG', tier: 'Base', seconds: 6200 }],
		companionBuffs: [{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 }],
		iconicCompanionEffects: [{ droid: 'BB8', effect: '100% UPGRADE CHIPS' }]
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
	it('rejects any never-empty table that parsed to nothing (silent geometry drift)', () => {
		// droids and droidTiers pass every per-row check vacuously when empty, and an empty cosmetics
		// would truncate-and-apply cleanly — emptiness is the one thing per-row checks cannot see.
		for (const table of ['novaShop', 'rebirthMeta', 'novaPaintStages', 'droidSellValues', 'flawlessSpawn',
			'craftingTimes', 'companionBuffs', 'iconicCompanionEffects', 'cosmetics', 'droids', 'droidTiers'] as const) {
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
	it('rejects a craft time that is not a positive whole number of seconds', () => {
		// hmsToSeconds returns null for a blank or N/A cell — that is data, not corruption, and must
		// stay clean. Anything else non-integral means the duration arithmetic went wrong.
		const t = base();
		t.craftingTimes.push({ droid: 'IG', tier: 'Gold', seconds: 0 });
		t.craftingTimes.push({ droid: 'IG', tier: 'Diamond', seconds: -5 });
		t.craftingTimes.push({ droid: 'IG', tier: 'Rainbow', seconds: 12.5 });
		t.craftingTimes.push({ droid: 'IG', tier: 'Beskar', seconds: NaN });
		t.craftingTimes.push({ droid: 'IG', tier: 'Galactic', seconds: null });
		const bad = rejectsOf(validate(t, [])).filter((f) => f.code === 'bad_craft_time');
		expect(bad.map((f) => f.key).sort()).toEqual(['IG/Beskar', 'IG/Diamond', 'IG/Gold', 'IG/Rainbow']);
	});
	it('rejects a companion buff whose kind or rarity is not a known one', () => {
		// The exact-108 count guard only catches lost rows. A sheet rename keeps the count intact and
		// writes a bogus label instead: rarity() title-cases whatever it is given, so MYTHIC → MYTHICAL
		// arrives as a well-formed "Mythical" row that no other check can see.
		const t = base();
		t.companionBuffs.push({ kind: 'Worker', rarity: 'Mythical', tier: 'Base', value: 20 });
		t.companionBuffs.push({ kind: 'Wrker', rarity: 'Common', tier: 'Gold', value: 40 });
		const rejects = rejectsOf(validate(t, []));
		expect(rejects.some((f) => f.code === 'bad_buff_rarity' && f.key === 'Worker/Mythical/Base')).toBe(true);
		expect(rejects.some((f) => f.code === 'bad_buff_kind' && f.key === 'Wrker/Common/Gold')).toBe(true);
	});
});
