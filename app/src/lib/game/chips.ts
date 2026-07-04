import { RIDX, type Tier } from './tiers';

export type ChipSteps = [number, number, number, number];

export function cumChips(steps: ChipSteps, targetTier: Tier): number {
	let c = 0;
	for (let i = 0; i < RIDX[targetTier]; i++) c += steps[i];
	return c;
}

export function stepChips(steps: ChipSteps, fromTier: Tier): number | null {
	const i = RIDX[fromTier];
	return i >= steps.length ? null : steps[i];
}
