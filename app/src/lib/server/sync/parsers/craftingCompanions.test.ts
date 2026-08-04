import { describe, it, expect } from 'vitest';
import { parseCraftingCompanions, hmsToSeconds, buffValue } from './craftingCompanions';
import { CRAFTING_CSV } from '../__fixtures__/tabs';

function row(width: number, cells: Record<number, string>): string {
	const a = Array(width).fill('');
	for (const [i, v] of Object.entries(cells)) a[Number(i)] = v;
	return a.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',');
}

// The same tab with the whole right-hand stack pushed two columns right (label col 12, values
// 13-18) — the shift the nova tab actually took in this patch. The four COMPAINION blocks are
// located by their own header text, so the parse must come out identical to CRAFTING_CSV.
const SHIFTED_CSV = [
	row(19, { 3: 'banner', 12: 'banner' }),
	row(19, { 3: 'CRAFTING TIME - NO BUFF', 12: 'WORKER COMPAINION DROIDS - CRAFTING SPEED BUFFS' }),
	row(19, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'BASIC', 4: 'GOLD', 5: 'DIAMOND', 6: 'RAINBOW', 7: 'BESKAR', 8: 'GALACTIC',
	          12: 'RARITY', 13: 'BASIC', 14: 'GOLD', 15: 'DIAMOND', 16: 'RAINBOW', 17: 'BESKAR', 18: 'GALACTIC' }),
	row(19, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '0:00:33', 4: '0:02:14', 5: '0:03:54', 6: '0:05:35', 7: '0:04:28', 8: '0:08:22',
	          12: 'COMMON', 13: '20%', 14: '40%', 15: '60%', 16: '80%', 17: '100%', 18: '100%' }),
	row(19, { 1: 'HAUL-R', 2: 'BATTLE', 3: '0:08:23', 4: '0:33:35', 5: '0:58:46', 6: '1:23:58', 7: '1:07:10',
	          12: 'ICONIC ', 13: 'N/A', 14: 'N/A', 15: 'N/A', 16: 'N/A', 17: 'N/A', 18: 'N/A' }),
	row(19, { 0: 'ICONIC ', 1: 'BB-8', 2: 'ASTROMECH', 3: 'N/A' }),
	row(19, { 12: 'ASTROMECH COMPAINION DROIDS - PICKAXE LEVEL BUFFS' }),
	row(19, { 12: 'RARITY', 13: 'BASIC', 14: 'GOLD', 15: 'DIAMOND', 16: 'RAINBOW', 17: 'BESKAR', 18: 'GALACTIC' }),
	row(19, { 12: 'COMMON', 13: '+1', 14: '+2', 15: '+3', 16: '+4', 17: '+5', 18: '+6' }),
	row(19, {}),
	row(19, { 12: 'BATTLE COMPAINION DROIDS - MAX HEALTH BUFFS' }),
	row(19, { 12: 'RARITY', 13: 'BASIC', 14: 'GOLD', 15: 'DIAMOND', 16: 'RAINBOW', 17: 'BESKAR', 18: 'GALACTIC' }),
	row(19, { 12: 'COMMON', 13: '+20', 14: '+60', 15: '+100', 16: '+140', 17: '+180', 18: '+220' }),
	row(19, {}),
	row(19, { 12: 'COMPAINION DROIDS - ICONIC DROIDS' }),
	row(19, { 12: 'DROID', 13: 'BASIC' }),
	row(19, { 12: 'BB-8', 13: '100% UPGRADE CHIPS' }),
	row(19, { 12: 'CHOPPER', 13: '+50% CRIT CHANCE & DAMAGE' })
].join('\n');

// A full six-rarity Worker block with a stray blank row *inside* it, between EPIC and LEGENDARY.
// The sheet separates blocks with a blank row, so "block ends at the first blank label" looks
// right until a spacer appears mid-block — then the rarities below it are never visited and
// vanish from the output with nothing left to notice the loss.
const SPACER_CSV = [
	row(17, { 3: 'CRAFTING TIME - NO BUFF', 10: 'WORKER COMPAINION DROIDS - CRAFTING SPEED BUFFS' }),
	row(17, { 0: 'RARITY', 1: 'DROID', 2: 'TYPE', 3: 'BASIC', 4: 'GOLD', 5: 'DIAMOND', 6: 'RAINBOW', 7: 'BESKAR', 8: 'GALACTIC',
	          10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 0: 'COMMON', 1: 'MOUSE', 2: 'WORKER', 3: '0:00:33', 4: '0:02:14', 5: '0:03:54', 6: '0:05:35', 7: '0:04:28', 8: '0:08:22',
	          10: 'COMMON', 11: '20%', 12: '40%', 13: '60%', 14: '80%', 15: '100%', 16: '100%' }),
	row(17, { 10: 'RARE', 11: '40%', 12: '60%', 13: '80%', 14: '100%', 15: '120%', 16: '120%' }),
	row(17, { 10: 'EPIC', 11: '60%', 12: '80%', 13: '100%', 14: '120%', 15: '140%', 16: '140%' }),
	row(17, {}), // the spacer
	row(17, { 10: 'LEGENDARY', 11: '80%', 12: '100%', 13: '120%', 14: '140%', 15: '160%', 16: '160%' }),
	row(17, { 10: 'MYTHIC', 11: '100%', 12: '120%', 13: '140%', 14: '160%', 15: '180%', 16: '180%' }),
	row(17, { 10: 'ICONIC ', 11: 'N/A', 12: 'N/A', 13: 'N/A', 14: 'N/A', 15: 'N/A', 16: 'N/A' }),
	row(17, {}),
	row(17, { 10: 'ASTROMECH COMPAINION DROIDS - PICKAXE LEVEL BUFFS' }),
	row(17, { 10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 10: 'COMMON', 11: '+1', 12: '+2', 13: '+3', 14: '+4', 15: '+5', 16: '+6' }),
	row(17, {}),
	row(17, { 10: 'BATTLE COMPAINION DROIDS - MAX HEALTH BUFFS' }),
	row(17, { 10: 'RARITY', 11: 'BASIC', 12: 'GOLD', 13: 'DIAMOND', 14: 'RAINBOW', 15: 'BESKAR', 16: 'GALACTIC' }),
	row(17, { 10: 'COMMON', 11: '+20', 12: '+60', 13: '+100', 14: '+140', 15: '+180', 16: '+220' }),
	row(17, {}),
	row(17, { 10: 'COMPAINION DROIDS - ICONIC DROIDS' }),
	row(17, { 10: 'DROID', 11: 'BASIC' }),
	row(17, { 10: 'BB-8', 11: '100% UPGRADE CHIPS' }),
	row(17, {}), // a spacer inside the iconic block too
	row(17, { 10: 'CHOPPER', 11: '+50% CRIT CHANCE & DAMAGE' })
].join('\n');

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

	it('normalises the sheet\'s "ICONIC " trailing space in the buff rarity column', () => {
		// The buff blocks' label column is where the quirk actually reaches the output — the
		// craft grid's rarity column is never read. Length matters as much as the value here:
		// an `.every()` over rows that were all filtered out passes vacuously.
		const iconic = out.companionBuffs.filter((b) => b.kind === 'Worker' && b.rarity === 'Iconic');
		expect(iconic).toHaveLength(6);
		expect(iconic.every((b) => b.value === null)).toBe(true);
		expect(out.companionBuffs.some((b) => b.rarity !== b.rarity.trim())).toBe(false);
	});

	it('treats a blank row inside a block as a spacer, not the end of the block', () => {
		const spaced = parseCraftingCompanions(SPACER_CSV);
		const worker = spaced.companionBuffs.filter((b) => b.kind === 'Worker');
		// every rarity below the spacer survives
		expect([...new Set(worker.map((b) => b.rarity))]).toEqual(['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Iconic']);
		expect(worker).toHaveLength(36);
		// ...and the block still stops at the next block's header instead of running on into it
		expect(spaced.companionBuffs.filter((b) => b.kind === 'Astromech')).toHaveLength(6);
		expect(spaced.companionBuffs.filter((b) => b.kind === 'Battle')).toHaveLength(6);
		expect(spaced.iconicCompanionEffects).toEqual([
			{ droid: 'BB8', effect: '100% UPGRADE CHIPS' },
			{ droid: 'CHOPPER', effect: '+50% CRIT CHANCE & DAMAGE' }
		]);
	});

	it('reads a right-hand stack that has moved columns identically', () => {
		// Column-anchored where the sheet can move: the buff/iconic blocks are found by header
		// text in whatever column they sit in. The left grid is row-anchored on its own
		// RARITY/DROID/TYPE triple at 0-2 and throws (below) rather than guess if that moves.
		expect(parseCraftingCompanions(SHIFTED_CSV)).toEqual(out);
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
