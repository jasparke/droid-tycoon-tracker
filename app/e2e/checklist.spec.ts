import { test, expect } from '@playwright/test';
import { signInWithProfile } from './support/auth';

test('chips, verdicts, ladder, hide-done, header controls', async ({ page }) => {
	await signInWithProfile(page);

	const firstRow = page.locator('.row').first();
	const droid = (await firstRow.locator('.dname').textContent())!.trim();
	const reqText = (await firstRow.locator('.req').textContent())!.trim(); // e.g. "GOLD"
	const tierName = reqText[0] + reqText.slice(1).toLowerCase(); // "Gold"
	const chip = firstRow.getByRole('button', { name: `${droid} ${tierName}` });

	// tap chip = +1 → met
	await Promise.all([page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()), chip.click()]);
	await expect(chip).toContainText('1');
	await expect(firstRow.getByTestId('verdict')).toContainText(`✓ ${reqText}`);

	// right-click = −1 → unmet
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		chip.click({ button: 'right' })
	]);
	await expect(chip).toContainText('0');
	await expect(firstRow.getByTestId('verdict')).toContainText('KEEP');

	// ▾ inline ladder: + syncs to the row chip
	await firstRow.getByRole('button', { name: `${droid} ladder` }).click();
	await Promise.all([
		page.waitForResponse((r) => r.url().includes('/counts/') && r.ok()),
		page.getByRole('button', { name: `${droid} ${tierName} plus` }).click()
	]);
	await expect(chip).toContainText('1');

	// hide done hides the now-met row
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: /HIDE DONE/ }).click()
	]);
	await expect(page.locator('.row .dname', { hasText: droid }).first()).toBeHidden();
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: /HIDE DONE/ }).click()
	]);

	// cycle toggle persists via PATCH (await both PATCHes so the stepper wait below can't
	// accidentally match a straggling cycle response)
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: 'CYCLE 2' }).click()
	]);
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: 'CYCLE 1' }).click()
	]);

	// rebirth stepper: +1 removes the RB01 block; persists across reload (debounced PATCH)
	await expect(page.locator('.brb', { hasText: 'RB01' })).toBeVisible();
	await Promise.all([
		page.waitForResponse((r) => /\/api\/profiles\/\d+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()),
		page.getByRole('button', { name: 'rebirth plus' }).click()
	]);
	await expect(page.locator('.brb', { hasText: 'RB01' })).toHaveCount(0);
	await page.reload();
	await expect(page.locator('.brb', { hasText: 'RB01' })).toHaveCount(0);
});

test('read-only profile disables controls', async ({ page }) => {
	await signInWithProfile(page);
	// capture the owner's "<username>/main" label from the profile card (not the whole
	// .pcard — that also concatenates the avatar initial and the caret glyph)
	const owner = (await page.locator('.pname').innerText()).trim();

	// log out via profile menu
	await page.locator('.pcard').click();
	await page.getByRole('button', { name: 'Log out' }).click();
	await expect(page).toHaveURL(/login/);

	// second user selects the owner's profile
	await signInWithProfile(page);
	await page.locator('.pcard').click();
	await page.getByRole('button', { name: new RegExp(owner) }).click();

	await expect(page.getByText('READ-ONLY')).toBeVisible();
	await expect(page.locator('.row button.chip').first()).toBeDisabled();
	await expect(page.getByRole('button', { name: 'rebirth plus' })).toBeDisabled();
});

test('old views render inside the shell', async ({ page }) => {
	await signInWithProfile(page);
	for (const [href, title] of [
		['/planner', 'PLANNER'], ['/inventory', 'INVENTORY'], ['/droids', 'DROIDEX'],
		['/keepers', 'KEEPERS'], ['/roi', 'ROI — PAYBACK TIME']
	] as const) {
		await page.goto(href);
		// target the shell's header h1 specifically — old pages keep their own h1s,
		// and role-name matching is case-insensitive (would double-match)
		await expect(page.locator('header h1')).toHaveText(title);
	}
});
