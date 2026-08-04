import { describe, it, expect } from 'vitest';
import { isFlawlessEligible, eligibleFlawless, flawlessProgress } from './flawless';

const roster = [
	{ name: 'MOUSE', rarity: 'Common' },
	{ name: 'IG', rarity: 'Mythic' },
	{ name: 'R2-D2', rarity: 'Iconic' },
	{ name: 'CHOPPER', rarity: 'Iconic' }
];

describe('flawless eligibility', () => {
	it('excludes Iconic droids — flawless is an ownership axis, not a tier', () => {
		expect(isFlawlessEligible({ rarity: 'Common' })).toBe(true);
		expect(isFlawlessEligible({ rarity: 'Iconic' })).toBe(false);
		expect(eligibleFlawless(roster).map((d) => d.name)).toEqual(['MOUSE', 'IG']);
	});
	it('counts progress against the eligible roster only', () => {
		expect(flawlessProgress(['MOUSE'], roster)).toEqual({ owned: 1, total: 2 });
		expect(flawlessProgress([], roster)).toEqual({ owned: 0, total: 2 });
	});
	it('ignores owned rows for unknown or ineligible droids', () => {
		expect(flawlessProgress(['MOUSE', 'R2-D2', 'GONE'], roster)).toEqual({ owned: 1, total: 2 });
	});
	it('does not double count duplicates', () => {
		expect(flawlessProgress(['MOUSE', 'MOUSE'], roster)).toEqual({ owned: 1, total: 2 });
	});
});
