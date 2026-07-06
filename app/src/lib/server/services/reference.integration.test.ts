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
});
