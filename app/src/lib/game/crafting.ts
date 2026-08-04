import type { Tier } from './tiers';

// Base (unbuffed) craft durations, straight from the sheet's CRAFTING TIME - NO BUFF grid.
// Companion buffs are reference display only — no buff math here, by design.
export type CraftTimeRow = { droid: string; tier: Tier; seconds: number | null };

export function craftSeconds(rows: CraftTimeRow[], droid: string, tier: Tier): number | null {
	return rows.find((r) => r.droid === droid && r.tier === tier)?.seconds ?? null;
}

export function formatHms(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Σ base craft time over the planned crafts still outstanding for this cycle.
 *  `unknown` counts outstanding needs the sheet has not published a time for. */
export function planCraftTotal(
	rows: CraftTimeRow[],
	needs: { droid: string; tier: Tier }[],
	isOwned: (droid: string, tier: Tier) => boolean
): { seconds: number; unknown: number } {
	let seconds = 0;
	let unknown = 0;
	for (const n of needs) {
		if (isOwned(n.droid, n.tier)) continue;
		const s = craftSeconds(rows, n.droid, n.tier);
		if (s === null) unknown++;
		else seconds += s;
	}
	return { seconds, unknown };
}
