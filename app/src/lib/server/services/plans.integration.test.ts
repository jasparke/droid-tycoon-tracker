import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, resetUserZone } from '../testing/db';
import { register } from './users';
import { createProfile } from './profiles';
import { replacePlan } from './plans';
import { plans } from '../schema';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number, pid: number;

beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await register(db, { username: 'aa', password: 'password123', inviteCode: 'x' }, 'x')).id;
	pid = (await createProfile(db, uid, { name: 'main' })).id;
});

describe('replacePlan', () => {
	it('replaces the set atomically', async () => {
		await replacePlan(db, uid, pid, 2, [1, 2, 3]);
		await replacePlan(db, uid, pid, 2, [9, 10]);
		const rows = await db.select().from(plans).where(eq(plans.profileId, pid));
		expect(rows.map((r) => r.rebirth).sort()).toEqual([10, 9].sort());
	});
	it('empty array clears the plan', async () => {
		await replacePlan(db, uid, pid, 2, [4]);
		await replacePlan(db, uid, pid, 2, []);
		expect(await db.select().from(plans).where(eq(plans.profileId, pid))).toHaveLength(0);
	});
	it('rejects out-of-range rebirths with 422', async () => {
		await expect(replacePlan(db, uid, pid, 2, [0])).rejects.toMatchObject({ status: 422 });
		await expect(replacePlan(db, uid, pid, 2, [28])).rejects.toMatchObject({ status: 422 });
	});
});
