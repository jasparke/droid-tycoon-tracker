import type { PayloadTables, Flag } from './types';

const RARITIES = new Set(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Iconic']);
const TYPES = new Set(['Worker', 'Astromech', 'Battle']);
const REQUIRED_CHIP_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];

export function validate(t: PayloadTables, existingCountKeys: { droid: string; tier: string; profileId: number }[]): Flag[] {
	const flags: Flag[] = [];

	for (const d of t.droids) {
		if (!RARITIES.has(d.rarity)) flags.push({ kind: 'reject', code: 'bad_rarity', message: `${d.name}: ${d.rarity}`, table: 'droids', key: d.name });
		if (!TYPES.has(d.type)) flags.push({ kind: 'reject', code: 'bad_type', message: `${d.name}: ${d.type}`, table: 'droids', key: d.name });
	}

	// tier-grid ratio check (non-Iconic): value ≈ 0.7×cost (±15%). HOLD (this catches IG).
	const iconic = new Set(t.droids.filter((d) => d.rarity === 'Iconic').map((d) => d.name));
	for (const row of t.droidTiers) {
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

	// orphan report
	const known = new Set(t.droids.map((d) => d.name));
	for (const c of existingCountKeys) {
		if (!known.has(c.droid)) flags.push({ kind: 'report', code: 'orphan_count', message: `count references removed droid "${c.droid}" (profile ${c.profileId})`, table: 'counts', key: `${c.droid}/${c.tier}` });
	}

	return flags;
}

export function rejectsOf(flags: Flag[]): Flag[] {
	return flags.filter((f) => f.kind === 'reject');
}
