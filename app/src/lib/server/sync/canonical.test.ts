import { describe, it, expect } from 'vitest';
import { serialize, checksumOf } from './canonical.js';

const A = { droids: [{ name: 'B', rarity: 'Rare', type: 'Worker' }, { name: 'A', rarity: 'Common', type: 'Battle' }], chipCosts: [] };
const B = { chipCosts: [], droids: [{ type: 'Battle', rarity: 'Common', name: 'A' }, { rarity: 'Rare', type: 'Worker', name: 'B' }] };

describe('canonical serialize', () => {
	it('is order-independent across keys and array element order (by PK)', () => {
		expect(serialize(A)).toBe(serialize(B));
		expect(checksumOf(A)).toBe(checksumOf(B));
	});
	it('produces a 64-char hex checksum', () => {
		expect(checksumOf(A)).toMatch(/^[0-9a-f]{64}$/);
	});
	it('distinguishes different data', () => {
		const C = { droids: [{ name: 'A', rarity: 'Epic', type: 'Battle' }], chipCosts: [] };
		expect(checksumOf(A)).not.toBe(checksumOf(C));
	});
	it('throws on a table with no primary-key ordering defined', () => {
		expect(() => serialize({ mystery: [{ a: 1 }] })).toThrow(/primary-key ordering/);
	});
	it('orders multi-column-PK rows deterministically', () => {
		const x = { droidTiers: [{ droid: 'A', tier: 'Gold' }, { droid: 'A', tier: 'Base' }] };
		const y = { droidTiers: [{ droid: 'A', tier: 'Base' }, { droid: 'A', tier: 'Gold' }] };
		expect(serialize(x)).toBe(serialize(y));
	});
});
