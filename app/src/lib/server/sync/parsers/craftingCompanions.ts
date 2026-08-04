import { toRows, cell } from '../csv';
import { rarity as normRarity } from '../normalize';
import { resolveDroid } from '../aliases';
import { TIERS, type Tier } from '$lib/game/tiers';
import type { CraftingTimeRow, CompanionBuffRow, IconicCompanionEffectRow } from '../types';

// This tab spells the tiers BASIC..GALACTIC and misspells "COMPANION" as "COMPAINION" in all
// four block headers; the ICONIC rarity label carries a trailing space. All three are the
// sheet's own text — matched here, never corrected (sheet authority).
const TIER_WORD: Record<Tier, string> = {
	Base: 'BASIC', Gold: 'GOLD', Diamond: 'DIAMOND', Rainbow: 'RAINBOW', Beskar: 'BESKAR', Galactic: 'GALACTIC'
};
const BUFF_BLOCKS: { re: RegExp; kind: string }[] = [
	{ re: /^WORKER COMPAINION DROIDS\b/i, kind: 'Worker' },
	{ re: /^ASTROMECH COMPAINION DROIDS\b/i, kind: 'Astromech' },
	{ re: /^BATTLE COMPAINION DROIDS\b/i, kind: 'Battle' }
];
const ICONIC_BLOCK = /^COMPAINION DROIDS - ICONIC DROIDS\b/i;

function fail(what: string): never {
	throw new Error(`crafting-companions header anchor failed: ${what}`);
}
const norm = (s: string) => s.trim().toUpperCase();

export function hmsToSeconds(s: string): number | null {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return null; // blank = unpublished, N/A = Iconic
	const m = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(t);
	if (!m) throw new Error(`unparseable craft duration: ${s}`);
	return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

export function buffValue(s: string): number | null {
	const t = s.trim();
	if (!t || t.toUpperCase() === 'N/A') return null;
	const m = /^\+?(\d+)%?$/.exec(t);
	if (!m) throw new Error(`unparseable companion buff: ${s}`);
	return parseInt(m[1], 10);
}

/** Column of the right-hand stack's label cells, found by whichever buff block appears first. */
function findLabelCol(r: string[][]): number {
	for (const row of r) {
		for (let c = 0; c < row.length; c++) {
			if (BUFF_BLOCKS.some((b) => b.re.test(row[c].trim()))) return c;
		}
	}
	return fail('no COMPAINION buff block found in any column');
}

/** Map Tier -> column. The six tier headers must sit contiguously at `from`..`from+5`.
 *  A loose "first column with this word" search would happily match the *other* grid's
 *  tier header when one column goes missing, which is exactly the silent mis-parse this
 *  tab's rewrite exists to prevent. */
function tierCols(header: string[], from: number, label: string): Record<Tier, number> {
	const out = {} as Record<Tier, number>;
	TIERS.forEach((tier, i) => {
		const col = from + i;
		if (norm(cell(header, col)) !== TIER_WORD[tier]) {
			fail(`${label}: expected tier column ${TIER_WORD[tier]} at ${col}, found "${cell(header, col)}"`);
		}
		out[tier] = col;
	});
	return out;
}

export function parseCraftingCompanions(csv: string) {
	const r = toRows(csv);

	// ---- left grid: per-droid craft durations ----
	const gridHeader = r.findIndex(
		(row) => norm(cell(row, 0)) === 'RARITY' && norm(cell(row, 1)) === 'DROID' && norm(cell(row, 2)) === 'TYPE'
	);
	if (gridHeader < 0) fail('left grid RARITY,DROID,TYPE header row not found');
	const gridCols = tierCols(r[gridHeader], 3, 'craft grid');

	const craftingTimes: CraftingTimeRow[] = [];
	for (let i = gridHeader + 1; i < r.length; i++) {
		const name = resolveDroid(cell(r[i], 1).trim()); // BB-8 -> BB8
		if (!name) continue; // separator / right-stack-only row
		for (const tier of TIERS) {
			craftingTimes.push({ droid: name, tier, seconds: hmsToSeconds(cell(r[i], gridCols[tier])) });
		}
	}
	if (!craftingTimes.length) fail('craft grid produced no rows');

	// ---- right stack: three buff tables + the iconic-effects table ----
	const labelCol = findLabelCol(r);
	const label = (i: number) => cell(r[i] ?? [], labelCol).trim();

	// Each block runs to the *next block's header*, and a blank label inside one is a spacer to
	// skip, not the end of the block. Ending at the first blank label would drop every row below
	// a stray spacer without parsing them — a loss nothing downstream can see. Over-running is
	// the safe direction by comparison: a stray value cell throws out of buffValue.
	const headOf = (re: RegExp, missing: string) => {
		const i = r.findIndex((row) => re.test(cell(row, labelCol).trim()));
		return i >= 0 ? i : fail(missing);
	};
	const buffHeads = BUFF_BLOCKS.map(({ re, kind }) => ({ kind, head: headOf(re, `${kind} buff block header not found`) }));
	const iconicHead = headOf(ICONIC_BLOCK, 'COMPAINION DROIDS - ICONIC DROIDS block not found');
	const markers = [...buffHeads.map((b) => b.head), iconicHead].sort((a, b) => a - b);
	const endOf = (head: number) => markers.find((m) => m > head) ?? r.length;

	const companionBuffs: CompanionBuffRow[] = [];
	for (const { kind, head } of buffHeads) {
		const hdr = head + 1;
		if (norm(label(hdr)) !== 'RARITY') fail(`${kind} buff block: expected a RARITY header at row ${hdr}`);
		const cols = tierCols(r[hdr], labelCol + 1, `${kind} buffs`);
		const end = endOf(head);
		let rows = 0;
		for (let i = hdr + 1; i < end; i++) {
			if (!label(i)) continue; // spacer row
			const rar = normRarity(label(i)); // trims "ICONIC " -> "Iconic"
			for (const tier of TIERS) {
				companionBuffs.push({ kind, rarity: rar, tier, value: buffValue(cell(r[i], cols[tier])) });
			}
			rows++;
		}
		if (!rows) fail(`${kind} buff block has no rarity rows`);
	}

	const iconicHdr = iconicHead + 1;
	if (norm(label(iconicHdr)) !== 'DROID') fail(`iconic effects block: expected a DROID header at row ${iconicHdr}`);
	const iconicCompanionEffects: IconicCompanionEffectRow[] = [];
	for (let i = iconicHdr + 1; i < endOf(iconicHead); i++) {
		if (!label(i)) continue; // spacer row
		iconicCompanionEffects.push({ droid: resolveDroid(label(i)), effect: cell(r[i], labelCol + 1).trim() });
	}
	if (!iconicCompanionEffects.length) fail('iconic effects block has no droid rows');

	return { craftingTimes, companionBuffs, iconicCompanionEffects };
}
