import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone, seedMinimalReference } from '../testing/db';
import { register } from './users';
import { createProfile } from './profiles';
import { setCount } from './counts';
import { counts } from '../schema';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number, pid: number;

beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await register(db, { username: 'aa', password: 'password123', inviteCode: 'x' }, 'x')).id;
	pid = (await createProfile(db, uid, { name: 'main' })).id;
});

describe('setCount', () => {
	it('upserts and updates a row', async () => {
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 2);
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 5);
		const rows = await db.select().from(counts).where(eq(counts.profileId, pid));
		expect(rows).toEqual([expect.objectContaining({ droid: 'MOUSE', tier: 'Gold', n: 5 })]);
	});
	it('n=0 deletes the row', async () => {
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 2);
		await setCount(db, uid, pid, 1, 'MOUSE', 'Gold', 0);
		expect(await db.select().from(counts).where(eq(counts.profileId, pid))).toHaveLength(0);
	});
	it('rejects unknown droid / bad tier / bad n with 422', async () => {
		await expect(setCount(db, uid, pid, 1, 'NOT-A-DROID', 'Gold', 1)).rejects.toMatchObject({
			status: 422, code: 'unknown_droid'
		});
		await expect(setCount(db, uid, pid, 1, 'MOUSE', 'Platinum', 1)).rejects.toMatchObject({
			status: 422, code: 'bad_tier'
		});
		await expect(setCount(db, uid, pid, 1, 'MOUSE', 'Gold', -1)).rejects.toMatchObject({
			status: 422, code: 'bad_count'
		});
	});
	it('stranger cannot write (403)', async () => {
		const other = (await register(db, { username: 'bb', password: 'password123', inviteCode: 'x' }, 'x')).id;
		await expect(setCount(db, other, pid, 1, 'MOUSE', 'Gold', 1)).rejects.toMatchObject({ status: 403 });
	});
});
