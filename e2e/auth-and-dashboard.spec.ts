import { test, expect } from '@playwright/test';

test.describe('E2E — Auth Guards, Protected Pages & Dashboard State', () => {
  test('unauthenticated request to /dashboard redirects to /login with redirect param', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);

    // Verify login page renders correctly
    await expect(page.getByRole('heading', { name: /sign in to devguard ai/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeVisible();
  });

  test('unauthenticated request to /dashboard/runs/test-id redirects to /login with redirect param', async ({ page }) => {
    await page.goto('/dashboard/runs/test-id');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard%2Fruns%2Ftest-id/);
  });

  test('login page contains truthful security guarantees and GitHub OAuth disclaimer', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText(/Zero-trust authenticated access/i)).toBeVisible();
    await expect(page.getByText(/Identity is validated directly against GitHub OAuth/i)).toBeVisible();
  });

  test('login page GitHub OAuth button is visible and enabled', async ({ page }) => {
    await page.goto('/login');
    const githubBtn = page.getByRole('button', { name: /continue with github/i });
    await expect(githubBtn).toBeVisible();
    await expect(githubBtn).toBeEnabled();
  });
});
