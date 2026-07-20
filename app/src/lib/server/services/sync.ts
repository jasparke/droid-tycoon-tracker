import type postgres from 'postgres';
type Sql = postgres.Sql;
import { buildPayload } from '../sync/build';
import { diffTables } from '../sync/diff';
import type { Payload, PayloadTables, Flag } from '../sync/types';
import { ApiError } from '../api-error';
import { checksumOf } from '../sync/canonical.js';

const EMPTY_TABLES: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [] };
const SYNC_APPLY_LOCK = 4242; // fixed advisory-lock key serializing all apply/rollback transactions

async function activeVersion(sql: Sql): Promise<{ id: number; checksum: string; payload: Payload | null } | null> {
	const rows = await sql`select id, checksum, payload from data_versions order by id desc limit 1`;
	return rows[0] ? { id: rows[0].id, checksum: rows[0].checksum, payload: rows[0].payload } : null;
}

export async function stagePayload(sql: Sql, built: { payload: Payload; flags: Flag[]; checksum: string }) {
	const active = await activeVersion(sql);
	const baseVersionId = active?.id ?? 0;
	if (active && active.checksum === built.checksum) {
		return { noOp: true, diff: {}, flags: built.flags, orphans: built.payload.meta.orphanReport, baseVersionId, payloadChecksum: built.checksum };
	}
	const diff = diffTables(active?.payload?.tables ?? EMPTY_TABLES, built.payload.tables);
	// drizzle() rewires this connection's jsonb/json serializers to a transparent passthrough
	// (it does its own JSON encoding for query-builder writes), so sql.json() on a raw tagged
	// query must be handed an already-stringified value or the object goes over the wire unserialized.
	await sql`insert into sync_previews (checksum, base_version_id, payload, flags)
		values (${built.checksum}, ${baseVersionId}, ${sql.json(JSON.stringify(built.payload))}, ${sql.json(JSON.stringify(built.flags))})
		on conflict (checksum) do update set base_version_id = excluded.base_version_id, payload = excluded.payload, flags = excluded.flags, built_at = now()`;
	return { noOp: false, diff, flags: built.flags, orphans: built.payload.meta.orphanReport, baseVersionId, payloadChecksum: built.checksum };
}

export async function stagePreview(sql: Sql, csvByGid: Record<string, string>, source: string, fetchedAt: string) {
	const countKeys = await sql`select distinct droid, tier, profile_id as "profileId" from counts`;
	const built = buildPayload(csvByGid, countKeys as unknown as { droid: string; tier: string; profileId: number }[], source, fetchedAt);
	return stagePayload(sql, built);
}

const REF_TABLES = ['droids', 'droid_tiers', 'rebirth_reqs', 'chip_costs', 'rebirth_meta', 'nova_shop', 'cosmetics', 'droid_sell_values', 'flawless_spawn', 'nova_paint_stages'];

// payload rows are camelCase; convert to DB snake_case for insert. No reference table has a jsonb
// column, so the postgres.js object helper handles the scalar values fine.
function snakeRow(r: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(r)) out[k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())] = v;
	return out;
}
function insertRows(tx: postgres.TransactionSql, table: string, rows: Record<string, unknown>[]) {
	return Promise.all(rows.map((r) => tx`insert into ${tx(table)} ${tx(snakeRow(r))}`));
}

export async function applyPayload(sql: Sql, input: { baseVersionId: number; payloadChecksum: string; acknowledgedHolds: string[] }): Promise<{ versionId: number }> {
	// sync_previews has no `source` column (see migration 0001) — the provenance lives in payload.meta.source.
	const staged = await sql`select payload, flags from sync_previews where checksum = ${input.payloadChecksum}`;
	if (!staged[0]) throw new ApiError(422, 'unknown_checksum', 'No staged preview for that checksum — re-preview first');
	const flags = staged[0].flags as Flag[];
	// jsonb reads on this connection come back pre-parsed (drizzle only rewires the *serializers* for
	// json/jsonb to identity, not the parsers — see the stagePayload note above) but guard defensively
	// in case a driver/config change ever makes this come back as a raw string.
	const rawPayload = staged[0].payload;
	const payload = (typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload) as Payload;

	if (flags.some((f) => f.kind === 'reject')) throw new ApiError(422, 'ingest_rejected', 'Payload failed a reject-class invariant — ingest refused');
	const ackd = new Set(input.acknowledgedHolds);
	for (const f of flags.filter((x) => x.kind === 'hold')) {
		if (!f.key || !ackd.has(f.key)) throw new ApiError(422, 'unacknowledged_hold', `Hold not acknowledged: ${f.key ?? '(no key)'} (${f.message})`);
	}

	let versionId = 0;
	await sql.begin(async (tx) => {
		// Serialize apply/rollback on a fixed advisory lock so the version re-read below sees any
		// concurrently-committed newer version. (SELECT..ORDER BY id DESC LIMIT 1 FOR UPDATE does not:
		// after blocking, EvalPlanQual re-locks the same row and misses a concurrent insert.)
		await tx`select pg_advisory_xact_lock(${SYNC_APPLY_LOCK})`;
		const active = await tx`select max(id)::int as id from data_versions`;
		const activeId = active[0]?.id ?? 0;
		if (activeId !== input.baseVersionId) throw new ApiError(409, 'stale_base', `Active version is ${activeId}, preview was against ${input.baseVersionId} — re-preview`);

		await tx`truncate ${tx.unsafe(REF_TABLES.join(', '))}`;
		const t = payload.tables as unknown as Record<string, Record<string, unknown>[]>;
		await insertRows(tx, 'droids', t.droids);
		await insertRows(tx, 'droid_tiers', t.droidTiers);
		await insertRows(tx, 'rebirth_reqs', t.rebirthReqs);
		await insertRows(tx, 'chip_costs', t.chipCosts);
		await insertRows(tx, 'rebirth_meta', t.rebirthMeta);
		await insertRows(tx, 'nova_shop', t.novaShop);
		await insertRows(tx, 'cosmetics', t.cosmetics);
		await insertRows(tx, 'droid_sell_values', t.droidSellValues);
		await insertRows(tx, 'flawless_spawn', t.flawlessSpawn);
		await insertRows(tx, 'nova_paint_stages', t.novaPaintStages);

		// same identity-serializer gotcha as stagePayload's insert: pre-stringify before tx.json().
		const inserted = await tx`insert into data_versions (source, checksum, payload)
			values (${payload.meta.source}, ${input.payloadChecksum}, ${tx.json(JSON.stringify(payload))}) returning id`;
		versionId = inserted[0].id;
		await tx`delete from sync_previews where checksum = ${input.payloadChecksum}`;
	});
	return { versionId };
}

export async function rollback(sql: Sql, versionId: number): Promise<{ versionId: number }> {
	const rows = await sql`select payload, source from data_versions where id = ${versionId}`;
	if (!rows[0]) throw new ApiError(404, 'not_found', `No version ${versionId}`);
	// legacy pre-autosync rows have payload NULL (the column is nullable; the invariant is
	// code-only) — drizzle/backfill-payload.mjs exists to repair them.
	const payload = rows[0].payload as Payload | null;
	if (!payload?.tables) throw new ApiError(422, 'no_payload', `Version ${versionId} has no stored payload (legacy row) — run drizzle/backfill-payload.mjs, then retry`);
	const checksum = checksumOf(payload.tables as unknown as Record<string, unknown[]>);
	const active = await sql`select id from data_versions order by id desc limit 1`;
	const baseVersionId = active[0]?.id ?? 0;
	// same identity-serializer gotcha as stagePayload's insert: pre-stringify before sql.json().
	await sql`insert into sync_previews (checksum, base_version_id, payload, flags)
		values (${checksum}, ${baseVersionId}, ${sql.json(JSON.stringify(payload))}, ${sql.json(JSON.stringify([]))})
		on conflict (checksum) do update set base_version_id = excluded.base_version_id, payload = excluded.payload, flags = excluded.flags, built_at = now()`;
	return applyPayload(sql, { baseVersionId, payloadChecksum: checksum, acknowledgedHolds: [] });
}

export interface VersionSummary {
	id: number;
	ingestedAt: Date;
	source: string;
	rowCounts: Record<string, number> | null;
	orphanReport: unknown[];
}

export async function listVersions(sql: Sql): Promise<VersionSummary[]> {
	const rows = await sql`select id, ingested_at as "ingestedAt", source, payload from data_versions order by id desc`;
	return rows.map((r) => ({
		id: r.id,
		ingestedAt: r.ingestedAt,
		source: r.source,
		rowCounts: (r.payload?.meta?.rowCounts as Record<string, number> | undefined) ?? null,
		orphanReport: (r.payload?.meta?.orphanReport as unknown[] | undefined) ?? []
	}));
}
