import type postgres from 'postgres';
type Sql = postgres.Sql;
import { buildPayload } from '../sync/build';
import { diffTables } from '../sync/diff';
import type { Payload, PayloadTables, Flag } from '../sync/types';

const EMPTY_TABLES: PayloadTables = { droids: [], droidTiers: [], rebirthReqs: [], chipCosts: [], rebirthMeta: [], novaShop: [], cosmetics: [], droidSellValues: [], flawlessSpawn: [], novaPaintStages: [] };

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
