import { describe, it, expect } from 'vitest';
import { parseNovaShop } from './novaShop';
import { NOVA_CSV } from '../__fixtures__/tabs';

function row(width: number, cells: Record<number, string>): string {
	const a = Array(width).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

// The sheet layout as it was BEFORE the two new Featured columns shifted everything right:
// FEATURED level@0 items@1-3, CORE level@5 items@6-14, WORKSHOP level@16 items@17-25,
// COSMETICS level@27 paint@28, RB block @34-37. Header anchoring must read it identically.
const PRE_SHIFT_CSV = [
	row(38, { 5: 'banner' }),
	row(38, { 0: 'NOVA SHOP - FEATURED', 5: 'NOVA SHOP - CORE UPGRADES', 16: 'NOVA SHOP - WORKSHOP UPGRADES', 27: 'NOVA SHOP - COSMETICS' }),
	row(38, { 0: 'NOVA CRYSTAL COST', 6: 'NOVA CRYSTAL COST', 17: 'NOVA CRYSTAL COST', 27: 'NOVA CRYSTAL COST', 34: 'INFORMATION' }),
	row(38, { 0: 'LEVEL', 1: 'CRITICAL CHANCE', 5: 'LEVEL', 6: 'MAX HEALTH', 9: 'FLAWLESS CHARM',
	          16: 'LEVEL', 17: 'LOUNGE SLOT', 27: 'LEVEL', 28: 'NOVA CRYSTAL BASE PAINT' }),
	row(38, { 0: '1', 1: '60', 5: '1', 6: '1', 9: '500', 16: '1', 17: '1', 27: '1', 28: '30' }),
	row(38, { 0: '2', 1: '90', 5: '2', 6: '6', 16: '2', 17: '30', 27: '2', 28: '120' }),
	row(38, { 0: '3', 1: '120', 5: '3', 6: '13', 16: '3', 17: '60', 27: '3', 28: '400',
	          34: 'RB LEVEL', 35: 'CRYSTAL QUANTITY', 36: 'CREDIT MULT', 37: 'XP MULT' }),
	row(38, { 34: 'RB 12', 35: '11 NOVA CRYSTALS', 36: '22%', 37: '110%' })
].join('\n');

describe('parseNovaShop — live (post-shift) geometry', () => {
	const out = parseNovaShop(NOVA_CSV);

	it('parses all three ladder categories from their banner text', () => {
		expect([...new Set(out.novaShop.map((n) => n.category))].sort()).toEqual([
			'Core upgrades', 'Featured', 'Workshop upgrades'
		]);
	});

	it('reads the two new Featured columns and the shifted Core/Workshop blocks', () => {
		expect(out.novaShop.filter((n) => n.item === 'Critical Amount')).toEqual([
			{ category: 'Featured', item: 'Critical Amount', level: 1, cost: 30 },
			{ category: 'Featured', item: 'Critical Amount', level: 2, cost: 90 },
			{ category: 'Featured', item: 'Critical Amount', level: 3, cost: 150 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Companion Slot')).toEqual([
			{ category: 'Featured', item: 'Companion Slot', level: 1, cost: 250 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Upgrade Chip Station')).toEqual([
			{ category: 'Featured', item: 'Upgrade Chip Station', level: 1, cost: 120 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Daily Crystals')).toEqual([
			{ category: 'Featured', item: 'Daily Crystals', level: 1, cost: 30 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Flawless Charm')).toEqual([
			{ category: 'Core upgrades', item: 'Flawless Charm', level: 1, cost: 500 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Crafting Speed')).toEqual([
			{ category: 'Workshop upgrades', item: 'Crafting Speed', level: 1, cost: 3 },
			{ category: 'Workshop upgrades', item: 'Crafting Speed', level: 2, cost: 18 },
			{ category: 'Workshop upgrades', item: 'Crafting Speed', level: 3, cost: 33 }
		]);
	});

	it('REGRESSION: never emits a structural header as an item', () => {
		// The pre-2026-08 positional parser read the DAILY CRYSTALS column as the Core level
		// column and the Core LEVEL header as an item — a silent success on wrong columns.
		expect(out.novaShop.some((n) => n.item === 'Level')).toBe(false);
		expect(out.novaShop.some((n) => n.item === 'Nova Crystal Cost')).toBe(false);
		expect(out.novaShop.every((n) => Number.isInteger(n.level) && n.level >= 1)).toBe(true);
		expect(out.novaShop.every((n) => Number.isInteger(n.cost) && n.cost >= 0)).toBe(true);
	});

	it('ladders stop at the first blank cost, not at the end of the level column', () => {
		expect(out.novaShop.filter((n) => n.item === 'Max Health')).toHaveLength(3);
		expect(out.novaShop).toHaveLength(19);
	});

	it('paint stages and rebirth meta come from their own anchors', () => {
		expect(out.novaPaintStages).toEqual([
			{ stage: 1, crystalCost: 30 }, { stage: 2, crystalCost: 120 }, { stage: 3, crystalCost: 400 }
		]);
		expect(out.rebirthMeta).toEqual([
			{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 },
			{ rebirth: 13, nova: 16, creditMult: 32, xpMult: 160 }
		]);
	});
});

describe('parseNovaShop — pre-shift geometry still parses (anchors, not positions)', () => {
	const out = parseNovaShop(PRE_SHIFT_CSV);
	it('finds the same items at completely different column indices', () => {
		expect(out.novaShop.filter((n) => n.item === 'Critical Chance')).toEqual([
			{ category: 'Featured', item: 'Critical Chance', level: 1, cost: 60 },
			{ category: 'Featured', item: 'Critical Chance', level: 2, cost: 90 },
			{ category: 'Featured', item: 'Critical Chance', level: 3, cost: 120 }
		]);
		expect(out.novaShop.filter((n) => n.item === 'Lounge Slot')).toHaveLength(3);
		expect(out.novaPaintStages).toHaveLength(3);
		expect(out.rebirthMeta).toEqual([{ rebirth: 12, nova: 11, creditMult: 22, xpMult: 110 }]);
	});
});

describe('parseNovaShop — unknown geometry fails loudly', () => {
	it('throws when a section banner is missing', () => {
		const csv = NOVA_CSV.replace('NOVA SHOP - WORKSHOP UPGRADES', 'NOVA SHOP - WORKBENCH');
		expect(() => parseNovaShop(csv)).toThrow(/nova-shop header anchor failed.*WORKSHOP UPGRADES/);
	});
	it('throws when a section has no LEVEL column', () => {
		const csv = NOVA_CSV.split('\n');
		csv[3] = csv[3].replace(/^LEVEL,/, 'TIER,');
		expect(() => parseNovaShop(csv.join('\n'))).toThrow(/nova-shop header anchor failed/);
	});
	it('throws when the paint ladder header is gone', () => {
		const csv = NOVA_CSV.replace('NOVA CRYSTAL BASE PAINT', 'MYSTERY COLUMN');
		expect(() => parseNovaShop(csv)).toThrow(/nova-shop header anchor failed.*BASE PAINT/);
	});
	it('throws when the RB LEVEL block is gone', () => {
		// global: "RB LEVEL" also occurs inside the "NOVA CRYSTALS/RB LEVEL" caption above it
		const csv = NOVA_CSV.replace(/RB LEVEL/g, 'REBIRTH');
		expect(() => parseNovaShop(csv)).toThrow(/nova-shop header anchor failed.*RB LEVEL/);
	});
	it('throws when a section resolves to zero items', () => {
		const csv = NOVA_CSV.split('\n');
		// blank every Featured item header, leaving the banner and LEVEL in place
		csv[3] = csv[3].replace('CRITICAL CHANCE,CRITICAL AMOUNT,COMPANION SLOT,UPGRADE CHIP STATION,DAILY CRYSTALS', ',,,,');
		expect(() => parseNovaShop(csv.join('\n'))).toThrow(/nova-shop header anchor failed.*Featured/);
	});
});
