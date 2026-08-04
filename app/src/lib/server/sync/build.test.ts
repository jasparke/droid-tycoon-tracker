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
	it('carries the crafting tab into the payload', () => {
		const { payload } = buildPayload(CSV_BY_GID, [], 'test', 't');
		expect(payload.meta.rowCounts.craftingTimes).toBeGreaterThan(0);
		expect(payload.meta.rowCounts.companionBuffs).toBeGreaterThan(0);
		expect(payload.meta.rowCounts.iconicCompanionEffects).toBeGreaterThan(0);
	});
	it('flags crafting/companion row counts that are not the live sheet totals', () => {
		// By design on the fixture, exactly as nova_row_count is: these counts are the backstop
		// behind the parser's bounded block scans, which can resolve cleanly and still lose a block.
		const { flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		const rejects = flags.filter((f) => f.kind === 'reject');
		for (const [code, total] of [['crafting_time_row_count', '420'], ['companion_buff_row_count', '108'], ['iconic_effect_row_count', '8']]) {
			expect(rejects.some((f) => f.code === code && f.message.includes(total))).toBe(true);
		}
	});
	it('holds a craft time or iconic effect for a droid missing from the roster', () => {
		const { flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		const holds = flags.filter((f) => f.kind === 'hold' && f.code === 'unknown_droid');
		expect(holds.some((f) => f.table === 'craftingTimes' && f.key === 'HAUL-R/Base')).toBe(true);
		expect(holds.some((f) => f.table === 'iconicCompanionEffects' && f.key === 'CHOPPER')).toBe(true);
	});
	it('finds no structural or emptiness rejects in the repaired fixtures', () => {
		const { flags } = buildPayload(CSV_BY_GID, [], 'test', 't');
		const codes = flags.filter((f) => f.kind === 'reject').map((f) => f.code);
		for (const code of ['empty_table', 'missing_shop_category', 'structural_item', 'bad_shop_level', 'bad_shop_cost', 'missing_chip_rarity']) {
			expect(codes).not.toContain(code);
		}
	});
});
