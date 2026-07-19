import type { PayloadTables, DiffResult, TableDiff, RowChange } from './types';

const PK: Record<string, string[]> = {
	droids: ['name'], droidTiers: ['droid', 'tier'], rebirthReqs: ['cycle', 'rebirth', 'droid', 'tier'],
	chipCosts: ['rarity'], rebirthMeta: ['rebirth'], novaShop: ['category', 'item', 'level'],
	cosmetics: ['category', 'name'], droidSellValues: ['rarity', 'tier'], flawlessSpawn: ['tier'], novaPaintStages: ['stage']
};
const keyOf = (row: Record<string, unknown>, keys: string[]) => keys.map((k) => String(row[k])).join('/');

function rowsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	for (const k of keys) if (!Object.is(a[k], b[k])) return false;
	return true;
}

function diffOne(prev: Record<string, unknown>[], next: Record<string, unknown>[], keys: string[]): TableDiff {
	const pm = new Map(prev.map((r) => [keyOf(r, keys), r]));
	const nm = new Map(next.map((r) => [keyOf(r, keys), r]));
	const added = next.filter((r) => !pm.has(keyOf(r, keys)));
	const removed = prev.filter((r) => !nm.has(keyOf(r, keys)));
	const changed: RowChange[] = [];
	for (const [k, nrow] of nm) {
		const prow = pm.get(k);
		if (prow && !rowsEqual(prow, nrow)) changed.push({ key: k, before: prow, after: nrow });
	}
	return { added, removed, changed };
}

export function diffTables(prev: PayloadTables, next: PayloadTables): DiffResult {
	const out: DiffResult = {};
	for (const table of Object.keys(PK)) {
		out[table] = diffOne(
			(prev as unknown as Record<string, Record<string, unknown>[]>)[table],
			(next as unknown as Record<string, Record<string, unknown>[]>)[table],
			PK[table]
		);
	}
	return out;
}

export function isEmpty(diff: DiffResult): boolean {
	return Object.values(diff).every((d) => !d.added.length && !d.removed.length && !d.changed.length);
}
