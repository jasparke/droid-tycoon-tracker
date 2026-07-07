import { describe, it, expect } from 'vitest';
import { earliestReq } from './requirements';

const reqs = [
	{ cycle: 1, rebirth: 3, droid: 'Mouse', tier: 'Gold' },
	{ cycle: 1, rebirth: 9, droid: 'Mouse', tier: 'Beskar' },
	{ cycle: 1, rebirth: 5, droid: 'Probe', tier: 'Base' },
	{ cycle: 2, rebirth: 1, droid: 'Mouse', tier: 'Base' }
];

describe('earliestReq', () => {
	it('finds the earliest requirement at or after fromRb in the given cycle', () => {
		expect(earliestReq(reqs, 1, 1, 'Mouse')).toEqual({ rebirth: 3, tier: 'Gold' });
		expect(earliestReq(reqs, 1, 4, 'Mouse')).toEqual({ rebirth: 9, tier: 'Beskar' });
	});
	it('returns null when the droid is not needed in the remaining cycle', () => {
		expect(earliestReq(reqs, 1, 10, 'Mouse')).toBeNull();
		expect(earliestReq(reqs, 1, 1, 'Ghost')).toBeNull();
	});
	it('scopes to the cycle', () => {
		expect(earliestReq(reqs, 2, 1, 'Mouse')).toEqual({ rebirth: 1, tier: 'Base' });
	});
});
