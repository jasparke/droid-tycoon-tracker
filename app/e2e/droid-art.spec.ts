import { test, expect } from '@playwright/test';
import { signInWithProfile } from './support/auth';

test('checklist rows show a droid thumbnail with the derived local src', async ({ page }) => {
	await signInWithProfile(page);
	const firstRow = page.locator('.row').first();
	const droid = (await firstRow.locator('.dname').textContent())!.trim();
	const norm = droid.toUpperCase().replace(/[^A-Z0-9]/g, '');
	const img = firstRow.locator('img.dimg').first();
	await expect(img).toHaveAttribute('src', new RegExp(`/assets/droids/${norm}_Default\\.webp$`));
});

test('a missing local image falls the src back to the droidtrakr host', async ({ page }) => {
	// abort every droid-art request (local and remote) — proves the onerror wiring
	// swaps the src to the remote host without depending on droidtrakr being reachable.
	await page.route('**/assets/droids/**', (r) => r.abort());
	await signInWithProfile(page);
	const img = page.locator('.row').first().locator('img.dimg').first();
	await expect(img).toHaveAttribute(
		'src',
		/droidtrakr\.com\/droid-tycoon\/assets\/droids\/.*_Default\.webp$/
	);
});
