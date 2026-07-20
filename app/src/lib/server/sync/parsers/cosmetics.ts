import { toRows, cell } from '../csv';
import type { CosmeticRow } from '../types';

const BLOCKS = [
	{ label: 'HATS', category: 'Hats', nameCol: 0, reqCol: 1 },
	{ label: 'BASE PAINTS', category: 'Base Paints', nameCol: 7, reqCol: 8 },
	{ label: 'DROID EFFECTS', category: 'Droid Effects', nameCol: 11, reqCol: 12 }
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
		let category = b.category;
		for (let i = 3; i < r.length; i++) {
			const name = cell(r[i], b.nameCol).trim();
			if (!name) continue;
			// PAINT TINT is a nested sub-block sharing the Droid Effects columns:
			// its label row switches the category and its repeated header row is skipped.
			if (name.toUpperCase() === 'PAINT TINT') { category = 'Paint Tint'; continue; }
			if (name.toUpperCase() === 'EFFECT' && cell(r[i], b.reqCol).trim().toUpperCase() === 'REQUIREMENTS') continue;
			out.push({ category, name, requirement: cell(r[i], b.reqCol).trim() });
		}
	}
	return { cosmetics: out };
}
