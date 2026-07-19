import { describe, it, expect } from 'vitest';
import { normName, fileTier, droidArtFile, droidArtUrl, isSingleTier, SINGLE_TIER_DROIDS } from './art';
import seed from '../../../drizzle/seed-data.json';

describe('normName', () => {
	it('uppercases and strips non-alphanumerics', () => {
		expect(normName('A-LT')).toBe('ALT');
		expect(normName('DRK-1 PROBE')).toBe('DRK1PROBE');
		expect(normName('IMPERIAL PROBE')).toBe('IMPERIALPROBE');
		expect(normName('2BB')).toBe('2BB');
		expect(normName('MOUSE')).toBe('MOUSE');
	});
});

describe('fileTier', () => {
	it('maps Base to Default and keeps every other tier', () => {
		expect(fileTier('Base')).toBe('Default');
		expect(fileTier('Gold')).toBe('Gold');
		expect(fileTier('Beskar')).toBe('Beskar');
	});
});

describe('droidArtFile / droidArtUrl', () => {
	it('builds the filename from name + tier', () => {
		expect(droidArtFile('MOUSE', 'Rainbow')).toBe('MOUSE_Rainbow.webp');
		expect(droidArtFile('A-LT', 'Gold')).toBe('ALT_Gold.webp');
		expect(droidArtFile('DRK-1 PROBE', 'Base')).toBe('DRK1PROBE_Default.webp');
	});
	it('prefixes the static asset path', () => {
		expect(droidArtUrl('CB', 'Base')).toBe('/assets/droids/CB_Default.webp');
	});
});

describe('single-tier (Iconic) art guard', () => {
	it('collapses any requested tier to Default for single-tier droids', () => {
		// Iconics only ever have _Default art — a non-Base tier must not build a
		// phantom filename that was never produced.
		expect(droidArtFile('R2-D2', 'Gold')).toBe('R2D2_Default.webp');
		expect(droidArtFile('BB8', 'Beskar')).toBe('BB8_Default.webp');
		expect(droidArtFile('IG-11 MARSHAL', 'Rainbow')).toBe('IG11MARSHAL_Default.webp');
		expect(droidArtUrl('MISTER BONES', 'Diamond')).toBe('/assets/droids/MISTERBONES_Default.webp');
	});
	it('leaves Base and non-single-tier droids untouched', () => {
		expect(droidArtFile('R2-D2', 'Base')).toBe('R2D2_Default.webp');
		expect(droidArtFile('MOUSE', 'Gold')).toBe('MOUSE_Gold.webp');
		expect(droidArtFile('CYCLO-GRAV', 'Rainbow')).toBe('CYCLOGRAV_Rainbow.webp');
	});
	it('does not misclassify similarly-named tiered droids', () => {
		// R2 (Epic astromech) vs R2-D2 (Iconic); IG (Mythic) vs IG-11 MARSHAL (Iconic).
		expect(isSingleTier('R2-D2')).toBe(true);
		expect(isSingleTier('R2')).toBe(false);
		expect(isSingleTier('IG-11 MARSHAL')).toBe(true);
		expect(isSingleTier('IG')).toBe(false);
	});
	it('stays in sync with the Iconic roster in seed-data.json (drift guard)', () => {
		const iconic = seed.droids
			.filter((d) => d.rarity === 'Iconic')
			.map((d) => normName(d.name))
			.sort();
		expect(Array.from(SINGLE_TIER_DROIDS).sort()).toEqual(iconic);
	});
});
