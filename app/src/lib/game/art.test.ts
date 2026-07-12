import { describe, it, expect } from 'vitest';
import { normName, fileTier, droidArtFile, droidArtUrl } from './art';

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
