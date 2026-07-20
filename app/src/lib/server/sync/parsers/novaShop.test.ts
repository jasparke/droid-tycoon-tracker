import { describe, it, expect } from 'vitest';
import { parseNovaShop } from './novaShop';

// New sheet geometry: FEATURED level@0 items@1-3, CORE level@5 items@6-14,
// WORKSHOP level@16 items@17-25, COSMETICS level@27 paint@28, info column @34.
function row(cells: Record<number, string>): string {
	const a = Array(38).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}
const csv = [
	row({ 5: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 0: 'NOVA SHOP - FEATURED', 5: 'NOVA SHOP - CORE UPGRADES', 16: 'NOVA SHOP - WORKSHOP UPGRADES', 27: 'NOVA SHOP - COSMETICS' }),
	row({ 0: 'NOVA CRYSTAL COST', 5: 'NOVA CRYSTAL COST', 16: 'NOVA CRYSTAL COST', 27: 'NOVA CRYSTAL COST', 34: 'INFORMATION' }),
	row({ 0: 'LEVEL', 1: 'CRITICAL CHANCE', 2: 'CRITICAL AMOUNT', 3: 'COMPANION SLOT',
	      5: 'LEVEL', 6: 'MAX HEALTH', 9: 'FLAWLESS CHARM',
	      16: 'LEVEL', 17: 'LOUNGE SLOT', 27: 'LEVEL', 28: 'NOVA CRYSTAL BASE PAINT', 34: 'note\nwith newline' }),
	row({ 0: '1', 1: '60', 2: '30', 5: '1', 6: '1', 9: '500', 16: '1', 17: '1', 27: '1', 28: '30' }),
	row({ 0: '2', 1: '90', 2: '90', 5: '2', 6: '6', 16: '2', 17: '30', 27: '2', 28: '120', 34: 'NOVA CRYSTALS/RB LEVEL' }),
	row({ 0: '3', 1: '120', 5: '3', 6: '13', 16: '3', 17: '60', 27: '3', 28: '400',
	      34: 'RB LEVEL', 35: 'CRYSTAL QUANTITY', 36: 'CREDIT MULT', 37: 'XP MULT' }),
	row({ 34: 'RB 12', 35: '11 NOVA CRYSTALS', 36: '22%', 37: '110%' }),
	row({ 34: 'RB 13', 35: '16 NOVA CRYSTALS', 36: '32%', 37: '160%' })
].join('\n');

describe('parseNovaShop', () => {
	const out = parseNovaShop(csv);
	it('paint stages = global 3-row ladder', () => {
		expect(out.novaPaintStages).toEqual([{ stage: 1, crystalCost: 30 }, { stage: 2, crystalCost: 120 }, { stage: 3, crystalCost: 400 }]);
	});
	it('rebirth-meta parses RB #, crystal qty, and % mults', () => {
		expect(out.rebirthMeta).toEqual([
			{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 },
			{ rebirth: 13, nova: 16, creditMult: 32, xpMult: 160 }
		]);
	});
	it('featured ladder parses as its own category', () => {
		expect(out.novaShop.filter((n) => n.item === 'Critical Chance')).toEqual([
			{ category: 'Featured', item: 'Critical Chance', level: 1, cost: 60 },
			{ category: 'Featured', item: 'Critical Chance', level: 2, cost: 90 },
			{ category: 'Featured', item: 'Critical Chance', level: 3, cost: 120 }
		]);
		// COMPANION SLOT has a header but no cost rows yet → no entries
		expect(out.novaShop.some((n) => n.item === 'Companion Slot')).toBe(false);
	});
	it('core + workshop ladders stop at the first blank cell', () => {
		expect(out.novaShop.filter((n) => n.item === 'Flawless Charm')).toEqual([
			{ category: 'Core upgrades', item: 'Flawless Charm', level: 1, cost: 500 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Lounge Slot')).toEqual([
			{ category: 'Workshop upgrades', item: 'Lounge Slot', level: 1, cost: 1 },
			{ category: 'Workshop upgrades', item: 'Lounge Slot', level: 2, cost: 30 },
			{ category: 'Workshop upgrades', item: 'Lounge Slot', level: 3, cost: 60 }
		]);
	});
});
