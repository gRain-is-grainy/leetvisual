import type { Frame, Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, openProblem, test } from './fixtures';

const cell = (f: Frame, i: number) => f.locator(`[data-card="s1"] [data-sel='["val","s1","item",${i}]']`);
const texts = async (f: Frame) => f.locator('[data-card="s1"] .lv-slot').allTextContents();

async function open(page: Page): Promise<Frame> {
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  return openCanvas(page);
}

test('Two Sum: rename, edit, swap, frames, undo and redo, then persist across a reload', async ({ page }) => {
  let f = await open(page);
  await expect(f.locator('[data-card="s1"][data-kind="array"]')).toBeVisible();
  await expect(f.locator('[data-card="s2"][data-kind="var"]')).toBeVisible();
  expect(await texts(f)).toEqual(['2', '7', '11', '15']);

  // A real double-click: Chrome sends it to an element holding pointer capture, which happy-dom can't show.
  await f.locator('[data-card="s1"] [data-testid=card-name]').dblclick();
  await f.getByRole('textbox', { name: 'Rename card' }).fill('arr');
  await f.getByRole('textbox', { name: 'Rename card' }).press('Enter');
  await expect(f.locator('[data-card="s1"] [data-testid=card-name]')).toHaveText('arr');

  await cell(f, 0).dblclick();
  await f.getByRole('textbox', { name: 'Edit value' }).fill('5');
  await f.getByRole('textbox', { name: 'Edit value' }).press('Enter');
  expect(await texts(f)).toEqual(['5', '7', '11', '15']);

  await cell(f, 0).dragTo(cell(f, 1));
  expect(await texts(f)).toEqual(['7', '5', '11', '15']);

  await f.getByTestId('next-step').click();
  await expect(f.getByTestId('frame-label')).toHaveText('Draft');
  await expect(f.getByTestId('scrubber')).toHaveAttribute('max', '2');

  await f.getByTestId('board').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('[');
  await expect(f.getByTestId('frame-label')).toHaveText('Step 1');
  await page.keyboard.press('[');
  await expect(f.getByTestId('frame-label')).toHaveText('Start');
  expect(await texts(f)).toEqual(['2', '7', '11', '15']);
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await expect(f.getByTestId('frame-label')).toHaveText('Draft');

  await page.keyboard.press('Control+z');
  await expect(f.getByTestId('scrubber')).toHaveAttribute('max', '1');
  await page.keyboard.press('Control+y');
  await expect(f.getByTestId('scrubber')).toHaveAttribute('max', '2');

  // Keyboard drag: targets are every accepting [data-drop] in DOM order except the source
  // (the columns of cells 0, 2, 3, then `target`), so the first target is cell 0.
  await cell(f, 1).focus();
  await page.keyboard.press('Space');
  await expect(f.getByTestId('kb-drag')).toContainText('target 1 of 4');
  await expect(f.locator('[data-card="s1"] .lv-col').nth(0)).toHaveClass(/lv-drop-target/);
  await page.keyboard.press('Space');
  expect(await texts(f)).toEqual(['5', '7', '11', '15']);

  await page.waitForTimeout(800); // past the 500 ms save debounce
  await page.reload();
  await page.waitForSelector('#testcase_tab');
  await ensureTestcaseOpen(page);
  f = await openCanvas(page);
  expect(await texts(f)).toEqual(['5', '7', '11', '15']);
  await expect(f.getByTestId('scrubber')).toHaveAttribute('max', '2');
});

test('Two Sum: zoom buttons, Ctrl+wheel and fit', async ({ page }) => {
  const f = await open(page);
  await f.getByTestId('zoom-in').click();
  await expect(f.getByTestId('zoom-level')).toHaveText('125%');
  const box = (await f.getByTestId('board').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // One mouse-wheel notch zooms about one step, so it takes several to reach the 25% limit.
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 100);
  await expect(f.getByTestId('zoom-level')).toHaveText('100%');
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 100);
  await page.keyboard.up('Control');
  await expect(f.getByTestId('zoom-level')).toHaveText('25%');
  await f.getByTestId('fit').click();
  // Fit must change the zoom: a Fit that did nothing would leave 25%, inside the accepted range.
  await expect(f.getByTestId('zoom-level')).not.toHaveText('25%');
  const z = Number((await f.getByTestId('zoom-level').textContent())!.replace('%', ''));
  expect(z).toBeGreaterThan(25);
  expect(z).toBeLessThanOrEqual(100);
  await expect(f.locator('[data-card="s1"]')).toBeInViewport();
  await expect(f.locator('[data-card="s2"]')).toBeInViewport();
});
