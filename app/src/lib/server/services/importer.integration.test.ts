import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone, seedMinimalReference, createTestUser } from '../testing/db';
import { importCode } from './importer';
import { counts, plans, profiles } from '../schema';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number;

const mkCode = (profile: unknown) =>
	Buffer.from(JSON.stringify({ __dt: 1, profile }), 'utf8').toString('base64');

beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await createTestUser(db, 'aa')).id;
});

describe('importCode', () => {
	it('imports profile, counts, plans; skips unknown droids', async () => {
		const code = mkCode({
			name: 'jasparke', cycle: 2, current: 1, hidePast: true,
			counts: { '1|MOUSE|Gold': 3, '1|CB|Base': 1, '1|GHOST-DROID|Beskar': 2 },
			plan: { '2': [9, 8, 1] }
		});
		const res = await importCode(db, uid, code);
		expect(res).toMatchObject({ name: 'jasparke', imported: 2 });
		expect(res.skipped).toEqual(['GHOST-DROID']);
		const p = await db.query.profiles.findFirst({ where: eq(profiles.id, res.profileId) });
		expect(p).toMatchObject({ name: 'jasparke', cycle: 2, currentRebirth: 1, userId: uid });
		expect(await db.select().from(counts).where(eq(counts.profileId, res.profileId))).toHaveLength(2);
		expect(await db.select().from(plans).where(eq(plans.profileId, res.profileId))).toHaveLength(3);
	});
	it('accepts a leading # (URL-hash paste)', async () => {
		const res = await importCode(db, uid, '#' + mkCode({ name: 'x', counts: {}, plan: {} }));
		expect(res.name).toBe('x');
	});
	it('rejects garbage with 422 and creates nothing', async () => {
		await expect(importCode(db, uid, 'not-base64!!!')).rejects.toMatchObject({
			status: 422, code: 'bad_code'
		});
		expect(await db.select().from(profiles)).toHaveLength(0);
	});
	it('skips malformed count keys and invalid plan cycles without losing good rows', async () => {
		const code = mkCode({
			name: 'x',
			counts: { '|MOUSE|Gold': 2, 'abc|MOUSE|Gold': 1, 'garbage': 5, '2|MOUSE|Gold': 3 },
			plan: { abc: [1], '2': [4] }
		});
		const res = await importCode(db, uid, code);
		expect(res.imported).toBe(1);
		expect(res.skipped.sort()).toEqual(['abc|MOUSE|Gold', 'garbage', '|MOUSE|Gold']);
		expect(await db.select().from(counts).where(eq(counts.profileId, res.profileId))).toHaveLength(1);
		expect(await db.select().from(plans).where(eq(plans.profileId, res.profileId))).toHaveLength(1);
	});
	it('dedupes keys normalizing to the same cycle|droid|tier — last occurrence wins', async () => {
		const code = mkCode({ name: 'dup', counts: { '1|MOUSE|Gold': 3, '01|MOUSE|Gold': 7 }, plan: {} });
		const res = await importCode(db, uid, code);
		expect(res.imported).toBe(1);
		const rows = await db.select().from(counts).where(eq(counts.profileId, res.profileId));
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ cycle: 1, droid: 'MOUSE', tier: 'Gold', n: 7 });
	});
	it('skips out-of-range or non-integer n by raw key; drops n=0 silently (0 means absence)', async () => {
		const code = mkCode({
			name: 'nbound',
			counts: { '1|MOUSE|Gold': -1, '1|CB|Base': 1000001, '1|MOUSE|Base': 1.5, '1|MOUSE|Beskar': 0 },
			plan: {}
		});
		const res = await importCode(db, uid, code);
		expect(res.imported).toBe(0);
		expect(res.skipped.sort()).toEqual(['1|CB|Base', '1|MOUSE|Base', '1|MOUSE|Gold']);
		const rows = await db.select().from(counts).where(eq(counts.profileId, res.profileId));
		expect(rows).toHaveLength(0);
	});
	it('a later n=0 shadows an earlier duplicate of the same key', async () => {
		const code = mkCode({ name: 'zshadow', counts: { '1|MOUSE|Gold': 3, '01|MOUSE|Gold': 0 }, plan: {} });
		const res = await importCode(db, uid, code);
		expect(res.imported).toBe(0);
		expect(res.skipped).toEqual([]);
	});
});
