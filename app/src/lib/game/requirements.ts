import { isTier, RIDX, type Tier } from './tiers';

// Highest rebirth in the game (29->30 transition; galactic update).
export const MAX_REBIRTH = 30;

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
		// earliest rebirth wins; at the same rebirth, keep the highest required tier (order-independent)
		if (
			!best ||
			r.rebirth < best.rebirth ||
			(r.rebirth === best.rebirth && RIDX[r.tier] > RIDX[best.tier])
		)
			best = { rebirth: r.rebirth, tier: r.tier };
	}
	return best;
}
