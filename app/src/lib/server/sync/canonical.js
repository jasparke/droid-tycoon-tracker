import { createHash } from 'node:crypto';

/** Sort key for each reference table = its primary-key tuple.
 * @type {Record<string, string[]>} */
const PK = {
	droids: ['name'],
	droidTiers: ['droid', 'tier'],
	rebirthReqs: ['cycle', 'rebirth', 'droid', 'tier'],
	chipCosts: ['rarity'],
	rebirthMeta: ['rebirth'],
	novaShop: ['category', 'item', 'level'],
	cosmetics: ['category', 'name'],
	droidSellValues: ['rarity', 'tier'],
	flawlessSpawn: ['tier'],
	novaPaintStages: ['stage']
};

/**
 * @param {Record<string, any>} a
 * @param {Record<string, any>} b
 * @param {string[]} keys
 * @returns {number}
 */
function cmp(a, b, keys) {
	for (const k of keys) {
		const x = a[k], y = b[k];
		if (x < y) return -1;
		if (x > y) return 1;
	}
	return 0;
}

/** Deterministic: object keys emitted in sorted order.
 * @param {any} v
 * @returns {any}
 */
function sortValue(v) {
	if (Array.isArray(v)) return v.map(sortValue);
	if (v && typeof v === 'object') {
		/** @type {Record<string, any>} */
		const out = {};
		for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
		return out;
	}
	return v;
}

/**
 * @param {Record<string, any[]>} tables
 * @returns {string}
 */
export function serialize(tables) {
	/** @type {Record<string, any>} */
	const norm = {};
	for (const name of Object.keys(tables).sort()) {
		const rows = tables[name];
		const keys = PK[name];
		if (!keys) throw new Error(`canonical.serialize: no primary-key ordering defined for table "${name}"`);
		const sorted = [...rows].sort((a, b) => cmp(a, b, keys));
		norm[name] = sorted.map(sortValue);
	}
	return JSON.stringify(norm);
}

/**
 * @param {Record<string, any[]>} tables
 * @returns {string}
 */
export function checksumOf(tables) {
	return createHash('sha256').update(serialize(tables)).digest('hex');
}
