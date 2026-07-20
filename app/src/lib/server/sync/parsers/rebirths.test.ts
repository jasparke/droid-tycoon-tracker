import { describe, it, expect } from 'vitest';
import { parseRebirths } from './rebirths';

// New sheet geometry: left droidex grid cols 0-9 (incl. GALACTIC/FLAWLESS), then
// cycle blocks — c1 trans@11 credits@12 req@13 unlock@15, c2 @19-21, c3 @26-28, c4 @33-35.
function row(cells: Record<number, string>): string {
	const a = Array(40).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.join(',');
}
const csv = [
	row({ 11: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 0: 'RARITY', 1: 'DROID', 11: 'REBIRTH REQUIRMENTS', 15: 'UNLOCKS',
	      19: 'REBIRTH REQUIRMENTS 2', 26: 'REBIRTH REQUIRMENTS 3', 33: 'REBIRTH REQUIRMENTS 4' }),
	row({ 11: '0->1', 12: '10K CREDITS', 13: 'BASIC CB', 14: 'COMMON', 15: ' WORKER SLOT',
	      19: '0->1', 20: '12K CREDITS', 21: 'GOLD R9',
	      26: '0->1', 27: '10K CREDITS', 28: 'BASIC MOUSE',
	      33: '0->1', 34: '10K CREDITS', 35: 'BASIC ID10' }),
	row({ 13: 'BASIC MOUSE', 21: 'BASIC BB-9', 28: 'BASIC PIT', 35: 'BASIC PIT' }),
	row({ 13: 'GOLD MONO-WALKER', 21: 'DEFAULT TRI-TEK', 28: 'BASIC GONK', 35: 'BASIC GONK' }),
	row({ 11: '1 ->2', 12: '150K CREDITS', 13: 'BASIC BDX EXPLORER', 14: 'RARE', 15: 'ASTROMECH SLOT' }),
	row({ 13: 'BASIC 2BB' }),
	row({ 13: 'BASIC BAL-CORE' }),
	row({ 11: '27->28', 12: '45.00T CREDITS', 13: 'GALACTIC PROTO-ROLLER', 14: 'LEGENDARY', 15: 'NONE',
	      19: '27->28', 20: '45.00T CREDITS', 21: 'GALACTIC MECHA-DROID' }),
	row({ 13: 'RAINBOW MO-TRAK', 21: 'RAINBOW SNOW MOUSE' }),
	row({ 13: 'BESKAR DRFT-R', 21: 'BESKAR TRI-TEK' })
].join('\n');

describe('parseRebirths', () => {
	const out = parseRebirths(csv).rebirthReqs;
	it('emits 3 reqs per transition, credits+unlock only on first, tier+alias resolved', () => {
		const c1 = out.filter((r) => r.cycle === 1 && r.rebirth === 1);
		expect(c1).toEqual([
			{ cycle: 1, rebirth: 1, droid: 'CB', tier: 'Base', credits: '10K', unlock: 'Worker Slot' },
			{ cycle: 1, rebirth: 1, droid: 'MOUSE', tier: 'Base', credits: '10K', unlock: null },
			{ cycle: 1, rebirth: 1, droid: 'MONO-WLKR', tier: 'Gold', credits: '10K', unlock: null }
		]);
	});
	it('cycle 2 has no unlock column; DEFAULT→Base; BB-9 alias', () => {
		const c2 = out.filter((r) => r.cycle === 2 && r.rebirth === 1);
		expect(c2.map((r) => [r.droid, r.tier])).toEqual([['R9', 'Gold'], ['BB9', 'Base'], ['TRI-TEK', 'Base']]);
		expect(c2.every((r) => r.unlock === null)).toBe(true);
		expect(c2[0].credits).toBe('12K');
	});
	it('cycles 3 and 4 parse from their shifted columns', () => {
		expect(out.filter((r) => r.cycle === 3 && r.rebirth === 1).map((r) => r.droid)).toEqual(['MOUSE', 'PIT', 'GONK']);
		expect(out.filter((r) => r.cycle === 4 && r.rebirth === 1).map((r) => r.droid)).toEqual(['ID10', 'PIT', 'GONK']);
	});
	it('tolerates the sheet\'s "1 ->2" spacing typo', () => {
		const c1 = out.filter((r) => r.cycle === 1 && r.rebirth === 2);
		expect(c1.map((r) => r.droid)).toEqual(['BDX EXPLORER', '2BB', 'BAL-CORE']);
		expect(c1[0]).toMatchObject({ credits: '150K', unlock: 'Astromech Slot' });
	});
	it('rebirth 28: GALACTIC tier word, NONE unlock title-cased', () => {
		const c1 = out.filter((r) => r.cycle === 1 && r.rebirth === 28);
		expect(c1).toEqual([
			{ cycle: 1, rebirth: 28, droid: 'PROTO-ROLLER', tier: 'Galactic', credits: '45.00T', unlock: 'None' },
			{ cycle: 1, rebirth: 28, droid: 'MO-TRAK', tier: 'Rainbow', credits: '45.00T', unlock: null },
			{ cycle: 1, rebirth: 28, droid: 'DRFT-R', tier: 'Beskar', credits: '45.00T', unlock: null }
		]);
		expect(out.find((r) => r.cycle === 2 && r.rebirth === 28)?.tier).toBe('Galactic');
	});
});
