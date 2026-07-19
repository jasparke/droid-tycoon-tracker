import { test, expect } from '@playwright/test';
import { signIn } from './support/auth';

test('SSO login: /login button drives the full OIDC flow into the app', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByTestId('sso-login')).toBeVisible();
	await signIn(page);
	await expect(page).toHaveURL(/checklist/);
	// logging in created a session — the profile menu (authed shell) is present
	await expect(page.locator('.pcard')).toBeVisible();
});

test('unauthenticated access to a gated page redirects to /login', async ({ page }) => {
	await page.goto('/checklist');
	await expect(page).toHaveURL(/login/);
	await expect(page.getByTestId('sso-login')).toBeVisible();
});

test('login page surfaces ?error= codes as a readable message', async ({ page }) => {
	await page.goto('/login?error=oidc_exchange');
	await expect(page.getByTestId('login-error')).toBeVisible();
	await expect(page.getByTestId('login-error')).not.toContainText('oidc_exchange'); // words, not codes

	// unknown codes still get a generic message rather than nothing
	await page.goto('/login?error=some_future_code');
	await expect(page.getByTestId('login-error')).toBeVisible();

	// and no error param means no error box
	await page.goto('/login');
	await expect(page.getByTestId('login-error')).toHaveCount(0);
});
