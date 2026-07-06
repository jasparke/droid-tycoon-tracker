import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, seedMinimalReference } from '../testing/db';
import { stagePayload, stagePreview } from './sync';
import { validBuilt, CSV_BY_GID } from '../sync/__fixtures__/tabs';

let sql: Awaited<ReturnType<typeof testDb>>['sql'];
beforeEach(async () => { ({ sql } = await testDb()); await seedMinimalReference(sql); });

describe('stagePayload / stagePreview', () => {
	it('stages a valid payload and returns a diff + checksum', async () => {
		const res = await stagePayload(sql, validBuilt());
		expect(res.noOp).toBe(false);
		expect(res.payloadChecksum).toMatch(/^[0-9a-f]{64}$/);
		const staged = await sql`select * from sync_previews where checksum = ${res.payloadChecksum}`;
		expect(staged).toHaveLength(1);
	});
	it('short-circuits a no-op when the checksum equals the active version', async () => {
		const built = validBuilt();
		await sql`update data_versions set checksum = ${built.checksum} where id = (select max(id) from data_versions)`;
		const res = await stagePayload(sql, built);
		expect(res.noOp).toBe(true);
		const staged = await sql`select * from sync_previews where checksum = ${built.checksum}`;
		expect(staged).toHaveLength(0);
	});
	it('stagePreview through the partial parser fixtures surfaces a reject flag', async () => {
		const res = await stagePreview(sql, CSV_BY_GID, 'sheet', 't');
		expect(res.flags.some((f) => f.kind === 'reject')).toBe(true);
	});
});
