export const DROID_ALIASES: Record<string, string> = {
	'BB-8': 'BB8', // sheet renamed BB8 → BB-8 in the galactic update; DB keeps BB8 (user counts key on it)
	'BB-9': 'BB9',
	'MONO-WALKER': 'MONO-WLKR',
	'MONO-WALKR': 'MONO-WLKR',
	'OPTI-STRIKE': 'OPTI-STRK',
	'MECHA DROID': 'MECHA-DROID'
};

export function resolveDroid(name: string): string {
	const n = name.trim();
	return DROID_ALIASES[n] ?? n;
}
