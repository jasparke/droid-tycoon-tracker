import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { testDb, resetUserZone, createTestUser } from '../testing/db';
import { listAllProfiles, createProfile, updateProfile, deleteProfile } from './profiles';

let db: Awaited<ReturnType<typeof testDb>>['db'];
let sql: Awaited<ReturnType<typeof testDb>>['sql'];
let alice: { id: number }, bob: { id: number };

beforeAll(async () => ({ db, sql } = await testDb()));
beforeEach(async () => {
	await resetUserZone(sql);
	alice = await createTestUser(db, 'alice');
	bob = await createTestUser(db, 'bob');
});

describe('profiles', () => {
	it('members see every profile with owner name', async () => {
		await createProfile(db, alice.id, { name: 'main' });
		await createProfile(db, bob.id, { name: 'alt' });
		const all = await listAllProfiles(db);
		expect(all.map((p) => `${p.owner}/${p.name}`).sort()).toEqual(['alice/main', 'bob/alt']);
	});
	it('owner can update; stranger gets 403', async () => {
		const p = await createProfile(db, alice.id, { name: 'main' });
		const upd = await updateProfile(db, alice.id, p.id, { cycle: 2, currentRebirth: 9 });
		expect(upd).toMatchObject({ cycle: 2, currentRebirth: 9 });
		await expect(updateProfile(db, bob.id, p.id, { name: 'stolen' })).rejects.toMatchObject({
			status: 403, code: 'not_owner'
		});
	});
	it('missing profile is 404; delete works for owner', async () => {
		await expect(updateProfile(db, alice.id, 999, {})).rejects.toMatchObject({ status: 404 });
		const p = await createProfile(db, alice.id, { name: 'gone' });
		await deleteProfile(db, alice.id, p.id);
		expect(await listAllProfiles(db)).toHaveLength(0);
	});
	it('empty name rejected with 422', async () => {
		await expect(createProfile(db, alice.id, { name: '  ' })).rejects.toMatchObject({ status: 422 });
	});
	it('stranger cannot delete (403)', async () => {
		const p = await createProfile(db, alice.id, { name: 'main' });
		await expect(deleteProfile(db, bob.id, p.id)).rejects.toMatchObject({
			status: 403, code: 'not_owner'
		});
	});
	it('empty name rejected on update with 422', async () => {
		const p = await createProfile(db, alice.id, { name: 'main' });
		await expect(updateProfile(db, alice.id, p.id, { name: '  ' })).rejects.toMatchObject({
			status: 422, code: 'invalid_input'
		});
	});
	it('rejects non-integer / out-of-range cycle with 422', async () => {
		const p = await createProfile(db, alice.id, { name: 'main' });
		await expect(updateProfile(db, alice.id, p.id, { cycle: 'x' as unknown as number })).rejects.toMatchObject({
			status: 422, code: 'invalid_input'
		});
		await expect(updateProfile(db, alice.id, p.id, { cycle: 2147483648 })).rejects.toMatchObject({
			status: 422, code: 'invalid_input'
		});
	});
	it('rejects non-object prefs with 422', async () => {
		const p = await createProfile(db, alice.id, { name: 'main' });
		await expect(updateProfile(db, alice.id, p.id, { prefs: [] })).rejects.toMatchObject({
			status: 422, code: 'invalid_input'
		});
		await expect(updateProfile(db, alice.id, p.id, { prefs: 'x' })).rejects.toMatchObject({
			status: 422, code: 'invalid_input'
		});
	});
	it('accepts a valid patch of all fields', async () => {
		const p = await createProfile(db, alice.id, { name: 'main' });
		const upd = await updateProfile(db, alice.id, p.id, { cycle: 3, currentRebirth: 5, prefs: { theme: 'dark' } });
		expect(upd).toMatchObject({ cycle: 3, currentRebirth: 5, prefs: { theme: 'dark' } });
	});
});
