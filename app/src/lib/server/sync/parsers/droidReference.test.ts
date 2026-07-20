import { describe, it, expect } from 'vitest';
import { parseDroidReference } from './droidReference';

// rows: 0 banner, 1 section titles, 2 header, 3+ data. 34 columns.
// Left header @row2 cols0-20 (6 tier groups incl. GALACTIC); right stack labels @rows1-2 col22+.
function row(cells: Record<number, string>): string {
	const a = Array(34).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR', 22: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 3: 'BASE', 6: 'GOLD', 9: 'DIAMOND', 12: 'RAINBOW', 15: 'BESKAR', 18: 'GALACTIC', 22: 'UPGRADE COSTS' }),
	row({ 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'COST', 4: 'INCOME', 5: 'VALUE',
	      22: 'RARITY', 23: 'BASE -> GOLD', 24: 'GOLD -> DIAMOND', 25: 'DIAMOND -> RAINBOW', 26: 'RAINBOW -> BESKAR', 27: 'BESKAR -> GALACTIC' }),
	row({ 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '950', 4: '2/s', 5: '665',
	      6: '3.8k', 7: '4/s', 8: '2.66k', 18: '19.00k', 19: '48/s',
	      22: 'COMMON', 23: '5', 24: '25', 25: '40', 26: '80', 27: '120' }),
	row({ 1: 'IG', 2: 'BATTLE', 3: '228m', 4: '5.80k/s', 5: '239.40m',
	      6: '1.37b', 7: '23.2k/s', 8: '959.00m', 18: '2.28b', 19: '92.8k/s', 20: '1.60b',
	      22: 'MYTHIC', 23: '6000', 24: '13000', 25: '30,000', 26: '75,000', 27: '120,000' }),
	row({ 22: 'ICONIC', 23: 'N/A', 24: 'N/A', 25: 'N/A', 26: 'N/A', 27: 'N/A' }),
	row({ 22: '' }),
	row({ 22: 'DROID SELL VALUE' }),
	row({ 0: 'ICONIC ', 1: 'CB-23', 2: 'ASTROMECH', 3: '75 NC', 4: '15%/s', 5: '',
	      22: 'RARITY', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row({ 1: 'C-3P0', 2: 'WORKER', 3: 'N/A', 4: '25%/s', 22: 'COMMON', 23: '4', 24: '7', 25: '10', 26: '13', 27: '16' }),
	row({ 1: 'BB-8', 2: 'ASTROMECH', 3: 'N/A', 4: '15%/s' }),
	row({ 22: 'ICONIC', 23: 'N/A', 24: 'N/A', 25: 'N/A', 26: 'N/A', 27: 'N/A' }),
	row({ 22: '' }),
	row({ 22: 'FLAWLESS SPAWN PROBABILITY' }),
	row({ 22: 'DEFAULT', 23: 'GOLD', 24: 'DIAMOND', 25: 'RAINBOW', 26: 'BESKAR', 27: 'GALACTIC' }),
	row({ 22: '1/1000', 23: '1/500', 24: '1/250', 25: '1/125', 26: '1/100', 27: '' })
].join('\n');

describe('parseDroidReference', () => {
	const out = parseDroidReference(csv);
	it('parses non-iconic droid + 6 tier rows with magnitude scaling', () => {
		expect(out.droids.find((d) => d.name === 'MOUSE')).toMatchObject({ rarity: 'Common', type: 'Worker', incomePct: null, buyNc: null });
		const ig = out.droidTiers.filter((t) => t.droid === 'IG');
		expect(ig).toHaveLength(6);
		expect(ig.find((t) => t.tier === 'Base')).toMatchObject({ buy: 228_000_000, income: 5800, sell: 239_400_000 });
		expect(ig.find((t) => t.tier === 'Gold')).toMatchObject({ buy: 1_370_000_000 });
		expect(ig.find((t) => t.tier === 'Galactic')).toMatchObject({ buy: 2_280_000_000, income: 92_800, sell: 1_600_000_000 });
	});
	it('blank Galactic sell cell → null (sheet still filling in values)', () => {
		expect(out.droidTiers.find((t) => t.droid === 'MOUSE' && t.tier === 'Galactic')).toMatchObject({ buy: 19_000, income: 48, sell: null });
	});
	it('iconic: percentage income → droid-level, 75 NC → buyNc, tier rows all null', () => {
		expect(out.droids.find((d) => d.name === 'CB-23')).toMatchObject({ rarity: 'Iconic', incomePct: 15, buyNc: 75 });
		expect(out.droids.find((d) => d.name === 'C-3P0')).toMatchObject({ rarity: 'Iconic', type: 'Worker', incomePct: 25, buyNc: null });
		// sheet renamed the iconic to "BB-8"; canonical DB name stays BB8 (alias-resolved)
		expect(out.droids.find((d) => d.name === 'BB8')).toMatchObject({ rarity: 'Iconic', incomePct: 15 });
		expect(out.droids.some((d) => d.name === 'BB-8')).toBe(false);
		expect(out.droidTiers.filter((t) => t.droid === 'BB8')).toHaveLength(6);
		const cbTiers = out.droidTiers.filter((t) => t.droid === 'CB-23');
		expect(cbTiers).toHaveLength(6);
		expect(cbTiers.every((t) => t.buy === null && t.income === null && t.sell === null)).toBe(true);
	});
	it('chip costs incl. toGalactic, Iconic all-null row and comma thousands', () => {
		expect(out.chipCosts.find((c) => c.rarity === 'Common')).toMatchObject({ toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80, toGalactic: 120 });
		expect(out.chipCosts.find((c) => c.rarity === 'Mythic')).toMatchObject({ toGold: 6000, toDiamond: 13000, toRainbow: 30000, toBeskar: 75000, toGalactic: 120000 });
		expect(out.chipCosts.find((c) => c.rarity === 'Iconic')).toMatchObject({ toGold: null, toBeskar: null, toGalactic: null });
	});
	it('sell values (5 tiers, no Base; Iconic skipped) + flawless (5 tiers, DEFAULT→Base, blank Galactic skipped)', () => {
		expect(out.droidSellValues.filter((s) => s.rarity === 'Common')).toEqual([
			{ rarity: 'Common', tier: 'Gold', multiplier: 4 },
			{ rarity: 'Common', tier: 'Diamond', multiplier: 7 },
			{ rarity: 'Common', tier: 'Rainbow', multiplier: 10 },
			{ rarity: 'Common', tier: 'Beskar', multiplier: 13 },
			{ rarity: 'Common', tier: 'Galactic', multiplier: 16 }
		]);
		expect(out.droidSellValues.some((s) => s.rarity === 'Iconic')).toBe(false);
		expect(out.flawlessSpawn).toEqual([
			{ tier: 'Base', oneIn: 1000 }, { tier: 'Gold', oneIn: 500 }, { tier: 'Diamond', oneIn: 250 },
			{ tier: 'Rainbow', oneIn: 125 }, { tier: 'Beskar', oneIn: 100 }
		]);
	});
	it('rejects when a header anchor moved', () => {
		const broken = csv.replace('RARITY,DROID,TYPE', 'RARITY,NAME,TYPE');
		expect(() => parseDroidReference(broken)).toThrow(/header/i);
	});
});
