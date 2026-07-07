import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, seedMinimalReference } from '../testing/db';
import { stagePayload, stagePreview, applyPayload, rollback, listVersions } from './sync';
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

describe('applyPayload', () => {
	it('rejects an unknown checksum (forged/unpreviewed payload)', async () => {
		await expect(applyPayload(sql, { baseVersionId: 1, payloadChecksum: 'deadbeef'.repeat(8), acknowledgedHolds: [] }))
			.rejects.toMatchObject({ status: 422, code: 'unknown_checksum' });
	});

	it('refuses a staged payload carrying a reject-kind flag', async () => {
		const built = validBuilt([{ kind: 'reject', code: 'rebirth_count', message: 'bad', table: 'rebirthReqs' }]);
		const p = await stagePayload(sql, built);
		await expect(applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: [] }))
			.rejects.toMatchObject({ status: 422, code: 'ingest_rejected' });
	});

	it('rejects an unacknowledged hold, then applies when acknowledged', async () => {
		const built = validBuilt([{ kind: 'hold', code: 'ratio_violation', message: 'IG-ish', table: 'droidTiers', key: 'IG/Base' }]);
		const p = await stagePayload(sql, built);
		await expect(applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: [] }))
			.rejects.toMatchObject({ status: 422, code: 'unacknowledged_hold' });
		const res = await applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: ['IG/Base'] });
		expect(res.versionId).toBeGreaterThan(p.baseVersionId);
		expect(await sql`select * from sync_previews where checksum = ${p.payloadChecksum}`).toHaveLength(0); // consumed
		const dv = await sql`select payload from data_versions where id = ${res.versionId}`;
		expect(dv[0].payload).not.toBeNull(); // payload invariant
		expect(await sql`select name from droids`).toEqual([{ name: 'MOUSE' }]); // reference zone swapped
	});

	it('409 on a stale base version', async () => {
		const p = await stagePayload(sql, validBuilt());
		// jsonb serializer on this connection is identity (drizzle rewires it) — pre-stringify, per sync.ts note
		await sql`insert into data_versions (source, checksum, payload) values ('interloper','x',${sql.json(JSON.stringify({}))})`; // N+1 lands
		await expect(applyPayload(sql, { baseVersionId: p.baseVersionId, payloadChecksum: p.payloadChecksum, acknowledgedHolds: [] }))
			.rejects.toMatchObject({ status: 409, code: 'stale_base' });
	});
});

describe('payload invariant', () => {
	it('no data_versions row ever has a null payload after apply', async () => {
		const nulls = await sql`select count(*)::int as n from data_versions where payload is null`;
		expect(nulls[0].n).toBe(0);
	});
});

describe('rollback / listVersions', () => {
	it('rollback re-applies a stored version as a new append-only version', async () => {
		const p2 = await stagePayload(sql, validBuilt());
		const v2 = await applyPayload(sql, { baseVersionId: p2.baseVersionId, payloadChecksum: p2.payloadChecksum, acknowledgedHolds: [] });
		const rb = await rollback(sql, v2.versionId);
		expect(rb.versionId).toBeGreaterThan(v2.versionId);
		const versions = await listVersions(sql);
		expect(versions[0].id).toBe(rb.versionId);        // newest first
		expect(versions.length).toBeGreaterThanOrEqual(3); // fixture v1 + v2 + rollback
		expect(versions.find((v) => v.id === v2.versionId)?.rowCounts).toBeDefined();
	});
});
