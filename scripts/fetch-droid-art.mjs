/*
 * Fetch + self-host droid tier-art webp into app/static/assets/droids/.
 *
 * Primary source: droidtrakr.com. It publishes 293 of the 340 expected files
 * (68 droids x 5 tiers). The other 47 (R2-D2's 5 tiers + 42 higher-tier files)
 * are NOT on droidtrakr.
 *
 * IMPORTANT — droidtrakr does not 404 for a missing asset. It 308-redirects to
 * its single-page app, which answers 200 with a ~12.8 KB `text/html`
 * (`<!doctype html>`) body. That HTML body IS droidtrakr's "not found" signal.
 * So this script classifies a response by its *bytes*, not its status code:
 *   - valid webp (image/webp + RIFF/WEBP magic, non-empty) -> save.
 *   - not-found signal (non-webp body, e.g. the SPA HTML, or a 4xx) -> skip,
 *     then try the droidex fallback below.
 *   - network error / 5xx / a webp content-type with corrupt bytes -> FAIL
 *     (exit 1) so a broken pull is never silently committed.
 * (This overrides the original plan's "non-webp 200 -> fail" rule, which assumed
 * droidtrakr returns 404s; it does not, so that rule would hard-fail every gap.)
 *
 * Fallback source — droidex (https://github.com/erikpeik/droidex), no LICENSE:
 *   For each file droidtrakr lacks, try the droidex GitHub repo at a pinned
 *   commit. droidex stores PNGs under public/droids/ named `{NAME}_{TIER}.png`
 *   where NAME is the droid name upper-cased with spaces -> "_" and hyphens
 *   kept (e.g. "IG-11 MARSHAL" -> "IG-11_MARSHAL"), TIER upper-cased. A hit is
 *   downloaded and converted PNG -> webp with `cwebp -q 90` (native dimensions
 *   preserved; no upscaling). droidex covers only LO's Gold/Diamond/Rainbow of
 *   our 47 gaps; everything else (R2-D2, the Mythics, Iconic upper tiers) is
 *   absent there too and stays a graceful gap (DroidImg degrades to text).
 *   Provenance is fully reconstructible from this file: repo + DROIDEX_SHA +
 *   the remap rule above + the cwebp command.
 *
 * Idempotent: files already on disk are skipped without any network call, so a
 * re-run against the committed set exits 0 and re-downloads nothing. cwebp is
 * only invoked when a droidex file is missing locally, so the committed-set
 * re-run needs no cwebp on PATH.
 */
import { readFile, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execFileP = promisify(execFile);
const dir = import.meta.dirname;
const SEED = path.join(dir, '../app/drizzle/seed-data.json');
const OUT = path.join(dir, '../app/static/assets/droids');
const REMOTE = 'https://droidtrakr.com/droid-tycoon/assets/droids/';
const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar'];

// droidex fallback (see header). Pinned commit so the pull is reproducible.
const DROIDEX_SHA = '4e159c2026dec6e84f43d8eabe04c4b542d3fc85';
const DROIDEX_RAW = `https://raw.githubusercontent.com/erikpeik/droidex/${DROIDEX_SHA}/public/droids/`;

const normName = (n) => String(n).toUpperCase().replace(/[^A-Z0-9]/g, '');
const fileTier = (t) => (t === 'Base' ? 'Default' : t);
const artFile = (name, tier) => `${normName(name)}_${fileTier(tier)}.webp`;
// droidex keeps hyphens and turns spaces into underscores (not our normName).
const droidexFile = (name, tier) =>
	`${String(name).toUpperCase().replace(/ /g, '_')}_${fileTier(tier).toUpperCase()}.png`;
const exists = (p) => access(p).then(() => true, () => false);
const isWebp = (b) =>
	b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
const isPng = (b) => b.length >= 8 && b.toString('hex', 0, 4) === '89504e47';

// Is cwebp on PATH? (Only needed for droidex recovery of files not yet on disk.)
let cwebpOk = null;
const haveCwebp = async () => {
	if (cwebpOk === null) {
		cwebpOk = await execFileP('cwebp', ['-version']).then(() => true, () => false);
	}
	return cwebpOk;
};

// Try to recover one file from droidex: fetch PNG, convert to webp at `dest`.
// Returns true on success. Misses are soft (best-effort fallback source).
async function recoverFromDroidex(name, tier, dest) {
	const src = droidexFile(name, tier);
	let buf;
	try {
		const res = await fetch(DROIDEX_RAW + src);
		if (!res.ok) return false; // droidex genuinely lacks it
		buf = Buffer.from(await res.arrayBuffer());
	} catch (e) {
		console.warn(`  droidex fetch failed for ${src}: ${e.message}`);
		return false;
	}
	if (!isPng(buf)) return false;
	if (!(await haveCwebp())) {
		console.warn(`  cwebp not on PATH; cannot convert ${src}`);
		return false;
	}
	const tmpPng = path.join(tmpdir(), `droidex-${process.pid}-${src}`);
	try {
		await writeFile(tmpPng, buf);
		await execFileP('cwebp', ['-q', '90', tmpPng, '-o', dest]);
		const out = await readFile(dest);
		if (!isWebp(out)) {
			await rm(dest, { force: true });
			console.warn(`  cwebp produced invalid webp for ${src}`);
			return false;
		}
		return true;
	} catch (e) {
		await rm(dest, { force: true });
		console.warn(`  cwebp failed for ${src}: ${e.message}`);
		return false;
	} finally {
		await rm(tmpPng, { force: true });
	}
}

const { droids } = JSON.parse(await readFile(SEED, 'utf8'));
await mkdir(OUT, { recursive: true });
const pairs = droids.flatMap((d) => TIERS.map((t) => ({ name: d.name, tier: t })));
console.log(`${droids.length} droids × ${TIERS.length} tiers = ${pairs.length} files`);

let onDisk = 0;
let fromTrakr = 0;
const recovered = [];
const unavailable = [];
const hardFailed = [];

for (const { name, tier } of pairs) {
	const f = artFile(name, tier);
	const dest = path.join(OUT, f);
	if (await exists(dest)) {
		onDisk++;
		continue;
	}
	// 1) droidtrakr (primary).
	let res;
	try {
		res = await fetch(REMOTE + f);
	} catch (e) {
		hardFailed.push(`${f} (network: ${e.message})`);
		continue;
	}
	if (res.status >= 500) {
		hardFailed.push(`${f} (HTTP ${res.status})`);
		continue;
	}
	const ct = res.headers.get('content-type') || '';
	const buf = Buffer.from(await res.arrayBuffer());
	if (ct.includes('image/webp')) {
		// Claims webp: it must actually be one, else it is corrupt -> fail loud.
		if (isWebp(buf)) {
			await writeFile(dest, buf);
			fromTrakr++;
			continue;
		}
		hardFailed.push(`${f} (image/webp but corrupt/empty: ${buf.length}B)`);
		continue;
	}
	// Non-webp body (SPA HTML / 4xx) = droidtrakr does not have it. Try droidex.
	if (await recoverFromDroidex(name, tier, dest)) {
		recovered.push(f);
	} else {
		unavailable.push(f);
	}
}

console.log(
	`on disk (skipped) ${onDisk} | droidtrakr ${fromTrakr} | droidex recovered ${recovered.length} | unavailable ${unavailable.length}`
);
if (recovered.length) {
	console.log(`recovered from droidex (${recovered.length}):`);
	for (const x of recovered) console.log('  ' + x);
}
if (unavailable.length) {
	console.log(
		`genuinely unavailable — graceful gaps, DroidImg degrades to text (${unavailable.length}):`
	);
	for (const x of unavailable) console.log('  ' + x);
}
if (hardFailed.length) {
	console.error(`FAILED ${hardFailed.length} (network/5xx/corrupt — NOT committed):`);
	for (const x of hardFailed) console.error('  ' + x);
	process.exit(1);
}
const total = onDisk + fromTrakr + recovered.length;
console.log(`present ${total}/${pairs.length} droid art files (${unavailable.length} genuinely unavailable)`);
