import { describe, it, expect } from 'vitest';
import { parseCraftingCompanions, hmsToSeconds, buffValue } from './craftingCompanions';
import { CRAFTING_CSV } from '../__fixtures__/tabs';

describe('hmsToSeconds', () => {
	it('converts H:MM:SS', () => {
		expect(hmsToSeconds('0:00:33')).toBe(33);
		expect(hmsToSeconds('1:52:48')).toBe(6768);
		expect(hmsToSeconds('29:55:00')).toBe(107700);
	});
	it('maps blanks and N/A to null', () => {
		expect(hmsToSeconds('')).toBeNull();
		expect(hmsToSeconds('   ')).toBeNull();
		expect(hmsToSeconds('N/A')).toBeNull();
	});
	it('throws on anything else', () => {
		expect(() => hmsToSeconds('1:2:3')).toThrow(/unparseable craft duration/);
		expect(() => hmsToSeconds('90m')).toThrow(/unparseable craft duration/);
	});
});

describe('buffValue', () => {
	it('reads percentages and plus-prefixed integers', () => {
		expect(buffValue('20%')).toBe(20);
		expect(buffValue('+3')).toBe(3);
		expect(buffValue('+220')).toBe(220);
	});
	it('maps N/A and blanks to null', () => {
		expect(buffValue('N/A')).toBeNull();
		expect(buffValue('')).toBeNull();
	});
	it('throws on anything else', () => {
		expect(() => buffValue('lots')).toThrow(/unparseable companion buff/);
	});
});

describe('parseCraftingCompanions', () => {
	const out = parseCraftingCompanions(CRAFTING_CSV);

	it('emits one row per droid per tier, nulling blanks and Iconic N/A', () => {
		expect(out.craftingTimes).toHaveLength(18); // 3 droids x 6 tiers
		expect(out.craftingTimes.filter((c) => c.droid === 'MOUSE')).toEqual([
			{ droid: 'MOUSE', tier: 'Base', seconds: 33 },
			{ droid: 'MOUSE', tier: 'Gold', seconds: 134 },
			{ droid: 'MOUSE', tier: 'Diamond', seconds: 234 },
			{ droid: 'MOUSE', tier: 'Rainbow', seconds: 335 },
			{ droid: 'MOUSE', tier: 'Beskar', seconds: 268 },
			{ droid: 'MOUSE', tier: 'Galactic', seconds: 502 }
		]);
		// HAUL-R's Galactic cell is blank in the sheet — unpublished, not zero
		expect(out.craftingTimes.find((c) => c.droid === 'HAUL-R' && c.tier === 'Galactic')).toEqual(
			{ droid: 'HAUL-R', tier: 'Galactic', seconds: null }
		);
		// Iconic rows are N/A across the board and resolve through the BB-8 -> BB8 alias
		expect(out.craftingTimes.filter((c) => c.droid === 'BB8').every((c) => c.seconds === null)).toBe(true);
	});

	it('parses the three COMPAINION buff blocks with their own units', () => {
		// Worker block has 2 rarity rows (Common, Iconic), Astromech and Battle 1 each: 4 x 6 tiers
		expect(out.companionBuffs).toHaveLength(24);
		expect(out.companionBuffs.filter((b) => b.kind === 'Worker' && b.rarity === 'Common')).toEqual([
			{ kind: 'Worker', rarity: 'Common', tier: 'Base', value: 20 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Gold', value: 40 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Diamond', value: 60 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Rainbow', value: 80 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Beskar', value: 100 },
			{ kind: 'Worker', rarity: 'Common', tier: 'Galactic', value: 100 }
		]);
		expect(out.companionBuffs.filter((b) => b.kind === 'Worker' && b.rarity === 'Iconic').every((b) => b.value === null)).toBe(true);
		expect(out.companionBuffs.find((b) => b.kind === 'Astromech' && b.rarity === 'Common' && b.tier === 'Galactic')).toEqual(
			{ kind: 'Astromech', rarity: 'Common', tier: 'Galactic', value: 6 }
		);
		expect(out.companionBuffs.find((b) => b.kind === 'Battle' && b.rarity === 'Common' && b.tier === 'Beskar')).toEqual(
			{ kind: 'Battle', rarity: 'Common', tier: 'Beskar', value: 180 }
		);
	});

	it('reads iconic companion effects as free text, aliased to DB droid names', () => {
		expect(out.iconicCompanionEffects).toEqual([
			{ droid: 'BB8', effect: '100% UPGRADE CHIPS' },
			{ droid: 'CHOPPER', effect: '+50% CRIT CHANCE & DAMAGE' }
		]);
	});

	it('tolerates the sheet\'s "ICONIC " trailing space in the rarity column', () => {
		expect(out.craftingTimes.some((c) => c.droid === 'BB8')).toBe(true);
	});

	it('fails loudly when the left grid header is gone', () => {
		const csv = CRAFTING_CSV.replace('RARITY,DROID,TYPE', 'RARITY,NAME,TYPE');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed/);
	});
	it('fails loudly when a tier column is missing from the left grid', () => {
		const csv = CRAFTING_CSV.replace('BASIC,GOLD,DIAMOND,RAINBOW,BESKAR,GALACTIC,,RARITY', 'BASIC,GOLD,DIAMOND,RAINBOW,BESKAR,,,RARITY');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed.*GALACTIC/);
	});
	it('fails loudly when a COMPAINION buff block disappears', () => {
		const csv = CRAFTING_CSV.replace('BATTLE COMPAINION DROIDS - MAX HEALTH BUFFS', 'BATTLE DROID NOTES');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed.*Battle/);
	});
	it('fails loudly when the iconic effects block disappears', () => {
		const csv = CRAFTING_CSV.replace('COMPAINION DROIDS - ICONIC DROIDS', 'ICONIC NOTES');
		expect(() => parseCraftingCompanions(csv)).toThrow(/crafting-companions header anchor failed.*ICONIC/);
	});
});
