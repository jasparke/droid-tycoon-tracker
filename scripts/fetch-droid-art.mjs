/*
 * Fetch + self-host droid tier-art webp into app/static/assets/droids/.
 *
 * Primary source: droidtrakr.com. The real universe is 380 files: 62 non-Iconic
 * droids x 6 tiers + 8 single-tier Iconic droids' Default art. The probe list is
 * built to match it exactly — Iconic droids (seed `rarity === 'Iconic'`) are
 * probed at Base only, since their Gold/Diamond/Rainbow/Beskar/Galactic art was
 * never real (no tier grid, no chip costs). Earlier revisions probed a flat
 * 70 x 6 = 420 grid and discarded the 40 impossible pairs as "harmless skips";
 * they were harmless but noisy, inflating the unavailable list five-fold.
 * Of the 380 real files, 372 are self-hosted here as of the 2026-08-06 probe;
 * the rest need the fallbacks below.
 *
 * IMPORTANT — droidtrakr does not 404 for a missing asset. It 308-redirects to
 * its single-page app, which answers 200 with a `text/html` (`<!doctype html>`)
 * body — 18821 bytes on 2026-08-06, but that figure is incidental and will
 * drift with any SPA rebuild: nothing here keys off it. That HTML body IS
 * droidtrakr's "not found" signal, so this script classifies a response by its
 * *bytes* (magic number, never length), not its status code:
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
 * Fallback 2 — droidtrakr's `Iconic` manifest tier (Iconic droids only):
 *   The manifest carries a seventh tier this script's TIERS does not model,
 *   `"{NAME}:Iconic"`, holding full-size 512x512 webp art for the single-tier
 *   Iconic droids. It is a *fallback*, not a preference: where the normName
 *   Default path resolves (BB8, IG-11 MARSHAL, ...) that art wins, and the
 *   Iconic entry is genuinely different art, not a higher-res twin
 *   (IG11MARSHALL_Iconic.webp is 24786 B vs IG11MARSHAL_Default.webp's 70452 B).
 *   Two names need aliasing because normName cannot reconcile them — droidtrakr
 *   writes "C3PO" (letter O) where the seed has "C-3P0" (zero), and
 *   "IG11MARSHALL" with a doubled L; see MANIFEST_ICONIC_ALIAS.
 *   This tier supplied C3P0_Default.webp and R2D2_Default.webp on 2026-08-06
 *   (33364 B / 37152 B, both 512x512 RGBA, saved byte-identical — no re-encode).
 *   It must be tried *before* droidex, which also carries C-3P0/R2-D2 Default
 *   art but only at ~133x126. Those two files had been stuck at that quality:
 *   the committed C3P0_Default.webp was a cropped film still on black
 *   (133x126, via droidex) and R2D2_Default.webp a screenshot of a game UI card
 *   with "Iconic" burnt into the corner (128x145, via droidex's deployed site).
 *   Neither matched the set's render style; both are now clean transparent
 *   full-body renders. Replacements, not additions — the count stays 372/380.
 *
 * Fallback 3 — droidex (https://github.com/erikpeik/droidex), no LICENSE:
 *   The droidex GitHub repo at a pinned commit stores PNGs under
 *   public/droids/ named `{NAME}_{TIER}.png` where NAME is the droid name
 *   upper-cased with spaces -> "_" and hyphens kept (e.g. "IG-11 MARSHAL" ->
 *   "IG-11_MARSHAL"), TIER upper-cased. A hit is downloaded and converted the
 *   same way (`cwebp -q 90`, native 195x178). droidex covers only LO's
 *   Gold/Diamond/Rainbow of our gaps.
 *
 * After all three fallbacks, a fresh probe on 2026-08-06 (first run 2026-08-04,
 * after adding the Galactic tier and CHOPPER to the roster) confirmed 8 genuine
 * gaps in the 380-file universe: CHOPPER_Default.webp, plus the Galactic-tier
 * art for 7 non-Iconic droids — SNOWMOUSE, RIC, LEP, RIC1200, MOTRAK, TRITEK,
 * KX. The 2026-08-06 sweep widened the search well past droidtrakr and droidex
 * and still found nothing: droidex.web.app, the Droid Tycoon Fandom wiki (full
 * allimages API — its only Chopper asset is an event splash screenshot),
 * tycoon-tools.com, droidex.dubtrackr.win and droid-tycoon.pages.dev. The last
 * three know CHOPPER and the Galactic tier as *stats* but host no droid art at
 * all. Every negative was a genuine upstream not-found; there were no network
 * errors and no 5xx anywhere in that sweep. The gap is upstream content, not a
 * stale pin — droidex is now pinned at its newest ref (aae5aff, 2026-07-21),
 * which adds only ~133x126 C-3P0/R2-D2 PNGs (no better than what we already
 * had) and still has zero GALACTIC files; it has never carried that tier.
 *
 * Do NOT try to synthesise the 7 missing Galactic files by recolouring Beskar.
 * That was measured against the 55 real Beskar/Galactic pairs on 2026-08-06 and
 * rejected. Default/Gold/Diamond/Rainbow share one render; Beskar and Galactic
 * are a separate, later batch (all 55 Galactic files are 500x500, against
 * 512x512 for most of the set). Bbox-aligned they are the same geometry (mean
 * alpha-mask IoU 0.85, median 0.90), so the pairing is sound — but Beskar is
 * achromatic, mean per-pixel saturation 0.063 with channel means within 1-2
 * levels (GONK 193,192,191), while Galactic is 0.533 and retains per-droid
 * accent colours plus an added starfield. A per-pixel function of a greyscale
 * input can only emit a luminance ramp, so it can produce neither the
 * region-varying hue nor the stars. Confirmed numerically: cross-droid variance
 * of the mapped colour conditioned on Beskar luma is 19.76/255 versus 18.40
 * unconditioned — conditioning on the input adds nothing. Leave-one-out RMSE of
 * the best such recolour is 70.94/255 against 82.67 for flooding the silhouette
 * with a single flat purple, and it is *worse* than that flat fill for TRAKR
 * (80.05 vs 75.66). These 7 stay on DroidImg's remote fallback until upstream
 * publishes them.
 *
 * Provenance is fully reconstructible from this file: the manifest URL and its
 * `Iconic` tier, the droidex repo + DROIDEX_SHA, the name remap rules, and the
 * cwebp command.
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
const TIERS = ['Base', 'Gold', 'Diamond', 'Rainbow', 'Beskar', 'Galactic'];
// Iconic droids are single-tier: their only real file is the Base/Default art.
const ICONIC_TIERS = ['Base'];

// droidtrakr's manifest spells two Iconic droids differently from our seed, and
// normName does not reconcile them: an O-for-zero swap, and a doubled L. Keyed
// by normName(seed name) -> normName(droidtrakr name).
const MANIFEST_ICONIC_ALIAS = new Map([
	['C3P0', 'C3PO'], // seed "C-3P0" (zero) vs droidtrakr "C3PO" (letter O)
	['IG11MARSHAL', 'IG11MARSHALL'],
]);

// droidex fallback (see header). Pinned commit so the pull is reproducible.
const DROIDEX_SHA = 'aae5affc05d77017a1797751ddb34bd2ea1bb181';
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
		// Upstream's generator now emits a trailing comma before the closing
		// brace (valid JS object literal, invalid strict JSON) — added
		// alongside the Galactic entries, so strip it before parsing. This
		// assumes no string literal in the manifest itself contains ",}" or ",]"
		// -- true for droidtrakr's asset paths, which are plain filenames/URLs.
		const json = buf
			.toString('utf8')
			.replace(/^window\.DROID_IMAGES\s*=\s*/, '')
			.replace(/;?\s*$/, '')
			.replace(/,(\s*[}\]])/g, '$1');
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

// Fallback 2: droidtrakr's `Iconic` manifest tier -> `dest`. Only meaningful
// for the 8 single-tier Iconic droids (see header). True on success, false on a
// genuine miss; throws HardFail on network/5xx or a conversion failure.
async function recoverFromManifestIconic(name, dest) {
	const idx = await droidtrakrManifest();
	if (!idx) return false;
	const key = normName(name);
	const alias = MANIFEST_ICONIC_ALIAS.get(key);
	const p = idx.get(`${key}:Iconic`) ?? (alias ? idx.get(`${alias}:Iconic`) : undefined);
	if (!p) return false;
	const src = path.posix.basename(p);
	const buf = await fetchOrHardFail(REMOTE + encodeURIComponent(src), `droidtrakr iconic ${src}`);
	if (buf === null) return false;
	// Unlike the PNG fallback this tier is webp-first, so take either encoding.
	if (isWebp(buf)) {
		await writeFile(dest, buf);
		return true;
	}
	if (!isPng(buf)) return false; // SPA HTML = manifest entry is stale
	return pngToWebp(buf, dest, src);
}

// Fallback 3: droidex PNG -> webp at `dest`. True on success, false on a
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
// Only real files are probed: non-Iconic droids have the full tier grid, Iconic
// droids have Default alone. Probing Iconic droids' non-existent Gold/Diamond/
// Rainbow/Beskar/Galactic would add 40 pointless requests and 40 bogus
// "unavailable" lines to the report.
const iconic = (d) => d.rarity === 'Iconic';
const pairs = droids.flatMap((d) =>
	(iconic(d) ? ICONIC_TIERS : TIERS).map((t) => ({ name: d.name, tier: t, iconic: iconic(d) }))
);
const iconicCount = droids.filter(iconic).length;
console.log(
	`${droids.length - iconicCount} droids × ${TIERS.length} tiers + ${iconicCount} Iconic × ${ICONIC_TIERS.length} = ${pairs.length} files`
);

let onDisk = 0;
let fromTrakr = 0;
const recoveredPng = [];
const recoveredIconic = [];
const recoveredDroidex = [];
const unavailable = [];
const hardFailed = [];

for (const { name, tier, iconic: isIconic } of pairs) {
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
		} else if (isIconic && (await recoverFromManifestIconic(name, dest))) {
			// Must precede droidex: droidex also carries C-3P0/R2-D2 Default art,
			// but only at ~133x126 — the Iconic tier serves the real 512x512.
			recoveredIconic.push(f);
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
	`on disk (skipped) ${onDisk} | droidtrakr webp ${fromTrakr} | droidtrakr png ${recoveredPng.length} | droidtrakr iconic ${recoveredIconic.length} | droidex ${recoveredDroidex.length} | unavailable ${unavailable.length}`
);
if (recoveredPng.length) {
	console.log(`converted from droidtrakr manifest PNGs (${recoveredPng.length}):`);
	for (const x of recoveredPng) console.log('  ' + x);
}
if (recoveredIconic.length) {
	console.log(`recovered from droidtrakr's Iconic tier (${recoveredIconic.length}):`);
	for (const x of recoveredIconic) console.log('  ' + x);
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
const total =
	onDisk + fromTrakr + recoveredPng.length + recoveredIconic.length + recoveredDroidex.length;
console.log(`present ${total}/${pairs.length} droid art files (${unavailable.length} genuinely unavailable)`);
