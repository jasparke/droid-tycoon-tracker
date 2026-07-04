import { describe, it, expect } from 'vitest';
import { combinedNeeds, type Requirement } from './planner';

const reqs: Requirement[] = [
	{ rebirth: 1, droid: 'CB', tier: 'Base' },
	{ rebirth: 2, droid: 'CB', tier: 'Gold' },
	{ rebirth: 2, droid: 'R3', tier: 'Base' },
	{ rebirth: 3, droid: 'CB', tier: 'Base' },
	{ rebirth: 3, droid: 'ARG', tier: 'Beskar' }
];

describe('combinedNeeds', () => {
	it('dedupes to highest tier per droid across selected rebirths', () => {
		expect(combinedNeeds(reqs, new Set([1, 2, 3]))).toEqual([
			{ droid: 'ARG', tier: 'Beskar' },
			{ droid: 'CB', tier: 'Gold' },
			{ droid: 'R3', tier: 'Base' }
		]);
	});
	it('ignores unselected rebirths', () => {
		expect(combinedNeeds(reqs, new Set([1]))).toEqual([{ droid: 'CB', tier: 'Base' }]);
	});
	it('empty selection yields empty list', () => {
		expect(combinedNeeds(reqs, new Set())).toEqual([]);
	});
	it('sorts alphabetically within the same tier', () => {
		const same: Requirement[] = [
			{ rebirth: 1, droid: 'ZED', tier: 'Gold' },
			{ rebirth: 1, droid: 'ABC', tier: 'Gold' }
		];
		expect(combinedNeeds(same, new Set([1]))).toEqual([
			{ droid: 'ABC', tier: 'Gold' },
			{ droid: 'ZED', tier: 'Gold' }
		]);
	});
});
