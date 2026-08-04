import type { PayloadTables, Flag } from './types';

const RARITIES = new Set(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Iconic']);
const TYPES = new Set(['Worker', 'Astromech', 'Battle']);
const REQUIRED_CHIP_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
// Tables that are never legitimately empty. A geometry drift used to parse "successfully"
// into nothing (or into garbage) — an empty table is now a hard reject, not a quiet sync.
const NEVER_EMPTY = ['novaShop', 'rebirthMeta', 'novaPaintStages', 'droidSellValues', 'flawlessSpawn',
	'craftingTimes', 'companionBuffs', 'iconicCompanionEffects', 'cosmetics', 'droids', 'droidTiers'] as const;
const SHOP_CATEGORIES = ['Featured', 'Core upgrades', 'Workshop upgrades'];
// 'Level' / 'Nova Crystal Cost' are structural headers; seeing one as an item name means the
// parser read a header column as a data column (the pre-2026-08 positional-parser failure).
const STRUCTURAL_ITEMS = new Set(['Level', 'Nova Crystal Cost']);

export function validate(t: PayloadTables, existingCountKeys: { droid: string; tier: string; profileId: number }[]): Flag[] {
	const flags: Flag[] = [];

	for (const d of t.droids) {
		if (!RARITIES.has(d.rarity)) flags.push({ kind: 'reject', code: 'bad_rarity', message: `${d.name}: ${d.rarity}`, table: 'droids', key: d.name });
		if (!TYPES.has(d.type)) flags.push({ kind: 'reject', code: 'bad_type', message: `${d.name}: ${d.type}`, table: 'droids', key: d.name });
	}

	const known = new Set(t.droids.map((d) => d.name));

	// tier-grid ratio check (non-Iconic): value ≈ 0.7×cost (±15%). HOLD (this catches IG).
	const iconic = new Set(t.droids.filter((d) => d.rarity === 'Iconic').map((d) => d.name));
	for (const row of t.droidTiers) {
		// no FK backs droid_tiers.droid → droids.name, so an unparsed/renamed droid would land as
		// silent dead rows; HOLD so an admin either fixes the sheet/aliases or knowingly accepts.
		if (!known.has(row.droid)) flags.push({ kind: 'hold', code: 'unknown_droid', message: `${row.droid}/${row.tier}: tier row for a droid missing from the reference tab`, table: 'droidTiers', key: `${row.droid}/${row.tier}` });
		for (const [field, v] of [['buy', row.buy], ['income', row.income], ['sell', row.sell]] as const) {
			if (v != null && v < 0) flags.push({ kind: 'reject', code: 'negative_value', message: `${row.droid}/${row.tier}: ${field}=${v}`, table: 'droidTiers', key: `${row.droid}/${row.tier}` });
		}
		if (iconic.has(row.droid) || row.buy == null || row.sell == null) continue;
		const ratio = row.sell / row.buy;
		if (ratio < 0.55 || ratio > 0.85) {
			flags.push({ kind: 'hold', code: 'ratio_violation', message: `${row.droid}/${row.tier}: sell/buy=${ratio.toFixed(2)} (expected ~0.70) — likely corrupt`, table: 'droidTiers', key: `${row.droid}/${row.tier}` });
		}
	}

	const chipR = new Set(t.chipCosts.map((c) => c.rarity));
	for (const r of REQUIRED_CHIP_RARITIES) {
		if (!chipR.has(r)) flags.push({ kind: 'reject', code: 'missing_chip_rarity', message: r, table: 'chipCosts' });
	}

	// rebirth-meta contiguous
	const rbs = t.rebirthMeta.map((m) => m.rebirth).sort((a, b) => a - b);
	for (let i = 1; i < rbs.length; i++) {
		if (rbs[i] !== rbs[i - 1] + 1) { flags.push({ kind: 'reject', code: 'rebirth_meta_gap', message: `gap after RB ${rbs[i - 1]}`, table: 'rebirthMeta' }); break; }
	}

	for (const table of NEVER_EMPTY) {
		if (t[table].length === 0) {
			flags.push({ kind: 'reject', code: 'empty_table', message: `${table} parsed to zero rows — sheet geometry drift?`, table });
		}
	}
	const shopCats = new Set(t.novaShop.map((n) => n.category));
	if (t.novaShop.length) {
		for (const c of SHOP_CATEGORIES) {
			if (!shopCats.has(c)) flags.push({ kind: 'reject', code: 'missing_shop_category', message: `no rows for shop category "${c}"`, table: 'novaShop', key: c });
		}
	}
	for (const n of t.novaShop) {
		const key = `${n.category}/${n.item}/${n.level}`;
		if (STRUCTURAL_ITEMS.has(n.item)) flags.push({ kind: 'reject', code: 'structural_item', message: `"${n.item}" is a header, not a shop item — column misalignment`, table: 'novaShop', key });
		// Number.isInteger is false for NaN and ±Infinity too: shop levels and costs come off the
		// sheet through parseInt, which yields NaN for an unparseable cell instead of throwing.
		if (!Number.isInteger(n.level) || n.level < 1) flags.push({ kind: 'reject', code: 'bad_shop_level', message: `${key}: level must be a positive integer`, table: 'novaShop', key });
		if (!Number.isInteger(n.cost) || n.cost < 0) flags.push({ kind: 'reject', code: 'bad_shop_cost', message: `${key}: cost=${n.cost}`, table: 'novaShop', key });
	}

	// null seconds is data (blank = unpublished, N/A = Iconic); anything else non-integral or
	// non-positive means hmsToSeconds' arithmetic produced something a duration can't be.
	for (const c of t.craftingTimes) {
		if (c.seconds !== null && (!Number.isInteger(c.seconds) || c.seconds <= 0)) {
			flags.push({ kind: 'reject', code: 'bad_craft_time', message: `${c.droid}/${c.tier}: seconds=${c.seconds}`, table: 'craftingTimes', key: `${c.droid}/${c.tier}` });
		}
	}

	// The exact-108 count guard in build.ts only catches lost rows; a renamed sheet label keeps the
	// count and writes a bogus one, because rarity() title-cases whatever it is handed. The three
	// buff kinds are the three droid TYPES by construction — one block header per companion role.
	for (const b of t.companionBuffs) {
		const key = `${b.kind}/${b.rarity}/${b.tier}`;
		if (!TYPES.has(b.kind)) flags.push({ kind: 'reject', code: 'bad_buff_kind', message: `${key}: ${b.kind}`, table: 'companionBuffs', key });
		if (!RARITIES.has(b.rarity)) flags.push({ kind: 'reject', code: 'bad_buff_rarity', message: `${key}: ${b.rarity}`, table: 'companionBuffs', key });
	}

	// orphan report
	for (const c of existingCountKeys) {
		if (!known.has(c.droid)) flags.push({ kind: 'report', code: 'orphan_count', message: `count references removed droid "${c.droid}" (profile ${c.profileId})`, table: 'counts', key: `${c.droid}/${c.tier}` });
	}

	return flags;
}

export function rejectsOf(flags: Flag[]): Flag[] {
	return flags.filter((f) => f.kind === 'reject');
}
