import postgres from 'postgres';
import { checksumOf } from '../src/lib/server/sync/canonical.js';

const url = process.env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt';
const sql = postgres(url, { max: 1 });
const nulls = await sql`select id from data_versions where payload is null`;
if (nulls.length) {
	const [droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, droidSellValues, flawlessSpawn, novaPaintStages] = await Promise.all([
		sql`select name, rarity, type, income_pct as "incomePct", buy_nc as "buyNc" from droids`,
		sql`select droid, tier, buy, income, sell from droid_tiers`,
		sql`select cycle, rebirth, droid, tier, credits, unlock from rebirth_reqs`,
		sql`select rarity, to_gold as "toGold", to_diamond as "toDiamond", to_rainbow as "toRainbow", to_beskar as "toBeskar" from chip_costs`,
		sql`select rebirth, nova, credit_mult as "creditMult", xp_mult as "xpMult" from rebirth_meta`,
		sql`select category, item, level, cost from nova_shop`,
		sql`select category, name, requirement from cosmetics`,
		sql`select rarity, tier, multiplier from droid_sell_values`,
		sql`select tier, one_in as "oneIn" from flawless_spawn`,
		sql`select stage, crystal_cost as "crystalCost" from nova_paint_stages`
	]);
	const tables = { droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics, droidSellValues, flawlessSpawn, novaPaintStages };
	const payload = { meta: { source: 'backfill', fetchedAt: new Date().toISOString(), tabChecksums: {}, rowCounts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), orphanReport: [] }, tables };
	for (const { id } of nulls) await sql`update data_versions set payload = ${sql.json(payload)}, checksum = ${checksumOf(tables)} where id = ${id}`;
	console.log(`backfilled ${nulls.length} version(s)`);
}
await sql.end();
