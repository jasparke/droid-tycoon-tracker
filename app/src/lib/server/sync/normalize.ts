import type { Tier } from '$lib/game/tiers';

const MAG: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

export function magnitude(s: string): number {
	const t = s.trim().replace(/,/g, '');
	const m = /^(-?\d+(?:\.\d+)?)([kmbt])?$/i.exec(t);
	if (!m) throw new Error(`unparseable magnitude: ${s}`);
	const n = parseFloat(m[1]);
	return m[2] ? Math.round(n * MAG[m[2].toLowerCase()]) : n;
}

export function income(s: string): { value: number | null; pct: number | null } {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return { value: null, pct: null };
	const body = t.replace(/\/s$/i, '');
	if (body.endsWith('%')) return { value: null, pct: parseFloat(body.slice(0, -1)) };
	return { value: magnitude(body), pct: null };
}

export function chips(s: string): number | null {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return null;
	return parseInt(t.replace(/chips/i, '').replace(/,/g, '').trim(), 10);
}

export function oneIn(s: string): number {
	const m = /^\s*\d+\s*\/\s*(\d+)\s*$/.exec(s);
	if (!m) throw new Error(`unparseable probability: ${s}`);
	return parseInt(m[1], 10);
}

export function nc(s: string): number {
	const m = /^\s*(\d+)\s*NC\s*$/i.exec(s);
	if (!m) throw new Error(`unparseable NC cost: ${s}`);
	return parseInt(m[1], 10);
}

const TIER_WORDS: Record<string, Tier> = {
	BASE: 'Base', BASIC: 'Base', DEFAULT: 'Base',
	GOLD: 'Gold', DIAMOND: 'Diamond', RAINBOW: 'Rainbow', BESKAR: 'Beskar', GALACTIC: 'Galactic'
};
export function tierWord(s: string): Tier {
	const t = TIER_WORDS[s.trim().toUpperCase()];
	if (!t) throw new Error(`unknown tier word: ${s}`);
	return t;
}

// The sheet writes unlock cells in ALL CAPS ("WORKER SLOT", "NONE"); the DB and
// UI use title case ("Worker Slot", "None"). Acronyms the sheet already spells
// short elsewhere ("XP MULT", "75 NC") must survive whole — plain title case
// would render them "Xp"/"Nc". None of these is an English word, so no shipping
// label collides with the set.
const ACRONYMS = new Set(['XP', 'HP', 'NC', 'AFK']);
export function unlockLabel(s: string): string {
	return s
		.trim()
		.replace(/\w+/g, (w) =>
			ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()
		);
}

export function rarity(s: string): string {
	const t = s.trim().toLowerCase();
	return t.charAt(0).toUpperCase() + t.slice(1);
}
export const dtype = rarity; // same casing rule: BATTLE → Battle
