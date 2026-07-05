// Extracts reference game data from the frozen prototype into seed-data.json.
// SQL inserts cover droids/tiers/rebirths/chips; JS consts cover nova/cosmetics/meta.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const sql = readFileSync('prototype/schema.sql', 'utf8');
const html = readFileSync('prototype/index.html', 'utf8');

// --- generic SQL tuple parser (values are numbers, single-quoted strings, or NULL) ---
// Adaptation 1: every insert in the prototype ends with an `on conflict (col[,col])`
// clause (e.g. `on conflict (name) do update ...`). Because the body capture runs to
// the statement-terminating `;`, the `(col[,col])` after "on conflict" is picked up by
// the tuple-splitting regex as an extra "tuple" containing only bare identifiers (no
// quotes/digits/NULL). We drop any tuple that yields zero parsed values, which discards
// these on-conflict artifacts without needing to special-case each insert's SQL shape.
// Adaptation 2: the original valRe only matched quoted strings and digits, silently
// skipping bare `NULL` literals. The `rebirths` insert uses NULL in the credits/unlock
// positions *before* the droid/tier columns (e.g. `(1,1,NULL,NULL,'PIT','Base')`), so
// skipping NULL shifted every later value left by one slot per NULL, corrupting droid
// and tier. NULL is now matched explicitly and pushed as `null` to preserve position.
function tuples(insertRegex) {
	const m = sql.match(insertRegex);
	if (!m) throw new Error(`insert not found: ${insertRegex}`);
	const body = m[1];
	const out = [];
	const tupleRe = /\(([^()]*)\)/g;
	let t;
	while ((t = tupleRe.exec(body))) {
		const vals = [];
		const valRe = /'((?:[^']|'')*)'|(-?\d+)|\bNULL\b/g;
		let v;
		while ((v = valRe.exec(t[1])))
			vals.push(v[1] != null ? v[1].replace(/''/g, "'") : v[2] != null ? Number(v[2]) : null);
		if (vals.length) out.push(vals);
	}
	return out;
}

const droids = tuples(/insert into droids[^;]*values([\s\S]*?);/).map(([name, rarity, type]) => ({
	name, rarity, type
}));
const droidTiers = tuples(/insert into droid_tiers[^;]*values([\s\S]*?);/).map(
	([droid, tier, buy, income, sell]) => ({ droid, tier, buy, income, sell })
);
// The frozen prototype's rebirths insert misspells these droids relative to its droids insert.
const DROID_ALIASES = {
	'BB-9': 'BB9', 'MONO-WALKER': 'MONO-WLKR', 'MONO-WALKR': 'MONO-WLKR',
	'OPTI-STRIKE': 'OPTI-STRK', 'MECHA DROID': 'MECHA-DROID'
};
const rebirthReqs = tuples(/insert into rebirths[^;]*values([\s\S]*?);/).map(
	([cycle, rebirth, credits, unlock, droid, tier]) => ({
		cycle,
		rebirth,
		// credits is NOT NULL in the app schema, but ~2/3 of prototype rows carry a NULL
		// credits value (rows that only add a droid/tier requirement to a rebirth threshold
		// already priced by an earlier row for the same cycle+rebirth). Empty string is the
		// sentinel for "no additional credit cost" for this row.
		credits: credits == null ? '' : credits,
		unlock: unlock == null ? null : String(unlock).trim() || null,
		droid: DROID_ALIASES[droid] ?? droid,
		tier
	})
);
const chipCosts = tuples(/insert into chip_costs[^;]*values([\s\S]*?);/).map(
	([rarity, toGold, toDiamond, toRainbow, toBeskar]) => ({ rarity, toGold, toDiamond, toRainbow, toBeskar })
);

// --- JS const literals from the prototype (evaluated in a bare sandbox) ---
function jsConst(name) {
	const m = html.match(new RegExp(`const ${name}=([\\s\\S]*?);\\s*(?:\\n|const |function )`));
	if (!m) throw new Error(`const ${name} not found`);
	return vm.runInNewContext(`(${m[1]})`, {});
}
const NOVASHOP = jsConst('NOVASHOP'); // {category: [[item,[costs...]],...]}
const COSMETICS = jsConst('COSMETICS'); // [[name, requirement],...]
const NOVA = jsConst('NOVA'); const CRED = jsConst('CRED'); const XP = jsConst('XP');

const novaShop = Object.entries(NOVASHOP).flatMap(([category, items]) =>
	items.flatMap(([item, costs]) => costs.map((cost, i) => ({ category, item, level: i + 1, cost })))
);
const cosmetics = COSMETICS.map(([name, requirement]) => ({ category: 'general', name, requirement }));
const rebirthMeta = Object.keys(NOVA).map((rb) => ({
	rebirth: Number(rb), nova: NOVA[rb], creditMult: CRED[rb], xpMult: XP[rb]
}));

const data = { droids, droidTiers, rebirthReqs, chipCosts, rebirthMeta, novaShop, cosmetics };
writeFileSync('app/drizzle/seed-data.json', JSON.stringify(data, null, 1));
console.log(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])));
