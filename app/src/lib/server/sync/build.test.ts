import { describe, it, expect } from 'vitest';
import { buildPayload } from './build';
import { CSV_BY_GID } from './__fixtures__/tabs';

describe('buildPayload', () => {
	it('assembles a payload with a stable checksum and per-tab checksums', () => {
		const a = buildPayload(CSV_BY_GID, [], 'test', '2026-07-05T00:00:00Z');
		const b = buildPayload(CSV_BY_GID, [], 'test', '2026-07-05T00:00:00Z');
		expect(a.checksum).toBe(b.checksum);
		expect(a.checksum).toMatch(/^[0-9a-f]{64}$/);
		expect(Object.keys(a.payload.meta.tabChecksums).sort()).toEqual(['0', '1131770079', '1248391507', '1548395368', '547464940']);
		expect(a.payload.meta.rowCounts.droids).toBeGreaterThan(0);
	});
	it('flags the partial rebirth set as a reject (not 324)', () => {
		const { flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		expect(flags.some((f) => f.kind === 'reject' && f.code === 'rebirth_count')).toBe(true);
	});
	it('flags a nova shop row count that is not the live sheet total', () => {
		// Second layer behind the parser's header anchoring: anchoring can resolve cleanly and
		// still lose a ladder if the sheet drifts, and a short table looks perfectly well-formed.
		const { payload, flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		expect(payload.meta.rowCounts.novaShop).toBe(19); // the fixture's own exact total
		expect(flags.some((f) => f.kind === 'reject' && f.code === 'nova_row_count' && f.message.includes('175'))).toBe(true);
	});
	it('finds no structural or emptiness rejects in the repaired fixtures', () => {
		const { flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		const codes = flags.filter((f) => f.kind === 'reject').map((f) => f.code);
		for (const code of ['empty_table', 'missing_shop_category', 'structural_item', 'bad_shop_level', 'bad_shop_cost', 'missing_chip_rarity']) {
			expect(codes).not.toContain(code);
		}
	});
});
