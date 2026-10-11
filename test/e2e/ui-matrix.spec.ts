import type { Frame, Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, openProblem, test, VIEWPORTS } from './fixtures';
import { bySel, cardId, cardOf, editSlot, expectNoOverlap, nextStep, panelGap } from './canvas';

// Clear hover in both documents before a screenshot: each keeps its last hovered element while the pointer is in the other,
// and a hovered board hides the divider.
async function mouseOff(page: Page, frame: Frame): Promise<void> {
  await frame.getByTestId('board').hover({ position: { x: 5, y: 5 } });
  await page.mouse.move(0, 0);
}

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
      await mouseOff(page, frame);
      await page.screenshot({ path: `test-results/ui/two-sum-${w}x${h}-${theme}.png` });
    });
  }
}

type PanelLayout = 'narrow' | 'wide';

async function dragLayoutSplitter(page: Page, path: string, to: { x?: number; y?: number }): Promise<void> {
  const box = await page.locator(`[data-layout-path="${path}"]`).boundingBox();
  if (!box) throw new Error(`splitter ${path} not found`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(to.x ?? cx, to.y ?? cy, { steps: 8 });
  await page.mouse.up();
}

async function applyPanelLayout(page: Page, layout: PanelLayout, w: number, h: number): Promise<void> {
  const area = page.locator('.flexlayout__tabset:has(#testcase_tab) > .flexlayout__tabset_content');
  const size = async () => (await area.boundingBox())!;
  if (layout === 'narrow') {
    await dragLayoutSplitter(page, '/s0', { x: w - 420 });
    await dragLayoutSplitter(page, '/c1/s0', { y: h - 280 });
    await expect.poll(async () => (await size()).width, 'narrow testcase panel').toBeLessThanOrEqual(480);
    await expect.poll(async () => (await size()).height, 'short testcase panel').toBeLessThanOrEqual(320);
  } else {
    await dragLayoutSplitter(page, '/s0', { x: Math.round(w * 0.3) });
    await dragLayoutSplitter(page, '/c1/s0', { y: Math.round(h * 0.3) });
    await expect.poll(async () => (await size()).width, 'wide testcase panel').toBeGreaterThanOrEqual(w * 0.6);
    await expect.poll(async () => (await size()).height, 'tall testcase panel').toBeGreaterThanOrEqual(h * 0.6);
  }
  // Playwright aims a click inside the iframe from where the iframe is now, so a Fit click made while the iframe is
  // still moving to the new testcase area lands beside the button.
  await expect.poll(() => panelGap(page), 'iframe follows the testcase area').toBeLessThanOrEqual(1);
}

async function reachableTestids(frame: Frame): Promise<{ reached: string[]; required: string[] }> {
  const required = await frame.evaluate(() =>
    [...document.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button[data-testid], input[data-testid]')]
      .filter((el) => !el.disabled && el.getClientRects().length > 0)
      .map((el) => el.dataset.testid!),
  );
  const count = await frame.evaluate(() => {
    document.body.tabIndex = -1;
    document.body.focus();
    return [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]')].filter(
      (el) => el !== document.body && el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
    ).length;
  });
  const reached = new Set<string>();
  for (let i = 0; i < count; i++) {
    await frame.page().keyboard.press('Tab');
    const id = await frame.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid ?? '');
    if (id) reached.add(id);
  }
  return { reached: [...reached], required };
}

async function checkPanelFit(page: Page, frame: Frame): Promise<void> {
  // The content script repositions the iframe from a ResizeObserver, so give it a frame or two after a drag.
  await expect.poll(() => panelGap(page), 'iframe follows the testcase area').toBeLessThanOrEqual(1);

  expect(await frame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll').toBe(true);
  const outside = await frame.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid=timeline] button, [data-testid=timeline] input, [data-testid=add-menu], [data-testid=zoom-in], [data-testid=zoom-out], [data-testid=zoom-level], [data-testid=fit]')]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight;
      })
      .map((el) => el.dataset.testid ?? el.tagName),
  );
  expect(outside, 'toolbar and timeline controls are inside the panel').toEqual([]);

  const { reached, required } = await reachableTestids(frame);
  expect(required.filter((id) => !reached.includes(id)), 'every enabled control is keyboard-reachable').toEqual([]);
  // Focusing a card control outside the view scrolls the overflow: hidden board unless the board folds it into its pan.
  const scroll = await frame.getByTestId('board').evaluate((el) => [el.scrollLeft, el.scrollTop]);
  expect(scroll, 'keyboard focus leaves the board unscrolled').toEqual([0, 0]);
  await expectNoOverlap(frame);
}

async function seedFrames(frame: Frame, slug: string): Promise<void> {
  if (slug === 'two-sum') {
    const nums = await cardId(cardOf(frame, 'array', 'nums'));
    await frame.locator(`[data-card="${nums}"] button[aria-label^="Add pointer"]`).click();
    await editSlot(frame, bySel(frame, 'val', nums, 'item', 0), '5');
    await nextStep(frame);
    await editSlot(frame, bySel(frame, 'val', nums, 'item', 1), '8');
    await nextStep(frame);
    await editSlot(frame, bySel(frame, 'val', nums, 'item', 2), '9'); // a draft change, so a highlight shows
  } else {
    const root = await cardId(cardOf(frame, 'tree', 'root'));
    await editSlot(frame, bySel(frame, 'val', root, 'node', 'n1'), '4');
    await nextStep(frame);
    await editSlot(frame, bySel(frame, 'val', root, 'node', 'n2'), '10');
    await nextStep(frame);
    await editSlot(frame, bySel(frame, 'val', root, 'node', 'n3'), '21');
  }
}

for (const { w, h } of VIEWPORTS) {
  for (const slug of ['two-sum', 'maximum-depth-of-binary-tree']) {
    test(`panel layouts for ${slug} at ${w}x${h}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: w, height: h });
      await openProblem(page, slug);
      await ensureTestcaseOpen(page);
      const frame = await openCanvas(page);
      await seedFrames(frame, slug);
      for (const layout of ['narrow', 'wide'] as const) {
        await applyPanelLayout(page, layout, w, h);
        for (const theme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: theme });
          await expect(frame.locator('html')).toHaveAttribute('data-theme', theme);
          await frame.getByTestId('fit').click();
          await checkPanelFit(page, frame);
          await mouseOff(page, frame);
          await page.screenshot({ path: `test-results/ui/${slug}-${layout}-${w}x${h}-${theme}.png` });
        }
      }
    });
  }
}
