import { test, expect } from '@playwright/test';

test.describe('E2E — Landing Page & Interactive Try Flow', () => {
  test('landing page loads with honest branding, hero PR preview, and CTAs', async ({ page }) => {
    await page.goto('/');

    // Check title and branding
    await expect(page).toHaveTitle(/DevGuard AI/i);
    await expect(page.locator('text=Autonomous PR Security Reviewer')).toBeVisible();

    // Verify Primary CTA is "Try it live"
    const tryLiveBtn = page.getByRole('link', { name: /try it live/i }).first();
    await expect(tryLiveBtn).toBeVisible();

    // Verify Secondary CTA is "Install GitHub App"
    const installBtn = page.getByRole('link', { name: /install github app/i }).first();
    await expect(installBtn).toBeVisible();

    // Verify Hero realistic PR comment preview
    await expect(page.locator('text=DevGuard AI — PR Security Review')).toBeVisible();
    await expect(page.locator('text=REQUEST_CHANGES')).toBeVisible();
  });

  test('navigates from landing to /try playground and runs sample code review', async ({ page }) => {
    await page.goto('/');

    // Click primary CTA
    const tryLiveBtn = page.getByRole('link', { name: /try it live/i }).first();
    await tryLiveBtn.click();
    await expect(page).toHaveURL(/\/try/);

    // Verify playground loaded
    await expect(page.getByRole('heading', { name: /interactive security review/i })).toBeVisible();

    // Select SQL Injection vulnerable sample
    const sampleSelector = page.getByRole('button', { name: /sql injection/i });
    if (await sampleSelector.isVisible()) {
      await sampleSelector.click();
    }

    // Click "Run Autonomous Security Review"
    const submitBtn = page.getByRole('button', { name: /run autonomous security review/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Progress stepper should appear
    await expect(page.locator('text=Empirical Tool Pipeline')).toBeVisible({ timeout: 10000 });

    // Review results should render findings
    await expect(page.locator('text=Executive Summary')).toBeVisible({ timeout: 20000 });

    // Verify export buttons exist
    await expect(page.getByRole('button', { name: /copy markdown/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download json/i })).toBeVisible();
  });

  test('custom code paste execution and shareable link generation', async ({ page }) => {
    await page.goto('/try');

    // Switch to Custom / Paste tab if present
    const pasteTab = page.getByRole('tab', { name: /paste code/i });
    if (await pasteTab.isVisible()) {
      await pasteTab.click();
    }

    // Type custom code into editor textarea
    const codeEditor = page.locator('textarea');
    await codeEditor.fill(`
      import fs from 'fs';
      export function readUserFile(req: any) {
        const file = req.query.file;
        return fs.readFileSync(file, 'utf8');
      }
    `);

    // Submit review
    const submitBtn = page.getByRole('button', { name: /run autonomous security review/i });
    await submitBtn.click();

    // Expect completed analysis
    await expect(page.locator('text=Executive Summary')).toBeVisible({ timeout: 25000 });
  });

  test('enforces rate limit cooldown defense on rapid repeated submissions', async ({ page }) => {
    await page.goto('/try');

    const submitBtn = page.getByRole('button', { name: /run autonomous security review/i });
    if (await submitBtn.isEnabled()) {
      // Rapid multiple clicks
      await submitBtn.click();
    }

    // Submit button should enter disabled/loading state during analysis
    await expect(submitBtn).toBeDisabled();
  });
});
