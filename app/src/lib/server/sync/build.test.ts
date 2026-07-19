import { describe, it, expect } from 'vitest';
import { buildPayload } from './build';
import { CSV_BY_GID } from './__fixtures__/tabs';

describe('buildPayload', () => {
	it('assembles a payload with a stable checksum and per-tab checksums', () => {
		const a = buildPayload(CSV_BY_GID, [], 'test', '2026-07-05T00:00:00Z');
		const b = buildPayload(CSV_BY_GID, [], 'test', '2026-07-05T00:00:00Z');
		expect(a.checksum).toBe(b.checksum);
		expect(a.checksum).toMatch(/^[0-9a-f]{64}$/);
		expect(Object.keys(a.payload.meta.tabChecksums).sort()).toEqual(['0', '1248391507', '1548395368', '547464940']);
		expect(a.payload.meta.rowCounts.droids).toBeGreaterThan(0);
	});
	it('flags the partial rebirth set as a reject (not 324)', () => {
		const { flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		expect(flags.some((f) => f.kind === 'reject' && f.code === 'rebirth_count')).toBe(true);
	});
});
