import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('E2E — WCAG AA Accessibility Suite (axe-core)', () => {
  const routesToAudit = [
    { name: 'Landing Page', path: '/' },
    { name: 'Try Playground', path: '/try' },
    { name: 'Login Page', path: '/login' },
    { name: 'Observability Page', path: '/observability' },
  ];

  for (const { name, path } of routesToAudit) {
    test(`audits ${name} (${path}) for zero serious or critical WCAG violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('iframe') // Exclude 3rd party embedded frames
        .analyze();

      const severeViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );

      if (severeViolations.length > 0) {
        console.error(
          `Accessibility violations on ${path}:`,
          severeViolations.map((v) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            nodes: v.nodes.length,
          }))
        );
      }

      expect(severeViolations).toEqual([]);
    });
  }
});
