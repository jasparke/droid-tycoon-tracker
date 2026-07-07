import { describe, it, expect } from 'vitest';
import { ownedIdx, isMet, totalOf, satisfyingIdx, type CountRow } from './inventory';

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

describe('satisfyingIdx', () => {
	const rows = [
		{ cycle: 1, droid: 'Mouse', tier: 'Base' as const, n: 1 },
		{ cycle: 1, droid: 'Mouse', tier: 'Diamond' as const, n: 2 },
		{ cycle: 1, droid: 'Probe', tier: 'Beskar' as const, n: 1 }
	];
	it('returns the exact tier when owned', () => {
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Base')).toBe(0);
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Diamond')).toBe(2);
	});
	it('skips unowned tiers up to the first owned one at or above the requirement', () => {
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Gold')).toBe(2); // no Gold, Diamond satisfies
		expect(satisfyingIdx(rows, 1, 'Probe', 'Base')).toBe(4); // only Beskar owned
	});
	it('returns -1 when nothing at or above the requirement is owned', () => {
		expect(satisfyingIdx(rows, 1, 'Mouse', 'Rainbow')).toBe(-1);
		expect(satisfyingIdx(rows, 2, 'Mouse', 'Base')).toBe(-1); // wrong cycle
		expect(satisfyingIdx([], 1, 'Mouse', 'Base')).toBe(-1);
	});
});
