// Rebuild drizzle/seed-data.json from Google Sheets CSV exports of the four
// synced tabs, through the same parsers + validation the live sync uses — so a
// later sync against the same sheet state stages a clean (empty) diff.
//
// Usage (from app/):
//   npx tsx scripts/regen-seed-data.ts <csv-dir>
//
// <csv-dir> must contain gid_<gid>.csv for the four tabs:
//   gid_0.csv           DroidexRebirths
//   gid_1248391507.csv  Droid Reference Sheet (costs/values)
//   gid_547464940.csv   Cosmetics
//   gid_1548395368.csv  Nova Crystals + Shop Reference
// each fetched via .../export?format=csv&gid=<gid> on the sheet.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPayload } from '../src/lib/server/sync/build';
import { rejectsOf } from '../src/lib/server/sync/validate';

const dir = process.argv[2];
if (!dir) {
	console.error('usage: npx tsx scripts/regen-seed-data.ts <csv-dir>');
	process.exit(1);
}
const GIDS = ['0', '1248391507', '547464940', '1548395368'];
const csvByGid = Object.fromEntries(GIDS.map((g) => [g, readFileSync(join(dir, `gid_${g}.csv`), 'utf8')]));

const { payload, flags } = buildPayload(csvByGid, [], 'regen-seed-data', new Date().toISOString());
for (const f of flags.filter((f) => f.kind !== 'reject')) {
	console.warn(`[${f.kind}] ${f.code}: ${f.message}`);
}
const rejects = rejectsOf(flags);
if (rejects.length) {
	for (const f of rejects) console.error(`[reject] ${f.code}: ${f.message}`);
	process.exit(1);
}

const target = join(dirname(fileURLToPath(import.meta.url)), '../drizzle/seed-data.json');
writeFileSync(target, JSON.stringify(payload.tables, null, 1) + '\n');
for (const [k, v] of Object.entries(payload.tables)) console.log(`${k}: ${(v as unknown[]).length}`);
