import { toRows, cell } from '../csv';
import { magnitude, income, chips, oneIn, rarity as normRarity, dtype } from '../normalize';
import { TIERS, type Tier } from '$lib/game/tiers';
import type { DroidRow, DroidTierRow, ChipCostRow, SellValueRow, FlawlessRow } from '../types';

const TIER_COLS: Record<Tier, [number, number, number]> = {
	Base: [3, 4, 5], Gold: [6, 7, 8], Diamond: [9, 10, 11], Rainbow: [12, 13, 14], Beskar: [15, 16, 17]
};

function assertHeader(cond: boolean, what: string): void {
	if (!cond) throw new Error(`droid-reference header anchor failed: ${what}`);
}
function numOrNull(s: string): number | null {
	const t = s.trim();
	return !t || t.toUpperCase() === 'N/A' ? null : magnitude(t);
}

export function parseDroidReference(csv: string) {
	const r = toRows(csv);
	const h = r[2];
	assertHeader(cell(h, 0) === 'RARITY' && cell(h, 1) === 'DROID' && cell(h, 2) === 'TYPE', 'left grid RARITY,DROID,TYPE');

	const droids: DroidRow[] = [];
	const droidTiers: DroidTierRow[] = [];
	let curRarity = '';
	for (let i = 3; i < r.length; i++) {
		const row = r[i];
		const name = cell(row, 1).trim();
		if (!name) continue;               // separator / right-stack-only row
		if (cell(row, 0).trim()) curRarity = normRarity(cell(row, 0));
		const inc = income(cell(row, 4));
		const iconic = inc.pct !== null;
		const buyRaw = cell(row, 3).trim();
		droids.push({
			name, rarity: curRarity, type: dtype(cell(row, 2)),
			incomePct: inc.pct,
			buyNc: /NC/i.test(buyRaw) ? parseInt(buyRaw, 10) : null
		});
		for (const tier of TIERS) {
			if (iconic) { droidTiers.push({ droid: name, tier, buy: null, income: null, sell: null }); continue; }
			const [cB, cI, cV] = TIER_COLS[tier];
			droidTiers.push({
				droid: name, tier,
				buy: numOrNull(cell(row, cB)),
				income: income(cell(row, cI)).value,
				sell: numOrNull(cell(row, cV))
			});
		}
	}

	// Right stack — locate the three labeled blocks by their header labels.
	const chipCosts: ChipCostRow[] = [];
	const droidSellValues: SellValueRow[] = [];
	const flawlessSpawn: FlawlessRow[] = [];
	const label = (i: number) => cell(r[i] ?? [], 19).trim();
	for (let i = 0; i < r.length; i++) {
		if (label(i) === 'RARITY' && cell(r[i], 20) === 'BASE -> GOLD') {
			for (let j = i + 1; j < r.length && cell(r[j], 19).trim(); j++) {
				const rar = normRarity(cell(r[j], 19));
				chipCosts.push({ rarity: rar, toGold: chips(cell(r[j], 20)), toDiamond: chips(cell(r[j], 21)), toRainbow: chips(cell(r[j], 22)), toBeskar: chips(cell(r[j], 23)) });
			}
		}
		if (label(i) === 'RARITY' && cell(r[i], 20) === 'GOLD') {
			const tiers: Tier[] = ['Gold', 'Diamond', 'Rainbow', 'Beskar'];
			for (let j = i + 1; j < r.length && cell(r[j], 19).trim(); j++) {
				const rar = normRarity(cell(r[j], 19));
				tiers.forEach((tier, k) => {
					const v = chips(cell(r[j], 20 + k)); // reuse N/A→null + int parse (no CHIPS suffix here, plain ints)
					if (v !== null) droidSellValues.push({ rarity: rar, tier, multiplier: v });
				});
			}
		}
		if (label(i) === 'DEFAULT' && cell(r[i], 20) === 'GOLD') {
			const tiers: Tier[] = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar'];
			const vals = r[i + 1];
			tiers.forEach((tier, k) => flawlessSpawn.push({ tier, oneIn: oneIn(cell(vals, 19 + k)) }));
		}
	}
	assertHeader(chipCosts.length > 0, 'UPGRADE COSTS block found');
	assertHeader(droidSellValues.length > 0, 'DROID SELL VALUE block found');
	assertHeader(flawlessSpawn.length === 5, 'FLAWLESS SPAWN block found');
	return { droids, droidTiers, chipCosts, droidSellValues, flawlessSpawn };
}
