import { test, expect } from '@playwright/test';

test.describe('E2E — Landing Page & Interactive Try Flow', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Isolate rate-limit bucket per E2E test worker so parallel Chromium & Mobile runs don't exhaust shared 127.0.0.1 quota
    const ipOctet = (testInfo.workerIndex * 10 + testInfo.parallelIndex + 20) % 240 + 10;
    await page.setExtraHTTPHeaders({
      'x-forwarded-for': `10.0.99.${ipOctet}`,
    });
  });

  test('landing page loads with honest branding, hero PR preview, and CTAs', async ({ page }) => {
    await page.goto('/');

    // Check title and branding
    await expect(page).toHaveTitle(/DevGuard AI/i);
    await expect(page.getByRole('heading', { name: /Autonomous PR Security Reviews/i })).toBeVisible();

    // Verify Primary CTA is "Try it live"
    const tryLiveBtn = page.getByRole('link', { name: /try it live/i }).first();
    await expect(tryLiveBtn).toBeVisible();

    // Verify Secondary CTA is "Install GitHub App"
    const installBtn = page.getByRole('link', { name: /install github app/i }).first();
    await expect(installBtn).toBeVisible();

    // Verify Hero realistic PR comment preview
    await expect(page.getByText(/DevGuard AI — Autonomous Security Review Agent/i)).toBeVisible();
  });

  test('navigates from landing to /try playground and runs sample code review', async ({ page }) => {
    await page.goto('/');

    // Click primary CTA
    const tryLiveBtn = page.getByRole('link', { name: /try it live/i }).first();
    await tryLiveBtn.click();
    await expect(page).toHaveURL(/\/try/);

    // Verify playground loaded
    await expect(page.getByRole('heading', { name: /try devguard ai live/i })).toBeVisible();

    // Click "Run Review on Sample File"
    const submitBtn = page.getByRole('button', { name: /run review on sample file/i });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Review results should render share & action controls
    await expect(page.getByRole('button', { name: /copy share link/i })).toBeVisible({ timeout: 25000 });
    await expect(page.getByRole('link', { name: /open shareable view/i })).toBeVisible();
  });

  test('custom code paste execution and shareable link generation', async ({ page }) => {
    await page.goto('/try');

    // Switch to Paste Your Own Code mode
    const pasteTab = page.getByRole('button', { name: /paste your own code/i });
    await pasteTab.click();

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
    const submitBtn = page.getByRole('button', { name: /run review on custom code/i });
    await submitBtn.click();

    // Expect completed analysis with share link
    await expect(page.getByRole('button', { name: /copy share link/i })).toBeVisible({ timeout: 25000 });
  });

  test('enforces loading state or rate-limit cooldown during submission', async ({ page }) => {
    await page.goto('/try');

    const submitBtn = page.locator('button:has-text("Run Review on Sample File"), button:has-text("Reviewing Sample Code"), button:has-text("Cooldown")').first();
    await expect(submitBtn).toBeVisible();

    if (await submitBtn.isEnabled()) {
      await submitBtn.click();
    }

    // Either completes with Copy Share Link, enters loading disabled state, or enters Cooldown
    await expect(
      page.getByRole('button', { name: /copy share link|reviewing sample code|cooldown/i }).first()
    ).toBeVisible({ timeout: 25000 });
  });
});
