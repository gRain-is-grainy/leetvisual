import { expect, openCanvas, openProblem, test, VIEWPORTS } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  for (const { w, h } of VIEWPORTS) {
    test(`canvas open on Two Sum at ${w}x${h} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: theme });
      await openProblem(page, 'two-sum');
      await expect(page.locator('html')).toContainClass(theme);
      const frame = await openCanvas(page);
      await expect(page.locator('iframe[data-leetvisual-frame]')).toHaveAttribute('src', new RegExp(`/panel\\.html#${theme}$`));
      await expect(frame.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(frame.locator('[data-card]')).toHaveCount(2);
      await page.screenshot({ path: `test-results/ui/two-sum-${w}x${h}-${theme}.png` });
    });
  }
}
