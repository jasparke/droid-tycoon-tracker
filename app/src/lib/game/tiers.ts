export const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar'] as const;
export type Tier = (typeof TIERS)[number];
export const RIDX: Record<Tier, number> = { Base: 0, Gold: 1, Diamond: 2, Rainbow: 3, Beskar: 4 };
export function isTier(x: string): x is Tier {
	return (TIERS as readonly string[]).includes(x);
}
