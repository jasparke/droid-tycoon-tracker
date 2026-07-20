import { describe, it, expect } from 'vitest';
import { cumChips, stepChips, type ChipSteps } from './chips';

const common: ChipSteps = [5, 25, 40, 80, 120];

describe('cumChips', () => {
	it('Base costs nothing', () => expect(cumChips(common, 'Base')).toBe(0));
	it('accumulates to target', () => {
		expect(cumChips(common, 'Gold')).toBe(5);
		expect(cumChips(common, 'Diamond')).toBe(30);
		expect(cumChips(common, 'Beskar')).toBe(150);
		expect(cumChips(common, 'Galactic')).toBe(270);
	});
});

describe('stepChips', () => {
	it('cost to leave a tier', () => {
		expect(stepChips(common, 'Base')).toBe(5);
		expect(stepChips(common, 'Rainbow')).toBe(80);
		expect(stepChips(common, 'Beskar')).toBe(120);
	});
	it('null at top tier', () => expect(stepChips(common, 'Galactic')).toBeNull());
});
