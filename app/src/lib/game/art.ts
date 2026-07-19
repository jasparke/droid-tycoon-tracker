import type { Tier } from './tiers';

// Droid art filename convention — mirrors the prototype's droidImg/normName
// (prototype/index.html:541-564) and the asset manifest. Base tier art is
// named _Default; every other tier keeps its own name.
export function normName(name: string): string {
	return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Iconic droids are single-tier (game-domain reference §5.8): no tier grid, no
// chip upgrades, and art exists only as {normName}_Default.webp. Asking for any
// other tier would point at a file that was never produced, so art resolution
// collapses their tier to Default. Held as a normName set because the roster is
// fixed game data; art.test.ts cross-checks it against seed-data.json's Iconic
// roster, so this fails loudly if the two ever diverge.
export const SINGLE_TIER_DROIDS: ReadonlySet<string> = new Set([
	'BB8',
	'CB23',
	'DJR3X',
	'IG11MARSHAL',
	'MISTERBONES',
	'R2D2'
]);

export function isSingleTier(name: string): boolean {
	return SINGLE_TIER_DROIDS.has(normName(name));
}

export function fileTier(tier: Tier): string {
	return tier === 'Base' ? 'Default' : tier;
}

export function droidArtFile(name: string, tier: Tier): string {
	const nn = normName(name);
	// single-tier droids only ever have _Default art (see SINGLE_TIER_DROIDS)
	const t = SINGLE_TIER_DROIDS.has(nn) ? 'Default' : fileTier(tier);
	return `${nn}_${t}.webp`;
}

export function droidArtUrl(name: string, tier: Tier): string {
	return `/assets/droids/${droidArtFile(name, tier)}`;
}
