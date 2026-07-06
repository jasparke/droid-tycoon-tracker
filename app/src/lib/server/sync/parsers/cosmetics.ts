import { toRows, cell } from '../csv';
import type { CosmeticRow } from '../types';

const BLOCKS = [
	{ label: 'HATS', category: 'Hats', nameCol: 0, reqCol: 1 },
	{ label: 'BASE PAINTS', category: 'Base Paints', nameCol: 4, reqCol: 5 },
	{ label: 'DROID EFFECTS', category: 'Droid Effects', nameCol: 8, reqCol: 9 }
];

export function parseCosmetics(csv: string): { cosmetics: CosmeticRow[] } {
	const r = toRows(csv);
	for (const b of BLOCKS) {
		if (cell(r[1], b.nameCol).trim().toUpperCase() !== b.label) {
			throw new Error(`cosmetics header anchor failed: expected ${b.label} at col ${b.nameCol}`);
		}
	}
	const out: CosmeticRow[] = [];
	for (const b of BLOCKS) {
		for (let i = 3; i < r.length; i++) {
			const name = cell(r[i], b.nameCol).trim();
			if (!name) continue;
			out.push({ category: b.category, name, requirement: cell(r[i], b.reqCol).trim() });
		}
	}
	return { cosmetics: out };
}
