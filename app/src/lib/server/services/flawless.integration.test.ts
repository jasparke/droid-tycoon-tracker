import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { testDb, resetUserZone, seedMinimalReference, createTestUser } from '../testing/db';
import { createProfile } from './profiles';
import { setFlawless, listFlawless } from './flawless';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let uid: number, pid: number;

beforeAll(async () => {
	({ db, sql } = await testDb());
	await seedMinimalReference(sql);
});
beforeEach(async () => {
	await resetUserZone(sql);
	uid = (await createTestUser(db, 'fl')).id;
	pid = (await createProfile(db, uid, { name: 'main' })).id;
});

describe('setFlawless', () => {
	it('marks, lists and clears ownership', async () => {
		await setFlawless(db, uid, pid, 'MOUSE', true);
		await setFlawless(db, uid, pid, 'CB', true);
		expect(await listFlawless(db, pid)).toEqual(['CB', 'MOUSE']);
		await setFlawless(db, uid, pid, 'MOUSE', false);
		expect(await listFlawless(db, pid)).toEqual(['CB']);
	});
	it('is idempotent in both directions', async () => {
		await setFlawless(db, uid, pid, 'MOUSE', true);
		await setFlawless(db, uid, pid, 'MOUSE', true);
		expect(await listFlawless(db, pid)).toEqual(['MOUSE']);
		await setFlawless(db, uid, pid, 'MOUSE', false);
		await setFlawless(db, uid, pid, 'MOUSE', false);
		expect(await listFlawless(db, pid)).toEqual([]);
	});
	it('rejects an unknown droid with 422', async () => {
		await expect(setFlawless(db, uid, pid, 'NOT-A-DROID', true)).rejects.toMatchObject({
			status: 422, code: 'unknown_droid'
		});
	});
	it('rejects an Iconic droid — Iconics have no flawless variant', async () => {
		await expect(setFlawless(db, uid, pid, 'R2-D2', true)).rejects.toMatchObject({
			status: 422, code: 'not_flawless_eligible'
		});
	});
	it('stranger cannot write (403)', async () => {
		const other = (await createTestUser(db, 'stranger')).id;
		await expect(setFlawless(db, other, pid, 'MOUSE', true)).rejects.toMatchObject({ status: 403 });
	});
});
