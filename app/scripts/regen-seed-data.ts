// Rebuild drizzle/seed-data.json from Google Sheets CSV exports of the five
// synced tabs, through the same parsers + validation the live sync uses — so a
// later sync against the same sheet state stages a clean (empty) diff.
//
// Usage (from app/):
//   npx tsx scripts/regen-seed-data.ts <csv-dir>
//
// <csv-dir> must contain gid_<gid>.csv for the five synced tabs:
//   gid_0.csv           DroidexRebirths
//   gid_1248391507.csv  Droid Reference Sheet (costs/values)
//   gid_547464940.csv   Cosmetics
//   gid_1548395368.csv  Nova Crystals + Shop Reference
//   gid_1131770079.csv  Droid Crafting Times + Companion Buffs
// each fetched via .../export?format=csv&gid=<gid> on the sheet.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPayload } from '../src/lib/server/sync/build';
import { holdToken, rejectsOf } from '../src/lib/server/sync/validate';

const dir = process.argv[2];
if (!dir) {
	console.error('usage: npx tsx scripts/regen-seed-data.ts <csv-dir>');
	process.exit(1);
}
const GIDS = ['0', '1248391507', '547464940', '1548395368', '1131770079'];

// Holds are "an admin must look at this" signals. Regenerating the committed seed is not an
// admin session, so an unexpected hold aborts. Add a `code:key` token here (with a comment saying
// why and when it should clear) only when the sheet state is knowingly accepted — the same tokens
// POST /api/sync/apply takes in acknowledgedHolds. Allowing a bare key would clear every hold code
// sharing that key, which is exactly the signal this list exists to keep.
const ALLOWED_HOLDS = new Set<string>([]);

const csvByGid = Object.fromEntries(GIDS.map((g) => [g, readFileSync(join(dir, `gid_${g}.csv`), 'utf8')]));

const { payload, flags } = buildPayload(csvByGid, [], 'regen-seed-data', new Date().toISOString());
for (const f of flags.filter((f) => f.kind === 'report')) console.warn(`[report] ${f.code}: ${f.message}`);

const holds = flags.filter((f) => f.kind === 'hold');
const unexpected = holds.filter((f) => !ALLOWED_HOLDS.has(holdToken(f)));
for (const f of holds) console.warn(`[hold] ${f.code}: ${f.message}`);
if (unexpected.length) {
	console.error(`\n${unexpected.length} unexpected hold(s) — refusing to regenerate the seed.`);
	console.error('Investigate the sheet, then either fix the parser/aliases or add the token to ALLOWED_HOLDS with a reason:');
	for (const f of unexpected) console.error(`  ${holdToken(f)}  ${f.message}`);
	process.exit(1);
}
const rejects = rejectsOf(flags);
if (rejects.length) {
	for (const f of rejects) console.error(`[reject] ${f.code}: ${f.message}`);
	process.exit(1);
}

const target = join(dirname(fileURLToPath(import.meta.url)), '../drizzle/seed-data.json');
writeFileSync(target, JSON.stringify(payload.tables, null, 1) + '\n');
for (const [k, v] of Object.entries(payload.tables)) console.log(`${k}: ${(v as unknown[]).length}`);
