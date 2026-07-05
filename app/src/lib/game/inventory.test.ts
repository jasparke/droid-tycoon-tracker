import { describe, it, expect } from 'vitest';
import { ownedIdx, isMet, totalOf, type CountRow } from './inventory';

const counts: CountRow[] = [
	{ cycle: 1, droid: 'CYCLO-GRAV', tier: 'Rainbow', n: 1 },
	{ cycle: 1, droid: 'CYCLO-GRAV', tier: 'Base', n: 2 },
	{ cycle: 1, droid: 'MOUSE', tier: 'Gold', n: 3 },
	{ cycle: 2, droid: 'MOUSE', tier: 'Beskar', n: 1 }
];

describe('ownedIdx', () => {
	it('returns highest owned tier index in the right cycle', () => {
		expect(ownedIdx(counts, 1, 'CYCLO-GRAV')).toBe(3); // Rainbow
		expect(ownedIdx(counts, 2, 'MOUSE')).toBe(4); // Beskar
	});
	it('returns -1 when unowned in that cycle', () => {
		expect(ownedIdx(counts, 2, 'CYCLO-GRAV')).toBe(-1);
	});
});

describe('isMet (counts-as-higher-tier)', () => {
	it('higher tier satisfies lower requirement', () => {
		expect(isMet(counts, 1, 'CYCLO-GRAV', 'Gold')).toBe(true);
	});
	it('exact tier satisfies', () => {
		expect(isMet(counts, 1, 'CYCLO-GRAV', 'Rainbow')).toBe(true);
	});
	it('lower tier does not satisfy higher requirement', () => {
		expect(isMet(counts, 1, 'CYCLO-GRAV', 'Beskar')).toBe(false);
	});
	it('unowned droid never satisfies', () => {
		expect(isMet(counts, 1, 'GONK', 'Base')).toBe(false);
	});
});

describe('totalOf', () => {
	it('sums copies across tiers within a cycle', () => {
		expect(totalOf(counts, 1, 'CYCLO-GRAV')).toBe(3);
		expect(totalOf(counts, 1, 'GONK')).toBe(0);
	});
});
