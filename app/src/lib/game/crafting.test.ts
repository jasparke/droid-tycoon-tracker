import { describe, it, expect } from 'vitest';
import { craftSeconds, formatHms, planCraftTotal, type CraftTimeRow } from './crafting';

const rows: CraftTimeRow[] = [
	{ droid: 'MOUSE', tier: 'Base', seconds: 33 },
	{ droid: 'MOUSE', tier: 'Gold', seconds: 134 },
	{ droid: 'HAUL-R', tier: 'Galactic', seconds: null },
	{ droid: 'IG', tier: 'Base', seconds: 6200 }
];

describe('craftSeconds', () => {
	it('finds a published time', () => {
		expect(craftSeconds(rows, 'MOUSE', 'Gold')).toBe(134);
	});
	it('returns null for unpublished and unknown combinations', () => {
		expect(craftSeconds(rows, 'HAUL-R', 'Galactic')).toBeNull();
		expect(craftSeconds(rows, 'MOUSE', 'Beskar')).toBeNull();
		expect(craftSeconds(rows, 'NOBODY', 'Base')).toBeNull();
	});
});

describe('formatHms', () => {
	it('matches the sheet format and does not cap hours at 24', () => {
		expect(formatHms(33)).toBe('0:00:33');
		expect(formatHms(134)).toBe('0:02:14');
		expect(formatHms(6768)).toBe('1:52:48');
		expect(formatHms(107700)).toBe('29:55:00');
		expect(formatHms(0)).toBe('0:00:00');
	});
});

describe('planCraftTotal', () => {
	const needs = [
		{ droid: 'MOUSE', tier: 'Gold' as const },
		{ droid: 'IG', tier: 'Base' as const },
		{ droid: 'HAUL-R', tier: 'Galactic' as const }
	];
	it('sums only the needs that are not yet owned', () => {
		expect(planCraftTotal(rows, needs, () => false)).toEqual({ seconds: 6334, unknown: 1 });
		expect(planCraftTotal(rows, needs, (d) => d === 'IG')).toEqual({ seconds: 134, unknown: 1 });
		expect(planCraftTotal(rows, needs, () => true)).toEqual({ seconds: 0, unknown: 0 });
	});
	it('is zero for an empty plan', () => {
		expect(planCraftTotal(rows, [], () => false)).toEqual({ seconds: 0, unknown: 0 });
	});
});
