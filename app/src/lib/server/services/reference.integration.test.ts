import { describe, it, expect, beforeAll } from 'vitest';
import { testDb, seedMinimalReference } from '../testing/db';
import { getReference } from './reference';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});

describe('getReference', () => {
	it('returns all reference tables and the newest version', async () => {
		const ref = await getReference(db);
		expect(ref.droids.map((d) => d.name).sort()).toEqual(['CB', 'CB-23', 'MOUSE', 'R2-D2']);
		expect(ref.droidTiers.length).toBe(4);
		expect(ref.rebirthReqs.length).toBe(2);
		expect(ref.chipCosts[0].rarity).toBe('Common');
		expect(ref.rebirthMeta[0]).toMatchObject({ rebirth: 12, nova: 11 });
		expect(ref.version?.source).toBe('test-fixture');
	});

	it('serves the new reference tables and iconic columns', async () => {
		const ref = await getReference(db);
		expect(ref.droidSellValues).toEqual([
			{ rarity: 'Common', tier: 'Gold', multiplier: 4 }, { rarity: 'Common', tier: 'Beskar', multiplier: 13 }
		]);
		expect(ref.flawlessSpawn.find((f) => f.tier === 'Base')?.oneIn).toBe(1000);
		expect(ref.novaPaintStages).toHaveLength(3);
		expect(ref.droids.find((d) => d.name === 'R2-D2')).toMatchObject({ incomePct: '25', buyNc: null });
	});
});
