import { test, expect } from '@playwright/test';
import { signInWithProfile } from './support/auth';

test('planner shows base craft times and a per-cycle total', async ({ page }) => {
	await signInWithProfile(page);
	await page.goto('/planner');

	// nothing planned yet
	await expect(page.getByTestId('craft-total')).toHaveText('0:00:00');

	// select the first rebirth → needs appear with per-row craft times
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/plans/') && r.request().method() === 'PUT' && r.ok()),
		page.locator('label input[type=checkbox]').first().check()
	]);
	const firstNeed = page.locator('li .craft').first();
	await expect(firstNeed).toHaveText(/^\d+:[0-5]\d:[0-5]\d$/);
	await expect(page.getByTestId('craft-total')).toHaveText(/^\d+:[0-5]\d:[0-5]\d$/);
	await expect(page.getByTestId('craft-total')).not.toHaveText('0:00:00');
});
