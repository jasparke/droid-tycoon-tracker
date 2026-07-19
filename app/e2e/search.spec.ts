import { test, expect } from '@playwright/test';
import { signInWithProfile } from './support/auth';

test('search popover: hotkeys, arrows, count edit persists', async ({ page }) => {
	await signInWithProfile(page);

	// a droid name guaranteed to exist: first checklist row
	const droid = (await page.locator('.dname').first().textContent())!.trim();

	// Ctrl+K opens; Escape closes; '/' reopens
	await page.keyboard.press('Control+k');
	const dialog = page.getByRole('dialog', { name: 'droid search' });
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await page.keyboard.press('/');
	await expect(dialog).toBeVisible();

	// type, arrow between results, ladder shows steppers
	await dialog.getByPlaceholder('search droid…').fill(droid.slice(0, 3));
	await expect(dialog.locator('.rchip').first()).toBeVisible();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowUp');
	await dialog.getByRole('button', { name: droid, exact: true }).click();

	// + on Base persists to the server
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		dialog.getByRole('button', { name: `${droid} Base plus` }).click()
	]);
	await page.keyboard.press('Escape');

	// reopen after reload: count survived
	await page.reload();
	// wait for hydration (the svelte:window keydown listener) to attach before firing the
	// hotkey — 'load' alone can race the client-side hydrate() on a busier machine
	await page.waitForLoadState('networkidle');
	await page.keyboard.press('Control+k');
	await dialog.getByPlaceholder('search droid…').fill(droid.slice(0, 3));
	await dialog.getByRole('button', { name: droid, exact: true }).click();
	await expect(dialog.getByRole('button', { name: `${droid} Base plus` }).locator('..')).toContainText('1');
});
