import { RIDX, TIERS, type Tier } from './tiers';

export type Requirement = { rebirth: number; droid: string; tier: Tier };

export function combinedNeeds(
	reqs: Requirement[],
	selected: ReadonlySet<number>
): { droid: string; tier: Tier }[] {
	const need = new Map<string, number>();
	for (const r of reqs) {
		if (!selected.has(r.rebirth)) continue;
		const i = RIDX[r.tier];
		const cur = need.get(r.droid);
		if (cur == null || i > cur) need.set(r.droid, i);
	}
	return [...need.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([droid, i]) => ({ droid, tier: TIERS[i] }));
}
