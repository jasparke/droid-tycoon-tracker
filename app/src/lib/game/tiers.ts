export const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar', 'Galactic'] as const;
export type Tier = (typeof TIERS)[number];
export const RIDX = Object.fromEntries(TIERS.map((t, i) => [t, i])) as Record<Tier, number>;
export function isTier(x: string): x is Tier {
	return (TIERS as readonly string[]).includes(x);
}
