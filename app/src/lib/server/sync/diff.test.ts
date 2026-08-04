import { describe, it, expect } from 'vitest';
import { diffTables, isEmpty } from './diff';
import type { PayloadTables } from './types';

const empty: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [], craftingTimes: [], companionBuffs: [], iconicCompanionEffects: [] };
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
	it('keys the crafting and companion tables on their full PK tuples', () => {
		const prev = {
			...empty,
			craftingTimes: [{ droid: 'MOUSE', tier: 'Base' as const, seconds: 33 }, { droid: 'MOUSE', tier: 'Gold' as const, seconds: 134 }],
			companionBuffs: [{ kind: 'Worker', rarity: 'Common', tier: 'Base' as const, value: 20 }],
			iconicCompanionEffects: [{ droid: 'BB8', effect: '100% UPGRADE CHIPS' }]
		};
		const next = {
			...prev,
			craftingTimes: [{ droid: 'MOUSE', tier: 'Base' as const, seconds: 33 }, { droid: 'MOUSE', tier: 'Gold' as const, seconds: 140 }],
			companionBuffs: [{ kind: 'Astromech', rarity: 'Common', tier: 'Base' as const, value: 20 }],
			iconicCompanionEffects: [{ droid: 'BB8', effect: '150% UPGRADE CHIPS' }]
		};
		const d = diffTables(prev, next);
		// only the Gold row moved: a PK missing `tier` would collapse both MOUSE rows onto one key
		expect(d.craftingTimes.changed.map((c) => c.key)).toEqual(['MOUSE/Gold']);
		// `kind` is part of the PK, so a Worker row and an Astromech row are different rows
		expect(d.companionBuffs.added).toHaveLength(1);
		expect(d.companionBuffs.removed).toHaveLength(1);
		expect(d.iconicCompanionEffects.changed[0].key).toBe('BB8');
	});
	it('treats a table absent from an older stored payload as all-added, not a crash', () => {
		// `prev` is whatever shape was serialized into data_versions when it was applied, so the
		// first preview after a release that adds a table sees no key for it at all.
		const legacy = { ...empty } as Record<string, unknown>;
		delete legacy.craftingTimes;
		const next = { ...empty, craftingTimes: [{ droid: 'MOUSE', tier: 'Base' as const, seconds: 33 }] };
		const d = diffTables(legacy as unknown as PayloadTables, next);
		expect(d.craftingTimes.added).toHaveLength(1);
		expect(d.craftingTimes.removed).toHaveLength(0);
	});
	it('does not report a row as changed when only object key order differs', () => {
		const aa = { ...empty, chipCosts: [{ rarity: 'Common', toGold: 5, toDiamond: 25, toRainbow: 40, toBeskar: 80, toGalactic: 120 }] };
		const bb = { ...empty, chipCosts: [{ toGalactic: 120, toBeskar: 80, toRainbow: 40, toDiamond: 25, toGold: 5, rarity: 'Common' }] };
		expect(isEmpty(diffTables(aa, bb))).toBe(true);
	});
});
