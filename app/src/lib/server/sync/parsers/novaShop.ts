import { toRows, cell } from '../csv';
import { unlockLabel } from '../normalize';
import type { NovaShopRow, RebirthMetaRow, PaintStageRow } from '../types';

const HEADER = 3; // logical header row (item names)

function parseLadder(r: string[][], category: string, levelCol: number, firstItemCol: number, lastItemCol: number): NovaShopRow[] {
	const out: NovaShopRow[] = [];
	for (let col = firstItemCol; col <= lastItemCol; col++) {
		const item = unlockLabel(cell(r[HEADER], col)); // sheet headers are ALL CAPS; DB uses "Max Health" style
		if (!item) continue;
		for (let i = HEADER + 1; i < r.length; i++) {
			const lvl = cell(r[i], levelCol).trim();
			const costRaw = cell(r[i], col).trim();
			if (!lvl || !costRaw) break;              // ladder ends at first blank
			out.push({ category, item, level: parseInt(lvl, 10), cost: parseInt(costRaw.replace(/,/g, ''), 10) });
		}
	}
	return out;
}

export function parseNovaShop(csv: string) {
	const r = toRows(csv);
	const novaShop = [
		...parseLadder(r, 'Featured', 0, 1, 3),
		...parseLadder(r, 'Core upgrades', 5, 6, 14),
		...parseLadder(r, 'Workshop upgrades', 16, 17, 25)
	];

	// paint stages: col27 LEVEL / col28 cost, rows under the LEVEL header
	const novaPaintStages: PaintStageRow[] = [];
	for (let i = 0; i < r.length; i++) {
		if (cell(r[i], 27).trim() === 'LEVEL' && /BASE PAINT/i.test(cell(r[i], 28))) {
			for (let j = i + 1; j < r.length; j++) {
				const s = cell(r[j], 27).trim(), c = cell(r[j], 28).trim();
				if (!s || !c) break;
				novaPaintStages.push({ stage: parseInt(s, 10), crystalCost: parseInt(c.replace(/,/g, ''), 10) });
			}
		}
	}

	// rebirth-meta: header 'RB LEVEL' in col34
	const rebirthMeta: RebirthMetaRow[] = [];
	for (let i = 0; i < r.length; i++) {
		if (cell(r[i], 34).trim() === 'RB LEVEL') {
			for (let j = i + 1; j < r.length; j++) {
				const rb = cell(r[j], 34).trim();
				const m = /^RB\s+(\d+)$/i.exec(rb);
				if (!m) break;
				rebirthMeta.push({
					rebirth: parseInt(m[1], 10),
					nova: parseInt(cell(r[j], 35).replace(/[^\d]/g, ''), 10),
					creditMult: parseInt(cell(r[j], 36).replace(/%/g, ''), 10),
					xpMult: parseInt(cell(r[j], 37).replace(/%/g, ''), 10)
				});
			}
		}
	}
	return { novaShop, rebirthMeta, novaPaintStages };
}
