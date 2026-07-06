import { describe, it, expect } from 'vitest';
import { parseDroidReference } from './droidReference';

// rows: 0 banner, 1 section titles, 2 header, 3+ data. 24 columns.
// Left header @row2 cols0-17; right stack labels @rows1-2 col19+.
function row(cells: Record<number, string>): string {
	const a = Array(24).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR', 19: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 19: 'UPGRADE COSTS' }),
	row({ 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'COST', 4: 'INCOME', 5: 'VALUE',
	      19: 'RARITY', 20: 'BASE -> GOLD', 21: 'GOLD -> DIAMOND', 22: 'DIAMOND -> RAINBOW', 23: 'RAINBOW -> BESKAR' }),
	row({ 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '950', 4: '2/s', 5: '665',
	      6: '3.8k', 7: '8/s', 8: '2.66k', 19: 'COMMON', 20: '5 CHIPS', 21: '25 CHIPS', 22: '40 CHIPS', 23: '80 CHIPS' }),
	row({ 1: 'IG', 2: 'BATTLE', 3: '228m', 4: '5.80k/s', 5: '239.40m',
	      6: '1.37b', 7: '23.2k/s', 8: '959.00m', 19: 'MYTHIC', 20: '6000 CHIPS', 21: '13000 CHIPS', 22: '30,000 CHIPS', 23: '75,000 CHIPS' }),
	row({ 19: 'ICONIC', 20: 'N/A', 21: 'N/A', 22: 'N/A', 23: 'N/A' }),
	row({ 19: '' }),
	row({ 19: 'DROID SELL VALUE' }),
	row({ 0: 'ICONIC ', 1: 'CB-23', 2: 'ASTROMECH', 3: '75 NC', 4: '15%/s', 5: '',
	      19: 'RARITY', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row({ 1: 'R2-D2', 2: 'ASTROMECH', 3: 'N/A', 4: '25%/s', 19: 'COMMON', 20: '4', 21: '7', 22: '10', 23: '13' }),
	row({ 19: 'ICONIC', 20: 'N/A', 21: 'N/A', 22: 'N/A', 23: 'N/A' }),
	row({ 19: '' }),
	row({ 19: 'FLAWLESS SPAWN PROBABILITY' }),
	row({ 19: 'DEFAULT', 20: 'GOLD', 21: 'DIAMOND', 22: 'RAINBOW', 23: 'BESKAR' }),
	row({ 19: '1/1000', 20: '1/500', 21: '1/250', 22: '1/125', 23: '1/100' })
].join('\n');

describe('parseDroidReference', () => {
	const out = parseDroidReference(csv);
	it('parses non-iconic droid + tiers with magnitude scaling', () => {
		expect(out.droids.find((d) => d.name === 'MOUSE')).toMatchObject({ rarity: 'Common', type: 'Worker', incomePct: null, buyNc: null });
		const ig = out.droidTiers.filter((t) => t.droid === 'IG');
		expect(ig.find((t) => t.tier === 'Base')).toMatchObject({ buy: 228_000_000, income: 5800, sell: 239_400_000 });
		expect(ig.find((t) => t.tier === 'Gold')).toMatchObject({ buy: 1_370_000_000 });
	});
	it('iconic: percentage income → droid-level, 75 NC → buyNc, tier rows all null', () => {
		expect(out.droids.find((d) => d.name === 'CB-23')).toMatchObject({ rarity: 'Iconic', incomePct: 15, buyNc: 75 });
		expect(out.droids.find((d) => d.name === 'R2-D2')).toMatchObject({ incomePct: 25, buyNc: null });
		const cbTiers = out.droidTiers.filter((t) => t.droid === 'CB-23');
		expect(cbTiers).toHaveLength(5);
		expect(cbTiers.every((t) => t.buy === null && t.income === null && t.sell === null)).toBe(true);
	});
	it('chip costs incl. Iconic all-null row and comma thousands', () => {
		expect(out.chipCosts.find((c) => c.rarity === 'Mythic')).toMatchObject({ toGold: 6000, toDiamond: 13000, toRainbow: 30000, toBeskar: 75000 });
		expect(out.chipCosts.find((c) => c.rarity === 'Iconic')).toMatchObject({ toGold: null, toBeskar: null });
	});
	it('sell values (4 tiers, no Base; Iconic skipped) + flawless (5 tiers, DEFAULT→Base)', () => {
		expect(out.droidSellValues.filter((s) => s.rarity === 'Common')).toEqual([
			{ rarity: 'Common', tier: 'Gold', multiplier: 4 },
			{ rarity: 'Common', tier: 'Diamond', multiplier: 7 },
			{ rarity: 'Common', tier: 'Rainbow', multiplier: 10 },
			{ rarity: 'Common', tier: 'Beskar', multiplier: 13 }
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
