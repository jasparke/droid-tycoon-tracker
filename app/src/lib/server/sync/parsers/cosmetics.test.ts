import { describe, it, expect } from 'vitest';
import { parseCosmetics } from './cosmetics';

// New sheet geometry: HATS @0-5 (per-tier owned cols), BASE PAINTS @7-9,
// DROID EFFECTS @11-13 with a nested PAINT TINT sub-block in the same columns.
function row(cells: Record<number, string>): string {
	const a = Array(14).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 0: 'HATS', 7: 'BASE PAINTS', 11: 'DROID EFFECTS' }),
	row({ 0: 'HAT', 1: 'REQUIREMENTS', 2: 'BASIC', 3: 'GOLD', 4: 'DIAMOND', 5: 'RAINBOW', 7: 'PAINT', 8: 'REQUIREMENTS', 9: 'OWNED', 11: 'EFFECT', 12: 'REQUIREMENTS', 13: 'OWNED' }),
	row({ 0: 'F1l-ON1', 1: 'FIND IN WORLD', 2: 'FALSE', 3: 'FALSE', 4: 'FALSE', 5: 'FALSE', 7: 'RED PAINT (DEFAULT', 8: 'NONE', 9: 'FALSE', 11: 'GROOVY AURA', 12: 'DJ R-3X EVENT', 13: 'FALSE' }),
	row({ 0: 'CONE OF CORUCANT', 1: 'FIND IN WORLD', 2: 'FALSE', 3: 'FALSE', 4: 'FALSE', 5: 'FALSE', 7: 'GALACTIC PAINT', 8: 'COLLECT 30 GALACTIC DROIDS', 9: 'FALSE', 11: 'PAINT TINT' }),
	row({ 11: 'EFFECT', 12: 'REQUIREMENTS', 13: 'OWNED' }),
	row({ 11: 'DEFAULT', 12: 'N/A', 13: 'FALSE' }),
	row({ 11: 'PAINT 5', 12: 'DROIDSMITH LEVEL 175', 13: 'FALSE' })
].join('\n');

describe('parseCosmetics', () => {
	const out = parseCosmetics(csv).cosmetics;
	it('splits the three blocks at their new columns, drops OWNED', () => {
		expect(out).toContainEqual({ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' });
		expect(out).toContainEqual({ category: 'Base Paints', name: 'RED PAINT (DEFAULT', requirement: 'NONE' });
		expect(out).toContainEqual({ category: 'Base Paints', name: 'GALACTIC PAINT', requirement: 'COLLECT 30 GALACTIC DROIDS' });
		expect(out).toContainEqual({ category: 'Droid Effects', name: 'GROOVY AURA', requirement: 'DJ R-3X EVENT' });
		expect(out.filter((c) => c.category === 'Hats')).toHaveLength(2);
	});
	it('nested PAINT TINT sub-block becomes its own category; its label + header rows are skipped', () => {
		expect(out.filter((c) => c.category === 'Droid Effects')).toHaveLength(1);
		expect(out.filter((c) => c.category === 'Paint Tint')).toEqual([
			{ category: 'Paint Tint', name: 'DEFAULT', requirement: 'N/A' },
			{ category: 'Paint Tint', name: 'PAINT 5', requirement: 'DROIDSMITH LEVEL 175' }
		]);
		expect(out.some((c) => c.name === 'PAINT TINT' || c.name === 'EFFECT')).toBe(false);
	});
});
