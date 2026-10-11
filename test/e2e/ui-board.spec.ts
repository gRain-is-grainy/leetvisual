import { ensureTestcaseOpen, openCanvas, openProblem, test, VIEWPORTS } from './fixtures';

for (const { w, h } of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    test(`board UI ${w}x${h} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: theme });
      await openProblem(page, 'two-sum');
      await ensureTestcaseOpen(page);
      const f = await openCanvas(page);
      await f.locator('[data-card="s1"] .lv-slot').first().dblclick();
      await f.getByRole('textbox', { name: 'Edit value' }).fill('5');
      await f.getByRole('textbox', { name: 'Edit value' }).press('Enter');
      await f.locator('[data-card="s1"]').getByRole('button', { name: 'Add pointer' }).click();
      await f.getByTestId('next-step').click();
      await f.getByTestId('prev-frame').click();
      // Clear hover in both documents: each keeps its last hovered element (the ‹ button, the Canvas tab) while the pointer is in the other.
      await f.getByTestId('board').hover({ position: { x: 5, y: 5 } });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `test-results/ui/board-${w}x${h}-${theme}.png` });
    });
  }
}
