import { describe, it, expect } from 'vitest';
import { parseRebirths } from './rebirths';

function row(cells: Record<number, string>): string {
	const a = Array(34).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.join(',');
}
const csv = [
	row({ 10: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 10: 'REBIRTH REQUIRMENTS', 11: 'CREDITS', 12: 'DROID', 13: 'RARITY', 14: 'UNLOCKS', 15: 'FLAWLESS',
	      17: 'REBIRTH REQUIRMENTS', 18: 'CREDITS', 19: 'DROID', 20: 'RARITY', 21: 'FLAWLESS' }),
	row({ 10: '0->1', 11: '10K CREDITS', 12: 'BASIC CB', 13: 'COMMON', 14: 'Worker Slot',
	      17: '0->1', 18: '12K CREDITS', 19: 'GOLD R9', 20: 'RARE' }),
	row({ 12: 'BASIC MOUSE', 19: 'BASIC BB-9' }),
	row({ 12: 'GOLD MONO-WALKER', 19: 'DEFAULT TRI-TEK' })
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
});
