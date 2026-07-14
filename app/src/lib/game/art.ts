import type { Tier } from './tiers';

// Droid art filename convention — mirrors the prototype's droidImg/normName
// (prototype/index.html:541-564) and the asset manifest. Base tier art is
// named _Default; every other tier keeps its own name.
export function normName(name: string): string {
	return name.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function fileTier(tier: Tier): string {
	return tier === 'Base' ? 'Default' : tier;
}

export function droidArtFile(name: string, tier: Tier): string {
	return `${normName(name)}_${fileTier(tier)}.webp`;
}

export function droidArtUrl(name: string, tier: Tier): string {
	return `/assets/droids/${droidArtFile(name, tier)}`;
}
