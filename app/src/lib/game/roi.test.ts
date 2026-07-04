import { describe, it, expect } from 'vitest';
import { roiTable, type TierStat } from './roi';

const stats: TierStat[] = [
	{ droid: 'MOUSE', rarity: 'Common', type: 'Worker', tier: 'Base', buy: 950, income: 2 },
	{ droid: 'MOUSE', rarity: 'Common', type: 'Worker', tier: 'Beskar', buy: 15200, income: 24 },
	{ droid: 'NO-DATA', rarity: 'Mythic', type: 'Battle', tier: 'Base', buy: null, income: 5 },
	{ droid: 'FREEBIE', rarity: 'Common', type: 'Worker', tier: 'Base', buy: 0, income: 1 }
];

describe('roiTable', () => {
	it('computes payback and income-per-1k, sorted best-first', () => {
		const rows = roiTable(stats);
		expect(rows.map((r) => `${r.droid}:${r.tier}`)).toEqual(['MOUSE:Base', 'MOUSE:Beskar']);
		expect(rows[0].paybackSeconds).toBe(475);
		expect(rows[0].incomePer1k).toBeCloseTo(2.105, 3);
		expect(rows[1].paybackSeconds).toBeCloseTo(633.33, 2);
	});
	it('drops rows without usable buy/income', () => {
		expect(roiTable(stats).find((r) => r.droid === 'NO-DATA')).toBeUndefined();
		expect(roiTable(stats).find((r) => r.droid === 'FREEBIE')).toBeUndefined();
	});
});
