import { describe, it, expect } from 'vitest';
import { parseCosmetics } from './cosmetics';

function row(cells: Record<number, string>): string {
	const a = Array(11).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 0: 'HATS', 4: 'BASE PAINTS', 8: 'DROID EFFECTS' }),
	row({ 0: 'HAT', 1: 'REQUIREMENTS', 2: 'OWNED', 4: 'PAINT', 5: 'REQUIREMENTS', 6: 'OWNED', 8: 'EFFECT', 9: 'REQUIREMENTS', 10: 'OWNED' }),
	row({ 0: 'F1l-ON1', 1: 'FIND IN WORLD', 2: 'FALSE', 4: 'RED PAINT (DEFAULT', 5: 'NONE', 6: 'FALSE', 8: 'GROOVY AURA', 9: 'DJ R-3X EVENT', 10: 'FALSE' }),
	row({ 0: 'CONE OF CORUCANT', 1: 'FIND IN WORLD', 2: 'FALSE', 4: 'YELLOW PAINT', 5: 'NONE', 6: 'FALSE' })
].join('\n');

describe('parseCosmetics', () => {
	const out = parseCosmetics(csv).cosmetics;
	it('splits the three blocks, drops OWNED, title-cases category', () => {
		expect(out).toContainEqual({ category: 'Hats', name: 'F1l-ON1', requirement: 'FIND IN WORLD' });
		expect(out).toContainEqual({ category: 'Base Paints', name: 'RED PAINT (DEFAULT', requirement: 'NONE' });
		expect(out).toContainEqual({ category: 'Droid Effects', name: 'GROOVY AURA', requirement: 'DJ R-3X EVENT' });
		expect(out.filter((c) => c.category === 'Hats')).toHaveLength(2);
		expect(out.filter((c) => c.category === 'Droid Effects')).toHaveLength(1);
	});
});
