/*
 * Fetch + self-host droid tier-art webp into app/static/assets/droids/.
 *
 * Primary source: droidtrakr.com. It publishes 293 of the 340 expected files
 * (68 droids x 5 tiers) as `.webp` at the normName path. The rest need the
 * fallbacks below.
 *
 * IMPORTANT — droidtrakr does not 404 for a missing asset. It 308-redirects to
 * its single-page app, which answers 200 with a ~12.8 KB `text/html`
 * (`<!doctype html>`) body. That HTML body IS droidtrakr's "not found" signal.
 * So this script classifies a response by its *bytes*, not its status code:
 *   - valid webp (image/webp + RIFF/WEBP magic, non-empty) -> save.
 *   - not-found signal (non-webp body, e.g. the SPA HTML, or a 4xx) -> try the
 *     fallbacks below, else logged skip.
 *   - network error / 5xx / a webp content-type with corrupt bytes -> FAIL
 *     (exit 1) so a broken pull is never silently committed.
 * (This overrides the original plan's "non-webp 200 -> fail" rule, which assumed
 * droidtrakr returns 404s; it does not, so that rule would hard-fail every gap.)
 *
 * The fallback fetches follow the same exit-code policy: a genuine not-found
 * (HTTP 4xx on a PNG URL, or absence from the manifest / droidex) is a logged
 * skip, but a network error or 5xx anywhere — including fetching the manifest
 * itself, or an unparseable manifest — hard-fails the run (exit 1) so a
 * transient outage can never reclassify recoverable files as "unavailable".
 * The PNG -> webp conversion step is held to the same rule: cwebp missing
 * from PATH, or failing/producing invalid output on a validated PNG, is a
 * tool/environment problem — it hard-fails the run, it is never logged as
 * "unavailable".
 * One deliberate exception: a 4xx on the manifest URL itself warns and
 * disables the PNG fallback for the run (the manifest being deliberately
 * removed is a content change, not an outage).
 *
 * Fallback 1 — droidtrakr's own image manifest (PNG-only tier arts, 19 files):
 *   droidtrakr's frontend does not derive asset paths from normName; it uses
 *   https://droidtrakr.com/droid-images.js (`window.DROID_IMAGES`, keyed
 *   `"{NAME}:{Tier}"`). For 19 higher-tier arts the manifest points at `.png`
 *   paths that do NOT follow the normName convention — original casing,
 *   literal spaces, hyphens (e.g. `SNOW MOUSE_Diamond.png`,
 *   `Loadlifter_Diamond.png`, `RIC-1200_Beskar.png`, `DRFT-R_Diamond.png`).
 *   This fallback looks the droid up in that manifest (keys matched through
 *   normName), fetches the PNG from REMOTE + the manifest path's basename
 *   (URL-encoded), and converts it with `cwebp -q 90` (native dimensions
 *   preserved; no upscaling). Manifest entries already ending in `.webp` are
 *   ignored — those are the normName paths the primary fetch already tried.
 *
 * Fallback 2 — droidex (https://github.com/erikpeik/droidex), no LICENSE:
 *   The droidex GitHub repo at a pinned commit stores PNGs under
 *   public/droids/ named `{NAME}_{TIER}.png` where NAME is the droid name
 *   upper-cased with spaces -> "_" and hyphens kept (e.g. "IG-11 MARSHAL" ->
 *   "IG-11_MARSHAL"), TIER upper-cased. A hit is downloaded and converted the
 *   same way (`cwebp -q 90`, native 195x178). droidex covers only LO's
 *   Gold/Diamond/Rainbow of our gaps.
 *
 * After both fallbacks, 25 files remain genuinely unavailable anywhere public:
 * R2-D2 x5 (droidtrakr serves UnknownBlueprint for it) plus the Mythics'
 * (BB8 / MISTER BONES / IG-11 MARSHAL / DJ-R3X / CB-23) Gold/Diamond/Rainbow/
 * Beskar. Those stay graceful gaps: DroidImg degrades to the text name.
 * Provenance is fully reconstructible from this file: the manifest URL, the
 * droidex repo + DROIDEX_SHA, the name remap rules, and the cwebp command.
 *
 * Idempotent: files already on disk are skipped without any network call, so a
 * re-run against the committed set exits 0 and re-downloads nothing. cwebp is
 * only invoked when a fallback file is missing locally, so the committed-set
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
const MANIFEST_URL = 'https://droidtrakr.com/droid-images.js';
const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar'];

// droidex fallback (see header). Pinned commit so the pull is reproducible.
const DROIDEX_SHA = '4e159c2026dec6e84f43d8eabe04c4b542d3fc85';
const DROIDEX_RAW = `https://raw.githubusercontent.com/erikpeik/droidex/${DROIDEX_SHA}/public/droids/`;

// Network error / 5xx / corrupt source — must abort the run with exit 1,
// unlike a genuine not-found (which is a logged skip).
class HardFail extends Error {}

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

// Fetch a fallback URL, classifying failures per the exit-code policy:
// network error or 5xx -> HardFail; 4xx -> null (genuine miss); ok -> body.
async function fetchOrHardFail(url, label) {
	let res;
	try {
		res = await fetch(url);
	} catch (e) {
		throw new HardFail(`${label} network: ${e.message}`);
	}
	if (res.status >= 500) throw new HardFail(`${label} HTTP ${res.status}`);
	if (!res.ok) return null;
	return Buffer.from(await res.arrayBuffer());
}

// Is cwebp on PATH? (Only needed to recover fallback files not yet on disk.)
let cwebpOk = null;
const haveCwebp = async () => {
	if (cwebpOk === null) {
		cwebpOk = await execFileP('cwebp', ['-version']).then(() => true, () => false);
	}
	return cwebpOk;
};

// Convert a PNG buffer to a validated webp at `dest`. True on success; throws
// HardFail for any conversion problem (cwebp missing from PATH, non-zero
// exit, or invalid output) — a tool/environment failure, never a logged
// "unavailable" skip (see header policy).
async function pngToWebp(buf, dest, label) {
	if (!(await haveCwebp())) {
		throw new HardFail('cwebp not found on PATH — required to convert PNG sources');
	}
	const tmpPng = path.join(tmpdir(), `droid-art-${process.pid}-${path.basename(dest)}.png`);
	try {
		await writeFile(tmpPng, buf);
		await execFileP('cwebp', ['-q', '90', tmpPng, '-o', dest]);
	} catch (e) {
		await rm(dest, { force: true });
		throw new HardFail(`cwebp failed for ${label}: ${e.message}`);
	} finally {
		await rm(tmpPng, { force: true });
	}
	const out = await readFile(dest);
	if (!isWebp(out)) {
		await rm(dest, { force: true });
		throw new HardFail(`cwebp produced invalid webp for ${label}`);
	}
	return true;
}

// Lazily fetch droidtrakr's manifest, indexed by `normName(name):Tier`.
// Cached across calls: a Map on success; null when disabled by a 4xx on the
// manifest URL; a HardFail (rethrown per file) on network/5xx/unparseable.
let manifestIdx;
async function droidtrakrManifest() {
	if (manifestIdx instanceof HardFail) throw manifestIdx;
	if (manifestIdx !== undefined) return manifestIdx;
	let buf;
	try {
		buf = await fetchOrHardFail(MANIFEST_URL, 'manifest');
	} catch (e) {
		manifestIdx = e;
		throw e;
	}
	if (buf === null) {
		console.warn('  droidtrakr manifest gone (4xx); PNG fallback disabled for this run');
		manifestIdx = null;
		return manifestIdx;
	}
	try {
		const json = buf
			.toString('utf8')
			.replace(/^window\.DROID_IMAGES\s*=\s*/, '')
			.replace(/;?\s*$/, '');
		const idx = new Map();
		for (const [key, p] of Object.entries(JSON.parse(json))) {
			const i = key.indexOf(':');
			idx.set(`${normName(key.slice(0, i))}:${key.slice(i + 1)}`, p);
		}
		manifestIdx = idx;
	} catch (e) {
		manifestIdx = new HardFail(`manifest unparseable: ${e.message}`);
		throw manifestIdx;
	}
	return manifestIdx;
}

// Fallback 1: droidtrakr manifest PNG -> webp at `dest`. True on success,
// false on a genuine miss; throws HardFail on network/5xx or a conversion
// failure (missing/broken cwebp).
async function recoverFromManifestPng(name, tier, dest) {
	const idx = await droidtrakrManifest();
	if (!idx) return false;
	const p = idx.get(`${normName(name)}:${fileTier(tier)}`);
	// .webp entries are the normName paths the primary fetch already tried.
	if (!p || !p.toLowerCase().endsWith('.png')) return false;
	const src = path.posix.basename(p);
	const buf = await fetchOrHardFail(REMOTE + encodeURIComponent(src), `droidtrakr png ${src}`);
	if (buf === null) return false;
	if (!isPng(buf)) return false; // SPA HTML = manifest entry is stale
	return pngToWebp(buf, dest, src);
}

// Fallback 2: droidex PNG -> webp at `dest`. True on success, false on a
// genuine miss (404 = droidex lacks it); throws HardFail on network/5xx or a
// conversion failure (missing/broken cwebp).
async function recoverFromDroidex(name, tier, dest) {
	const src = droidexFile(name, tier);
	const buf = await fetchOrHardFail(DROIDEX_RAW + src, `droidex ${src}`);
	if (buf === null) return false;
	if (!isPng(buf)) return false;
	return pngToWebp(buf, dest, src);
}

const { droids } = JSON.parse(await readFile(SEED, 'utf8'));
await mkdir(OUT, { recursive: true });
const pairs = droids.flatMap((d) => TIERS.map((t) => ({ name: d.name, tier: t })));
console.log(`${droids.length} droids × ${TIERS.length} tiers = ${pairs.length} files`);

let onDisk = 0;
let fromTrakr = 0;
const recoveredPng = [];
const recoveredDroidex = [];
const unavailable = [];
const hardFailed = [];

for (const { name, tier } of pairs) {
	const f = artFile(name, tier);
	const dest = path.join(OUT, f);
	if (await exists(dest)) {
		onDisk++;
		continue;
	}
	// Primary: droidtrakr webp at the normName path.
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
	// Non-webp body (SPA HTML / 4xx) = not at the normName path. Fallbacks:
	try {
		if (await recoverFromManifestPng(name, tier, dest)) {
			recoveredPng.push(f);
		} else if (await recoverFromDroidex(name, tier, dest)) {
			recoveredDroidex.push(f);
		} else {
			unavailable.push(f);
		}
	} catch (e) {
		if (!(e instanceof HardFail)) throw e;
		hardFailed.push(`${f} (${e.message})`);
	}
}

console.log(
	`on disk (skipped) ${onDisk} | droidtrakr webp ${fromTrakr} | droidtrakr png ${recoveredPng.length} | droidex ${recoveredDroidex.length} | unavailable ${unavailable.length}`
);
if (recoveredPng.length) {
	console.log(`converted from droidtrakr manifest PNGs (${recoveredPng.length}):`);
	for (const x of recoveredPng) console.log('  ' + x);
}
if (recoveredDroidex.length) {
	console.log(`recovered from droidex (${recoveredDroidex.length}):`);
	for (const x of recoveredDroidex) console.log('  ' + x);
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
const total = onDisk + fromTrakr + recoveredPng.length + recoveredDroidex.length;
console.log(`present ${total}/${pairs.length} droid art files (${unavailable.length} genuinely unavailable)`);
