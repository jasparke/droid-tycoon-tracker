import { test, expect } from '@playwright/test';

test('register → toggle a count → reload → persisted', async ({ page }) => {
	const user = `smoke${Date.now()}`;
	await page.goto('/register');
	await page.getByLabel('Username').fill(user);
	await page.getByLabel('Password').fill('password123');
	await page.getByLabel('Invite code').fill('e2e-invite');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/checklist/);

	// no profile yet — import-free path: create one via API for skeleton simplicity
	await page.request.post('/api/profiles', { data: { name: 'main' } });
	await page.reload();

	const firstBox = page.getByRole('button', { name: '☐' }).first();
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		firstBox.click()
	]);
	await expect(page.getByRole('button', { name: '☑' }).first()).toBeVisible();

	await page.reload();
	await expect(page.getByRole('button', { name: '☑' }).first()).toBeVisible();
});
