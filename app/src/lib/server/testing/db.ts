import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../schema';
import { findOrCreateOidcUser } from '../services/users';

const url = process.env.DATABASE_URL_TEST ?? 'postgres://dtt:dtt@localhost:5432/dtt_test';
let cached: { db: ReturnType<typeof drizzle<typeof schema>>; sql: postgres.Sql } | null = null;

export async function testDb() {
	if (cached) return cached;
	const sql = postgres(url, { max: 4, onnotice: () => {} });
	const db = drizzle(sql, { schema });
	await migrate(db, { migrationsFolder: 'drizzle/migrations' });
	cached = { db, sql };
	return cached;
}

export async function resetUserZone(sql: postgres.Sql) {
	await sql`truncate users, sessions, profiles, counts, plans restart identity cascade`;
}

// tests that only need "some user" create one keyed by a readable sub
export async function createTestUser(
	db: Awaited<ReturnType<typeof testDb>>['db'],
	name: string
) {
	return findOrCreateOidcUser(db, { sub: `test-${name}`, email: `${name}@test.local`, name });
}

export async function seedMinimalReference(sql: postgres.Sql) {
	await sql`truncate droids, droid_tiers, rebirth_reqs, chip_costs, rebirth_meta, nova_shop, cosmetics, data_versions restart identity cascade`;
	await sql`insert into droids (name, rarity, type) values ('MOUSE','Common','Worker'), ('CB','Common','Astromech')`;
	await sql`insert into droid_tiers (droid, tier, buy, income, sell) values
		('MOUSE','Base',950,2,665), ('MOUSE','Beskar',15200,24,10640), ('CB','Base',1000,2,700)`;
	await sql`insert into rebirth_reqs (cycle, rebirth, droid, tier, credits, unlock) values
		(1,1,'CB','Base','10K','Worker Slot'), (1,2,'MOUSE','Gold','150K',null)`;
	await sql`insert into chip_costs (rarity, to_gold, to_diamond, to_rainbow, to_beskar) values ('Common',5,25,40,80)`;
	await sql`insert into rebirth_meta (rebirth, nova, credit_mult, xp_mult) values (12,11,22,110)`;
	await sql`insert into data_versions (source, checksum) values ('test-fixture','deadbeef')`;
}
