import type { Tier } from './tiers';

export type TierStat = {
	droid: string;
	rarity: string;
	type: string;
	tier: Tier;
	buy: number | null;
	income: number | null;
};

export type RoiRow = TierStat & { paybackSeconds: number; incomePer1k: number };

export function roiTable(stats: TierStat[]): RoiRow[] {
	return stats
		.filter((s) => s.buy != null && s.buy > 0 && s.income != null && s.income > 0)
		.map((s) => ({
			...s,
			paybackSeconds: (s.buy as number) / (s.income as number),
			incomePer1k: ((s.income as number) / (s.buy as number)) * 1000
		}))
		.sort((a, b) => a.paybackSeconds - b.paybackSeconds);
}
