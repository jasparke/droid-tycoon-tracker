import { describe, it, expect } from 'vitest';
import { parseNovaShop } from './novaShop';

function row(cells: Record<number, string>): string {
	const a = Array(33).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}
const csv = [
	row({ 0: 'IF YOU ARE NOT A SHEET EDITOR' }),
	row({ 22: 'NOVA SHOP - COSMETICS' }),
	row({ 22: 'NOVA CRYSTAL COST', 29: 'INFORMATION' }),
	row({ 0: 'LEVEL', 1: 'Income Boost', 22: 'LEVEL', 23: 'NOVA CRYSTAL BASE PAINT', 29: 'There is now 4 different rebirth\nrequirement paths.' }),
	row({ 0: '1', 1: '50', 22: '1', 23: '30' }),
	row({ 0: '2', 1: '120', 22: '2', 23: '120', 29: 'NOVA CRYSTALS/RB LEVEL' }),
	row({ 0: '3', 1: '', 22: '3', 23: '400', 29: 'RB LEVEL', 30: 'CRYSTAL QUANTITY', 31: 'CREDIT MULT', 32: 'XP MULT' }),
	row({ 29: 'RB 12', 30: '11 NOVA CRYSTALS', 31: '22%', 32: '110%' }),
	row({ 29: 'RB 13', 30: '16 NOVA CRYSTALS', 31: '32%', 32: '160%' })
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
	it('core upgrade ladder stops at the first blank cell', () => {
		expect(out.novaShop.filter((n) => n.item === 'Income Boost')).toEqual([
			{ category: 'Core upgrades', item: 'Income Boost', level: 1, cost: 50 },
			{ category: 'Core upgrades', item: 'Income Boost', level: 2, cost: 120 }
		]);
	});
});
