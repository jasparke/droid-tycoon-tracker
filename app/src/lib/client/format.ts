// Number display conventions locked by the design handoff (prototype fmtN).
const UNITS: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

export function fmtN(v: number): string {
	for (const [div, sfx] of UNITS)
		if (v >= div) {
			const x = v / div;
			return (x >= 100 ? String(Math.round(x)) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) + sfx;
		}
	return String(Math.round(v));
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function parseNum(str: string): number | null {
	const m = /^\s*([\d.]+)\s*([kmbt]?)/i.exec(str || '');
	if (!m) return null;
	const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[(m[2] || '').toLowerCase() as 'k' | 'm' | 'b' | 't'] ?? 1;
	const v = parseFloat(m[1]) * mult;
	return Number.isFinite(v) ? v : null;
}
