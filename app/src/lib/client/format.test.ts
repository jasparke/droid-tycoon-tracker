import { describe, it, expect } from 'vitest';
import { fmtN, pad2, parseNum } from './format';

describe('fmtN (prototype-exact)', () => {
	it('passes integers below 1000 through rounded', () => {
		expect(fmtN(0)).toBe('0');
		expect(fmtN(999)).toBe('999');
		expect(fmtN(24.6)).toBe('25');
	});
	it('uses 2 decimals under 10 units', () => {
		expect(fmtN(1000)).toBe('1.00K');
		expect(fmtN(2_950_000)).toBe('2.95M');
	});
	it('uses 1 decimal from 10 to under 100 units', () => {
		expect(fmtN(10_500)).toBe('10.5K');
		expect(fmtN(32e12)).toBe('32.0T');
	});
	it('rounds at 100+ units', () => {
		expect(fmtN(185_430_000)).toBe('185M');
		expect(fmtN(999_990)).toBe('1000K');
	});
	it('covers B and T suffixes', () => {
		expect(fmtN(4.5e9)).toBe('4.50B');
		expect(fmtN(1.5e12)).toBe('1.50T');
	});
});

describe('pad2', () => {
	it('zero-pads to two digits', () => {
		expect(pad2(9)).toBe('09');
		expect(pad2(27)).toBe('27');
	});
});

describe('parseNum', () => {
	it('parses suffixed notation case-insensitively', () => {
		expect(parseNum('185.43M')).toBe(185_430_000);
		expect(parseNum('2k')).toBe(2000);
		expect(parseNum('1.5T')).toBe(1.5e12);
	});
	it('parses plain numbers', () => {
		expect(parseNum('300')).toBe(300);
	});
	it('returns null on garbage', () => {
		expect(parseNum('')).toBeNull();
		expect(parseNum('abc')).toBeNull();
	});
});
