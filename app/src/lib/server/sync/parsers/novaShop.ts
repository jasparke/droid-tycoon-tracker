import { toRows, cell } from '../csv';
import type { NovaShopRow, RebirthMetaRow, PaintStageRow } from '../types';

const HEADER = 3; // logical header row (item names)

function parseLadder(r: string[][], category: string, levelCol: number, firstItemCol: number, lastItemCol: number): NovaShopRow[] {
	const out: NovaShopRow[] = [];
	for (let col = firstItemCol; col <= lastItemCol; col++) {
		const item = cell(r[HEADER], col).trim();
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
		...parseLadder(r, 'Core upgrades', 0, 1, 9),
		...parseLadder(r, 'Workshop upgrades', 11, 12, 20)
	];

	// paint stages: col22 LEVEL / col23 cost, rows under the LEVEL header
	const novaPaintStages: PaintStageRow[] = [];
	for (let i = 0; i < r.length; i++) {
		if (cell(r[i], 22).trim() === 'LEVEL' && /BASE PAINT/i.test(cell(r[i], 23))) {
			for (let j = i + 1; j < r.length; j++) {
				const s = cell(r[j], 22).trim(), c = cell(r[j], 23).trim();
				if (!s || !c) break;
				novaPaintStages.push({ stage: parseInt(s, 10), crystalCost: parseInt(c.replace(/,/g, ''), 10) });
			}
		}
	}

	// rebirth-meta: header 'RB LEVEL' in col29
	const rebirthMeta: RebirthMetaRow[] = [];
	for (let i = 0; i < r.length; i++) {
		if (cell(r[i], 29).trim() === 'RB LEVEL') {
			for (let j = i + 1; j < r.length; j++) {
				const rb = cell(r[j], 29).trim();
				const m = /^RB\s+(\d+)$/i.exec(rb);
				if (!m) break;
				rebirthMeta.push({
					rebirth: parseInt(m[1], 10),
					nova: parseInt(cell(r[j], 30).replace(/[^\d]/g, ''), 10),
					creditMult: parseInt(cell(r[j], 31).replace(/%/g, ''), 10),
					xpMult: parseInt(cell(r[j], 32).replace(/%/g, ''), 10)
				});
			}
		}
	}
	return { novaShop, rebirthMeta, novaPaintStages };
}
