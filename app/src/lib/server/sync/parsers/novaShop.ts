import { toRows, cell } from '../csv';
import { unlockLabel } from '../normalize';
import type { NovaShopRow, RebirthMetaRow, PaintStageRow } from '../types';

// Every column index in this tab moved when the sheet added two Featured columns
// (2026-08 patch). Nothing here may be positional: sections are found by their banner
// text, item columns by the name row, and any layout we cannot resolve throws.
const LADDERS: { banner: string; category: string }[] = [
	{ banner: 'NOVA SHOP - FEATURED', category: 'Featured' },
	{ banner: 'NOVA SHOP - CORE UPGRADES', category: 'Core upgrades' },
	{ banner: 'NOVA SHOP - WORKSHOP UPGRADES', category: 'Workshop upgrades' }
];
const COSMETICS_BANNER = 'NOVA SHOP - COSMETICS';

function fail(what: string): never {
	throw new Error(`nova-shop header anchor failed: ${what}`);
}
const norm = (s: string) => s.trim().toUpperCase();

/** Row index of the banner row = the first row carrying any known section banner. */
function findBannerRow(r: string[][]): number {
	const wanted = new Set([...LADDERS.map((l) => l.banner), COSMETICS_BANNER]);
	for (let i = 0; i < r.length; i++) {
		if (r[i].some((c) => wanted.has(norm(c)))) return i;
	}
	return fail('no NOVA SHOP section banner found in any row');
}

/** Column of `banner` within the banner row. */
function anchorCol(bannerRow: string[], banner: string): number {
	const col = bannerRow.findIndex((c) => norm(c) === banner);
	return col >= 0 ? col : fail(`banner "${banner}" not found`);
}

/** Row index of the item-name header = first row after the banner with LEVEL under an anchor. */
function findHeaderRow(r: string[][], bannerRow: number, firstAnchor: number): number {
	for (let i = bannerRow + 1; i < r.length; i++) {
		if (norm(cell(r[i], firstAnchor)) === 'LEVEL') return i;
	}
	return fail('no LEVEL header row beneath the section banners');
}

/** First LEVEL column at or after `from`, bounded by `end`. */
function levelColFrom(header: string[], from: number, end: number, label: string): number {
	for (let c = from; c < end; c++) if (norm(cell(header, c)) === 'LEVEL') return c;
	return fail(`${label}: no LEVEL column between ${from} and ${end}`);
}

export function parseNovaShop(csv: string) {
	const r = toRows(csv);
	const bannerRow = findBannerRow(r);
	const banners = r[bannerRow];
	// every non-empty banner cell bounds the section to its left
	const boundaries = banners.map((c, i) => (c.trim() ? i : -1)).filter((i) => i >= 0);
	const endOf = (anchor: number, width: number) =>
		boundaries.find((b) => b > anchor) ?? width;

	const firstAnchor = anchorCol(banners, LADDERS[0].banner);
	const headerRow = findHeaderRow(r, bannerRow, firstAnchor);
	const header = r[headerRow];

	const novaShop: NovaShopRow[] = [];
	for (const { banner, category } of LADDERS) {
		const anchor = anchorCol(banners, banner);
		const end = endOf(anchor, header.length);
		const levelCol = levelColFrom(header, anchor, end, category);
		const items: [number, string][] = [];
		for (let c = levelCol + 1; c < end; c++) {
			const name = cell(header, c).trim();
			if (name) items.push([c, unlockLabel(name)]); // sheet is ALL CAPS; DB uses "Max Health" style
		}
		if (!items.length) fail(`${category}: no item columns between ${levelCol + 1} and ${end}`);
		for (const [col, item] of items) {
			for (let i = headerRow + 1; i < r.length; i++) {
				const lvl = cell(r[i], levelCol).trim();
				const costRaw = cell(r[i], col).trim();
				if (!lvl || !costRaw) break; // ladder ends at the first blank level or cost
				novaShop.push({ category, item, level: parseInt(lvl, 10), cost: parseInt(costRaw.replace(/,/g, ''), 10) });
			}
		}
	}

	// Cosmetics block: a LEVEL column with the paint ladder immediately to its right.
	const cosAnchor = anchorCol(banners, COSMETICS_BANNER);
	const paintLevelCol = levelColFrom(header, cosAnchor, header.length, 'Cosmetics');
	const paintCol = paintLevelCol + 1;
	if (!/BASE PAINT/i.test(cell(header, paintCol))) {
		fail(`Cosmetics: expected a BASE PAINT column at ${paintCol}, found "${cell(header, paintCol)}"`);
	}
	const novaPaintStages: PaintStageRow[] = [];
	for (let i = headerRow + 1; i < r.length; i++) {
		const s = cell(r[i], paintLevelCol).trim();
		const c = cell(r[i], paintCol).trim();
		if (!s || !c) break;
		novaPaintStages.push({ stage: parseInt(s, 10), crystalCost: parseInt(c.replace(/,/g, ''), 10) });
	}
	if (!novaPaintStages.length) fail('Cosmetics: BASE PAINT ladder is empty');

	// Rebirth-meta block: anywhere in the sheet, located by its own RB LEVEL header.
	let rbRow = -1;
	let rbCol = -1;
	outer: for (let i = 0; i < r.length; i++) {
		for (let c = 0; c < r[i].length; c++) {
			if (norm(cell(r[i], c)) === 'RB LEVEL') { rbRow = i; rbCol = c; break outer; }
		}
	}
	if (rbRow < 0) fail('RB LEVEL block not found');
	for (const [offset, label] of [[1, 'CRYSTAL QUANTITY'], [2, 'CREDIT MULT'], [3, 'XP MULT']] as const) {
		if (norm(cell(r[rbRow], rbCol + offset)) !== label) {
			fail(`RB LEVEL block: expected "${label}" at column ${rbCol + offset}`);
		}
	}
	const rebirthMeta: RebirthMetaRow[] = [];
	for (let i = rbRow + 1; i < r.length; i++) {
		const m = /^RB\s+(\d+)$/i.exec(cell(r[i], rbCol).trim());
		if (!m) break;
		rebirthMeta.push({
			rebirth: parseInt(m[1], 10),
			nova: parseInt(cell(r[i], rbCol + 1).replace(/[^\d]/g, ''), 10),
			creditMult: parseInt(cell(r[i], rbCol + 2).replace(/%/g, ''), 10),
			xpMult: parseInt(cell(r[i], rbCol + 3).replace(/%/g, ''), 10)
		});
	}
	if (!rebirthMeta.length) fail('RB LEVEL block has no RB rows');

	return { novaShop, rebirthMeta, novaPaintStages };
}
