import { expect, type Page } from '@playwright/test';

/** Drive the SSO flow end-to-end; the stub mints a fresh user each call. */
export async function signIn(page: Page): Promise<void> {
	await page.goto('/login');
	// full navigation follows: /api/auth/oidc/start -> stub /authorize -> callback -> /checklist
	await page.getByTestId('sso-login').click();
	await expect(page).toHaveURL(/checklist/);
}

/** Sign in and create a default profile named "main" (mirrors the old registerWithProfile). */
export async function signInWithProfile(page: Page): Promise<void> {
	await signIn(page);
	await page.request.post('/api/profiles', { data: { name: 'main' } });
	await page.reload();
}
