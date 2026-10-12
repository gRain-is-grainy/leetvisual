import type { Frame, Page } from '@playwright/test';
import { panelGap } from './canvas';
import { expect } from './fixtures';

export type PanelLayout = 'narrow' | 'wide';

// Clear hover in both documents before a screenshot: each keeps its last hovered element while the pointer is in the other,
// and a hovered board hides the divider.
export async function mouseOff(page: Page, frame: Frame): Promise<void> {
  await frame.getByTestId('board').hover({ position: { x: 5, y: 5 } });
  await page.mouse.move(0, 0);
}

export async function dragLayoutSplitter(page: Page, path: string, to: { x?: number; y?: number }): Promise<void> {
  const box = await page.locator(`[data-layout-path="${path}"]`).boundingBox();
  if (!box) throw new Error(`splitter ${path} not found`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(to.x ?? cx, to.y ?? cy, { steps: 8 });
  await page.mouse.up();
}

export async function applyPanelLayout(page: Page, layout: PanelLayout, w: number, h: number): Promise<void> {
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

export async function reachableTestids(frame: Frame): Promise<{ reached: string[]; required: string[] }> {
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
