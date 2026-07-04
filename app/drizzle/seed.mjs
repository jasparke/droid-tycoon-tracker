import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://dtt:dtt@localhost:5432/dtt';
const raw = readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8');
const d = JSON.parse(raw);
const sql = postgres(url, { max: 1 });

await sql.begin(async (tx) => {
	// replace-all semantics: reference zone is owned by the seeder (later: sync worker)
	await tx`truncate droids, droid_tiers, rebirth_reqs, chip_costs, rebirth_meta, nova_shop, cosmetics`;
	for (const r of d.droids) await tx`insert into droids ${tx(r)}`;
	for (const r of d.droidTiers)
		await tx`insert into droid_tiers ${tx({ droid: r.droid, tier: r.tier, buy: r.buy, income: r.income, sell: r.sell })}`;
	for (const r of d.rebirthReqs)
		await tx`insert into rebirth_reqs ${tx({ cycle: r.cycle, rebirth: r.rebirth, droid: r.droid, tier: r.tier, credits: r.credits, unlock: r.unlock })}`;
	for (const r of d.chipCosts)
		await tx`insert into chip_costs ${tx({ rarity: r.rarity, to_gold: r.toGold, to_diamond: r.toDiamond, to_rainbow: r.toRainbow, to_beskar: r.toBeskar })}`;
	for (const r of d.rebirthMeta)
		await tx`insert into rebirth_meta ${tx({ rebirth: r.rebirth, nova: r.nova, credit_mult: r.creditMult, xp_mult: r.xpMult })}`;
	for (const r of d.novaShop) await tx`insert into nova_shop ${tx(r)}`;
	for (const r of d.cosmetics) await tx`insert into cosmetics ${tx(r)}`;
	await tx`insert into data_versions ${tx({
		source: 'prototype-constants',
		checksum: createHash('sha256').update(raw).digest('hex')
	})}`;
});
await sql.end();
console.log('seeded');
