// Flawless is an ownership axis, not a tier: the sheet excludes it from the 380-file droid
// universe and every non-Iconic droid (62 of 70) has a flawless variant. Iconics do not.
export function isFlawlessEligible(d: { rarity: string }): boolean {
	return d.rarity !== 'Iconic';
}

export function eligibleFlawless<T extends { name: string; rarity: string }>(droids: T[]): T[] {
	return droids.filter(isFlawlessEligible);
}

export function flawlessProgress(
	owned: readonly string[],
	droids: { name: string; rarity: string }[]
): { owned: number; total: number } {
	const eligible = new Set(eligibleFlawless(droids).map((d) => d.name));
	const have = new Set(owned.filter((n) => eligible.has(n)));
	return { owned: have.size, total: eligible.size };
}
