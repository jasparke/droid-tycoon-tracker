import { RIDX, TIERS, type Tier } from './tiers';

export type CountRow = { cycle: number; droid: string; tier: Tier; n: number };

export function ownedIdx(counts: CountRow[], cycle: number, droid: string): number {
	let mx = -1;
	for (const c of counts)
		if (c.cycle === cycle && c.droid === droid && c.n > 0 && RIDX[c.tier] > mx) mx = RIDX[c.tier];
	return mx;
}

export function isMet(counts: CountRow[], cycle: number, droid: string, tier: Tier): boolean {
	return ownedIdx(counts, cycle, droid) >= RIDX[tier];
}

export function totalOf(counts: CountRow[], cycle: number, droid: string): number {
	let s = 0;
	for (const c of counts) if (c.cycle === cycle && c.droid === droid) s += c.n;
	return s;
}

// Lowest owned tier index >= the required tier, given a per-tier count array
// in TIERS order (counts-as); -1 when unmet.
export function satisfyingIdxOf(per: number[], tier: Tier): number {
	for (let i = RIDX[tier]; i < TIERS.length; i++) if (per[i] > 0) return i;
	return -1;
}

// Lowest owned tier index >= the required tier (counts-as); -1 when unmet.
// Drives the green satisfying-ring and checklist verdicts.
export function satisfyingIdx(counts: CountRow[], cycle: number, droid: string, tier: Tier): number {
	const per = Array<number>(TIERS.length).fill(0);
	for (const c of counts) if (c.cycle === cycle && c.droid === droid) per[RIDX[c.tier]] += c.n;
	return satisfyingIdxOf(per, tier);
}
