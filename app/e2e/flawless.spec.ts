import { test, expect } from '@playwright/test';
import { signInWithProfile } from './support/auth';

test('droidex flawless toggle persists and moves the x/62 metric', async ({ page }) => {
	await signInWithProfile(page);
	await page.goto('/droids');

	const metric = page.getByTestId('flawless-metric');
	await expect(metric).toHaveText('0/62');

	const toggle = page.locator('button.flawless').first();
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/flawless/') && r.request().method() === 'PUT' && r.ok()),
		toggle.click()
	]);
	await expect(metric).toHaveText('1/62');
	await expect(toggle).toHaveAttribute('aria-pressed', 'true');

	await page.reload();
	await expect(page.getByTestId('flawless-metric')).toHaveText('1/62');

	// toggling off returns to zero
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/flawless/') && r.ok()),
		page.locator('button.flawless').first().click()
	]);
	await expect(page.getByTestId('flawless-metric')).toHaveText('0/62');
});

test('iconic droids have no flawless toggle', async ({ page }) => {
	await signInWithProfile(page);
	await page.goto('/droids');
	const chopperRow = page.locator('tr', { hasText: 'CHOPPER' }).first();
	await expect(chopperRow.locator('button.flawless')).toHaveCount(0);
	await expect(chopperRow.locator('span.na')).toHaveCount(1);
});
