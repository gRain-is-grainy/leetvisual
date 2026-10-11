import type { Frame, Page } from '@playwright/test';
import { cardOf } from './canvas';
import { ensureTestcaseOpen, expect, openProblem, test } from './fixtures';
import { highlighted, openTrace, runTrace, setCode, solution, usePython } from './trace';

test.beforeEach(async ({ context }) => usePython(context));

// Clear hover in both documents before a screenshot (each keeps its last hovered element while the pointer is in the other).
async function mouseOff(page: Page, frame: Frame): Promise<void> {
  await frame.getByTestId('board').hover({ position: { x: 5, y: 5 } });
  await page.mouse.move(0, 0);
}

test('traces Two Sum, steps it by keyboard with the editor line following, and clears the line in Canvas mode', async ({ page }) => {
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  await setCode(page, solution('two-sum'));
  const frame = await openTrace(page);
  await expect(frame.getByTestId('trace-empty')).toHaveText('Press Trace to run your code on this test case.');

  await runTrace(frame);
  await expect(frame.getByTestId('trace-step')).toHaveText(/^Step 1 \/ \d+$/);
  await expect(frame.getByTestId('trace-event')).toHaveText('call twoSum');
  await expect(frame.getByTestId('trace-line')).toHaveText('2  def twoSum(self, nums: list[int], target: int) -> list[int]:');
  await expect.poll(() => highlighted(page)).toEqual({ line: 2, err: false });
  // Read-only: the card's edit controls are hidden, not just disabled.
  await expect(cardOf(frame, 'array', 'nums').locator('.lv-ctrl').first()).toBeHidden();
  await expect(cardOf(frame, 'array', 'nums').locator('.lv-x')).toBeHidden();

  await frame.getByTestId('board').focus();
  await page.keyboard.press(']');
  await expect(frame.getByTestId('trace-step')).toHaveText(/^Step 2 \//);
  await expect.poll(() => highlighted(page)).toEqual({ line: 3, err: false });
  await page.keyboard.press('End');
  await expect(frame.getByTestId('trace-end')).toHaveText('Returned [0, 1]');
  await expect(cardOf(frame, 'array', 'return')).toBeVisible();
  await expect(cardOf(frame, 'array', 'nums').locator('.lv-ptr', { hasText: /^i$/ })).toBeVisible();
  await expect.poll(() => highlighted(page)).toEqual({ line: 6, err: false });

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(frame.locator('html')).toHaveAttribute('data-theme', theme);
    await frame.getByTestId('fit').click();
    await mouseOff(page, frame);
    await page.screenshot({ path: `test-results/ui/trace-smoke-1280x720-${theme}.png` });
  }

  await frame.getByTestId('mode-canvas').click();
  await expect.poll(() => highlighted(page)).toBeNull();
  await expect(frame.getByTestId('add-menu')).toBeVisible();
});
