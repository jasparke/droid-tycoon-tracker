import { describe, it, expect } from 'vitest';
import { diffTables, isEmpty } from './diff';
import type { PayloadTables } from './types';

const empty: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [] };
const withCommon = { ...empty, chipCosts: [{ rarity: 'Common', toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80, toGalactic: 120 }] };
const mythicChanged = { ...empty, chipCosts: [{ rarity: 'Mythic', toGold: 6000, toDiamond: 13000, toRainbow: 30000, toBeskar: 75000, toGalactic: 120000 }] };
const mythicOld = { ...empty, chipCosts: [{ rarity: 'Mythic', toGold: 8000, toDiamond: 15000, toRainbow: 40000, toBeskar: 80000, toGalactic: 130000 }] };

describe('diffTables', () => {
	it('detects added rows', () => {
		const d = diffTables(empty, withCommon);
		expect(d.chipCosts.added).toHaveLength(1);
		expect(isEmpty(d)).toBe(false);
	});
	it('detects changed rows by PK', () => {
		const d = diffTables(mythicOld, mythicChanged);
		expect(d.chipCosts.changed).toHaveLength(1);
		expect(d.chipCosts.changed[0].key).toBe('Mythic');
	});
	it('identical payloads → empty diff', () => {
		expect(isEmpty(diffTables(withCommon, withCommon))).toBe(true);
	});
	it('does not report a row as changed when only object key order differs', () => {
		const aa = { ...empty, chipCosts: [{ rarity: 'Common', toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80, toGalactic: 120 }] };
		const bb = { ...empty, chipCosts: [{ toGalactic: 120, toBeskar: 80, toRainbow: 40, toDiamond: 25, toGold: 5, rarity: 'Common' }] };
		expect(isEmpty(diffTables(aa, bb))).toBe(true);
	});
});
