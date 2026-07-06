import {
	pgTable, serial, text, integer, bigint, timestamp, jsonb, primaryKey, numeric
} from 'drizzle-orm/pg-core';

// ---------- user zone ----------
export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	username: text('username').notNull().unique(),
	pwHash: text('pw_hash').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	token: text('token').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

export const profiles = pgTable('profiles', {
	id: serial('id').primaryKey(),
	userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	cycle: integer('cycle').notNull().default(1),
	currentRebirth: integer('current_rebirth').notNull().default(0),
	prefs: jsonb('prefs').notNull().default({})
});

export const counts = pgTable('counts', {
	profileId: integer('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
	cycle: integer('cycle').notNull(),
	droid: text('droid').notNull(),
	tier: text('tier').notNull(),
	n: integer('n').notNull()
}, (t) => [primaryKey({ columns: [t.profileId, t.cycle, t.droid, t.tier] })]);

export const plans = pgTable('plans', {
	profileId: integer('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
	cycle: integer('cycle').notNull(),
	rebirth: integer('rebirth').notNull()
}, (t) => [primaryKey({ columns: [t.profileId, t.cycle, t.rebirth] })]);

// ---------- reference zone (no FKs from user zone — see spec) ----------
export const droids = pgTable('droids', {
	name: text('name').primaryKey(),
	rarity: text('rarity').notNull(),
	type: text('type').notNull(),
	incomePct: numeric('income_pct'),      // Iconic %/s (droid-level; Iconics have no tier grid)
	buyNc: integer('buy_nc')                // CB-23's 75 nova-crystal Base cost
});

export const droidTiers = pgTable('droid_tiers', {
	droid: text('droid').notNull(),
	tier: text('tier').notNull(),
	buy: bigint('buy', { mode: 'number' }),
	income: bigint('income', { mode: 'number' }),
	sell: bigint('sell', { mode: 'number' })
}, (t) => [primaryKey({ columns: [t.droid, t.tier] })]);

export const rebirthReqs = pgTable('rebirth_reqs', {
	cycle: integer('cycle').notNull(),
	rebirth: integer('rebirth').notNull(),
	droid: text('droid').notNull(),
	tier: text('tier').notNull(),
	credits: text('credits').notNull(),
	unlock: text('unlock')
}, (t) => [primaryKey({ columns: [t.cycle, t.rebirth, t.droid, t.tier] })]);

export const chipCosts = pgTable('chip_costs', {
	rarity: text('rarity').primaryKey(),
	toGold: integer('to_gold'),             // nullable now: Iconic row is all-N/A
	toDiamond: integer('to_diamond'),
	toRainbow: integer('to_rainbow'),
	toBeskar: integer('to_beskar')
});

export const rebirthMeta = pgTable('rebirth_meta', {
	rebirth: integer('rebirth').primaryKey(),
	nova: integer('nova').notNull(),
	creditMult: integer('credit_mult').notNull(),
	xpMult: integer('xp_mult').notNull()
});

export const novaShop = pgTable('nova_shop', {
	category: text('category').notNull(),
	item: text('item').notNull(),
	level: integer('level').notNull(),
	cost: integer('cost').notNull()
}, (t) => [primaryKey({ columns: [t.category, t.item, t.level] })]);

export const cosmetics = pgTable('cosmetics', {
	category: text('category').notNull(),
	name: text('name').notNull(),
	requirement: text('requirement').notNull()
}, (t) => [primaryKey({ columns: [t.category, t.name] })]);

export const dataVersions = pgTable('data_versions', {
	id: serial('id').primaryKey(),
	ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
	source: text('source').notNull(),
	checksum: text('checksum').notNull(),
	payload: jsonb('payload')               // code-invariant: always written (see plan deviation note)
});

export const droidSellValues = pgTable('droid_sell_values', {
	rarity: text('rarity').notNull(),
	tier: text('tier').notNull(),           // Gold|Diamond|Rainbow|Beskar (no Base column in sheet)
	multiplier: integer('multiplier').notNull()
}, (t) => [primaryKey({ columns: [t.rarity, t.tier] })]);

export const flawlessSpawn = pgTable('flawless_spawn', {
	tier: text('tier').primaryKey(),        // Base|Gold|Diamond|Rainbow|Beskar
	oneIn: integer('one_in').notNull()      // probability = 1/oneIn
});

export const novaPaintStages = pgTable('nova_paint_stages', {
	stage: integer('stage').primaryKey(),   // global ladder: 1→30, 2→120, 3→400
	crystalCost: integer('crystal_cost').notNull()
});

export const syncPreviews = pgTable('sync_previews', {
	checksum: text('checksum').primaryKey(),
	baseVersionId: integer('base_version_id').notNull(),
	payload: jsonb('payload').notNull(),
	flags: jsonb('flags').notNull(),
	builtAt: timestamp('built_at', { withTimezone: true }).notNull().defaultNow()
});
