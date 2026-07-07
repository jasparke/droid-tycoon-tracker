import { test, expect, type Page } from '@playwright/test';

async function registerWithProfile(page: Page, user: string) {
	await page.goto('/register');
	await page.getByLabel('Username').fill(user);
	await page.getByLabel('Password').fill('password123');
	await page.getByLabel('Invite code').fill('e2e-invite');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/checklist/);
	await page.request.post('/api/profiles', { data: { name: 'main' } });
	await page.reload();
}

test('search popover: hotkeys, arrows, count edit persists', async ({ page }) => {
	test.skip(true, 'enabled in the checklist rewrite task');

	await registerWithProfile(page, `srch${Date.now()}`);

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
	await page.keyboard.press('Control+k');
	await dialog.getByPlaceholder('search droid…').fill(droid.slice(0, 3));
	await dialog.getByRole('button', { name: droid, exact: true }).click();
	await expect(dialog.getByRole('button', { name: `${droid} Base plus` }).locator('..')).toContainText('1');
});
