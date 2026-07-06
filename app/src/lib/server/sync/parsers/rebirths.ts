import { toRows, cell } from '../csv';
import { tierWord } from '../normalize';
import { resolveDroid } from '../aliases';
import type { RebirthReqRow, Tier } from '../types';

interface CycleCols { cycle: number; trans: number; credits: number; req: number; unlock: number | null; }
const CYCLES: CycleCols[] = [
	{ cycle: 1, trans: 10, credits: 11, req: 12, unlock: 14 },
	{ cycle: 2, trans: 17, credits: 18, req: 19, unlock: null },
	{ cycle: 3, trans: 23, credits: 24, req: 25, unlock: null },
	{ cycle: 4, trans: 29, credits: 30, req: 31, unlock: null }
];

function splitReq(s: string): { tier: Tier; droid: string } {
	const t = s.trim();
	const sp = t.indexOf(' ');
	if (sp < 0) throw new Error(`unsplittable req cell: ${s}`);
	return { tier: tierWord(t.slice(0, sp)), droid: resolveDroid(t.slice(sp + 1)) };
}
function stripCredits(s: string): string {
	return s.trim().replace(/\s*CREDITS$/i, '').trim();
}

export function parseRebirths(csv: string): { rebirthReqs: RebirthReqRow[] } {
	const r = toRows(csv);
	const out: RebirthReqRow[] = [];
	for (const c of CYCLES) {
		let rebirth = 0;
		for (let i = 2; i < r.length; i++) {
			const trans = cell(r[i], c.trans).trim();
			const m = /^(\d+)->(\d+)$/.exec(trans);
			if (m) {
				rebirth = parseInt(m[2], 10);
				const credits = stripCredits(cell(r[i], c.credits));
				const unlock = c.unlock !== null ? (cell(r[i], c.unlock).trim() || null) : null;
				// group of exactly 3: this row + next 2
				for (let g = 0; g < 3; g++) {
					const reqCell = cell(r[i + g], c.req).trim();
					if (!reqCell) continue;
					const { tier, droid } = splitReq(reqCell);
					out.push({ cycle: c.cycle, rebirth, droid, tier, credits, unlock: g === 0 ? unlock : null });
				}
			}
		}
	}
	return { rebirthReqs: out };
}
