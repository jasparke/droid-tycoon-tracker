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

test('checklist rows show a droid thumbnail with the derived local src', async ({ page }) => {
	await registerWithProfile(page, `art${Date.now()}`);
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
	await registerWithProfile(page, `artfb${Date.now()}`);
	const img = page.locator('.row').first().locator('img.dimg').first();
	await expect(img).toHaveAttribute(
		'src',
		/droidtrakr\.com\/droid-tycoon\/assets\/droids\/.*_Default\.webp$/
	);
});
