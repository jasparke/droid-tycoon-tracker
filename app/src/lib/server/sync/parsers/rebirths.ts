import { toRows, cell } from '../csv';
import { tierWord, unlockLabel } from '../normalize';
import { resolveDroid } from '../aliases';
import type { RebirthReqRow, Tier } from '../types';

interface CycleCols { cycle: number; trans: number; credits: number; req: number; unlock: number | null; }
const CYCLES: CycleCols[] = [
	{ cycle: 1, trans: 11, credits: 12, req: 13, unlock: 15 },
	{ cycle: 2, trans: 19, credits: 20, req: 21, unlock: null },
	{ cycle: 3, trans: 26, credits: 27, req: 28, unlock: null },
	{ cycle: 4, trans: 33, credits: 34, req: 35, unlock: null }
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
			const m = /^(\d+)\s*->\s*(\d+)$/.exec(trans); // sheet writes "1 ->2" (stray space)
			if (m) {
				rebirth = parseInt(m[2], 10);
				const credits = stripCredits(cell(r[i], c.credits));
				const rawUnlock = c.unlock !== null ? cell(r[i], c.unlock).trim() : '';
				const unlock = rawUnlock ? unlockLabel(rawUnlock) : null;
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
