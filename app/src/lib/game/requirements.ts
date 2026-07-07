import { isTier, type Tier } from './tiers';

export type ReqRow = { cycle: number; rebirth: number; droid: string; tier: string };

// Earliest rebirth at or after fromRb (same cycle) that requires this droid.
// null => "SELLABLE": not needed in the remaining cycle.
export function earliestReq(
	reqs: ReqRow[],
	cycle: number,
	fromRb: number,
	droid: string
): { rebirth: number; tier: Tier } | null {
	let best: { rebirth: number; tier: Tier } | null = null;
	for (const r of reqs) {
		if (r.cycle !== cycle || r.droid !== droid || r.rebirth < fromRb || !isTier(r.tier)) continue;
		if (!best || r.rebirth < best.rebirth) best = { rebirth: r.rebirth, tier: r.tier };
	}
	return best;
}
