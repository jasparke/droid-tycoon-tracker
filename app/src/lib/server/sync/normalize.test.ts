import { describe, it, expect } from 'vitest';
import { magnitude, income, chips, oneIn, nc, tierWord, unlockLabel, rarity, dtype } from './normalize';
import { resolveDroid } from './aliases';

describe('normalize', () => {
	it('magnitude suffixes (both cases, decimals)', () => {
		expect(magnitude('3.8k')).toBe(3800);
		expect(magnitude('1.06m')).toBe(1_060_000);
		expect(magnitude('2.00T')).toBe(2_000_000_000_000);
		expect(magnitude('228m')).toBe(228_000_000);
	});
	it('income: credits/s vs percentage vs N/A', () => {
		expect(income('4.08k/s')).toEqual({ value: 4080, pct: null });
		expect(income('2/s')).toEqual({ value: 2, pct: null });
		expect(income('15%/s')).toEqual({ value: null, pct: 15 });
		expect(income('N/A')).toEqual({ value: null, pct: null });
	});
	it('chips strips suffix + commas; N/A → null', () => {
		expect(chips('30,000 CHIPS')).toBe(30000);
		expect(chips('5 CHIPS')).toBe(5);
		expect(chips('N/A')).toBeNull();
	});
	it('oneIn / nc / tierWord / rarity / dtype', () => {
		expect(oneIn('1/1000')).toBe(1000);
		expect(nc('75 NC')).toBe(75);
		expect(tierWord('DEFAULT')).toBe('Base');
		expect(tierWord('BASIC')).toBe('Base');
		expect(tierWord('BESKAR')).toBe('Beskar');
		expect(tierWord('GALACTIC')).toBe('Galactic');
		expect(rarity('ICONIC ')).toBe('Iconic');
		expect(dtype('BATTLE')).toBe('Battle');
	});
	it('unlockLabel title-cases the ALL-CAPS unlock cells', () => {
		expect(unlockLabel(' WORKER SLOT')).toBe('Worker Slot');
		expect(unlockLabel('LOUNGE SLOT')).toBe('Lounge Slot');
		expect(unlockLabel('NONE')).toBe('None');
		expect(unlockLabel('Worker Slot')).toBe('Worker Slot');
	});
	it('resolveDroid maps the known misspellings/renames', () => {
		expect(resolveDroid('MONO-WALKER')).toBe('MONO-WLKR');
		expect(resolveDroid('BB-9')).toBe('BB9');
		expect(resolveDroid('BB-8')).toBe('BB8');
		expect(resolveDroid('MOUSE')).toBe('MOUSE');
	});
});
