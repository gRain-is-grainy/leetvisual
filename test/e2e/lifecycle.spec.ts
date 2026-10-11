import type { Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, test } from './fixtures';
import {
  bySel,
  cardId,
  cardOf,
  caseTag,
  editSlot,
  frameCount,
  hideCanvas,
  nextStep,
  numsOf,
  panelGap,
  slots,
  texts,
  twoSum,
} from './canvas';

type Marked = { lvMarker?: number };
const nextQuestion = (page: Page) => page.locator('a[aria-label="Next Question"]');
const setMarker = (page: Page) => page.evaluate(() => { (window as unknown as Marked).lvMarker = 1; });
const marker = (page: Page) => page.evaluate(() => (window as unknown as Marked).lvMarker);

async function toAddTwoNumbers(page: Page): Promise<void> {
  await expect(nextQuestion(page)).toHaveAttribute('href', /\/problems\/add-two-numbers\/?$/);
  await nextQuestion(page).click();
  await page.waitForURL(/\/problems\/add-two-numbers\//);
}

test('SPA navigation keeps one tab and swaps the board', async ({ page }) => {
  const frame = await twoSum(page);
  await setMarker(page);
  await toAddTwoNumbers(page);
  expect(await marker(page)).toBe(1);
  await expect(page.locator('[data-leetvisual-tab]')).toHaveCount(1);
  await expect(page.locator('iframe[data-leetvisual-frame]')).toHaveCount(1);

  await ensureTestcaseOpen(page);
  await openCanvas(page);
  const pool = cardOf(frame, 'list', 'l1, l2');
  await expect(pool).toHaveCount(1);
  const id = await cardId(pool);
  await expect(slots(frame, id, 'node')).toHaveCount(6);
  await expect(bySel(frame, 'ptr', id, 'l1')).toBeVisible();
  await expect(bySel(frame, 'ptr', id, 'l2')).toBeVisible();
  await expect(cardOf(frame, 'array', 'nums')).toHaveCount(0);

  await page.goBack();
  await page.waitForURL(/\/problems\/two-sum\//);
  expect(await marker(page)).toBe(1);
  await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['2', '7', '11', '15']);
});

// Review Focus 3: the navigation starts well inside the 500 ms save debounce.
test('an edit made just before SPA navigation is kept', async ({ page }) => {
  const frame = await twoSum(page);
  await editSlot(frame, bySel(frame, 'val', await cardId(cardOf(frame, 'array', 'nums')), 'item', 0), '5');
  await toAddTwoNumbers(page);
  // Until Add Two Numbers' context arrives, the panel still shows the edited Two Sum draft.
  await expect(cardOf(frame, 'list', 'l1, l2')).toHaveCount(1);
  await page.goBack();
  await page.waitForURL(/\/problems\/two-sum\//);
  await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['5', '7', '11', '15']);
});

test('a removed tab is re-added and the canvas follows a maximized tabset', async ({ page }) => {
  const frame = await twoSum(page);
  await nextStep(frame);

  const tab = page.locator('[data-leetvisual-tab]');
  await page.evaluate(() => document.querySelector('[data-leetvisual-tab]')?.remove());
  await expect(tab).toHaveCount(1);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-leetvisual-divider]')).toHaveCount(1);
  await expect(page.locator('iframe[data-leetvisual-frame]')).toBeVisible();

  // FlexLayout shows its toolbar on hover, so click the maximize button from the page with el.click(), which works for the toolbar button.
  const area = page.locator('.flexlayout__tabset:has(#testcase_tab) > .flexlayout__tabset_content');
  const max = page.locator('[data-layout-path="/c1/ts1/button/max"]');
  for (const title of ['Restore tabset', 'Maximize tabset']) {
    const before = (await area.boundingBox())!.height;
    await max.evaluate((el) => (el as HTMLElement).click());
    await expect(max).toHaveAttribute('title', title);
    await expect.poll(async () => (await area.boundingBox())!.height).not.toBe(before);
    await expect.poll(() => panelGap(page), 'iframe follows the testcase area').toBeLessThanOrEqual(1);
  }

  await expect(page.locator('iframe[data-leetvisual-frame]')).toHaveCount(1);
  expect(await frameCount(frame)).toBe(2);
});

test('switching cases swaps canvases and switching back restores the edit', async ({ page }) => {
  const frame = await twoSum(page);
  await editSlot(frame, bySel(frame, 'val', await cardId(cardOf(frame, 'array', 'nums')), 'item', 0), '5');

  await hideCanvas(page);
  await caseTag(page, 1).click();
  await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['3', '2', '4']);
  await expect(bySel(frame, 'val', await cardId(cardOf(frame, 'var', 'target')), 'var')).toHaveText('6');

  await hideCanvas(page);
  await caseTag(page, 0).click();
  await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['5', '7', '11', '15']);
});

// Review Focus 2, end to end. Plan 2's unit test pins the overlapping-load race itself.
test('clicking cases back to back ends on the last case', async ({ page }) => {
  const frame = await twoSum(page);
  await hideCanvas(page);
  await caseTag(page, 1).click();
  await caseTag(page, 2).click();
  await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['3', '3']);
  await page.waitForTimeout(1500); // a stale Case 2 board must not arrive later
  expect(await numsOf(frame)).toEqual(['3', '3']);
  await expect(bySel(frame, 'val', await cardId(cardOf(frame, 'var', 'target')), 'var')).toHaveText('6');
});

// AGENTS.md §4 "slow or failed loads": only the extension's own metaData request fails; LeetCode's queries go through.
test('a failed metaData request falls back to __NEXT_DATA__, then to shape inference', async ({ page, extErrors }) => {
  await page.route('**/graphql', (route) =>
    route.request().postData()?.includes('{ metaData exampleTestcases isPaidOnly }') ? route.abort('failed') : route.continue(),
  );
  const frame = await twoSum(page);
  expect(await numsOf(frame)).toEqual(['2', '7', '11', '15']);
  await expect(cardOf(frame, 'var', 'target')).toHaveCount(1);

  // __NEXT_DATA__ only describes the first problem loaded, so Add Two Numbers falls back to the inputs' shapes:
  // two arrays named by position (Decision 18) instead of one list pool.
  await toAddTwoNumbers(page);
  await expect(cardOf(frame, 'array', 'arg1')).toHaveCount(1);
  expect(await texts(frame, await cardId(cardOf(frame, 'array', 'arg1')), 'item')).toEqual(['2', '4', '3']);
  expect(await texts(frame, await cardId(cardOf(frame, 'array', 'arg2')), 'item')).toEqual(['5', '6', '4']);

  // The aborted request is this test's doing. Chrome may attribute its net::ERR_FAILED line to content.js.
  const aborted = (e: string) => e.includes('/graphql') && e.includes('ERR_FAILED');
  extErrors.splice(0, extErrors.length, ...extErrors.filter((e) => !aborted(e)));
});

// Decision 21: logged out, Run does not open Test Result, so switch the way LeetCode's own code does.
test('LeetCode switching to Test Result hides the canvas and keeps its state', async ({ page }) => {
  const frame = await twoSum(page);
  await nextStep(frame);
  await nextStep(frame);

  // FlexLayout selects on mousedown then click; a bare click() no longer switches (checked live 2026-10-11).
  // No pointerdown is sent, so the canvas must hide because the selection changed, not because a tab was pressed.
  await page.evaluate(() => {
    const el = document.querySelector('#result_tab') as HTMLElement;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
    }
  });
  await expect(page.locator('iframe[data-leetvisual-frame]')).toBeHidden();
  await expect(page.locator('[data-leetvisual-tab]')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('.flexlayout__tabset[data-leetvisual-active]')).toHaveCount(0);

  await openCanvas(page);
  expect(await frameCount(frame)).toBe(3);
});
