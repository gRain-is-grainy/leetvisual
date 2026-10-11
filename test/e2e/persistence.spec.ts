import { ensureTestcaseOpen, expect, openCanvas, test } from './fixtures';
import { bySel, cardId, cardOf, editSlot, frameCount, nextStep, numsOf, twoSum } from './canvas';

type DevPrivate = {
  chrome: {
    developerPrivate: {
      updateProfileConfiguration(update: { inDeveloperMode: boolean }, done: () => void): void;
      reload(id: string, opts: { failQuietly: boolean }, done: () => void): void;
    };
  };
};

test('a canvas with frames persists across a reload', async ({ page }) => {
  let frame = await twoSum(page);
  const nums = await cardId(cardOf(frame, 'array', 'nums'));
  await editSlot(frame, bySel(frame, 'val', nums, 'item', 0), '5');
  await nextStep(frame);
  await editSlot(frame, bySel(frame, 'val', nums, 'item', 1), '8');
  await nextStep(frame);
  await page.waitForTimeout(800); // outlast the 500 ms debounce, so the debounced save is what persists

  await page.reload();
  await ensureTestcaseOpen(page);
  frame = await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['5', '8', '11', '15']);
  expect(await frameCount(frame)).toBe(3);

  await frame.getByTestId('board').focus();
  await page.keyboard.press('[');
  await expect(frame.getByTestId('frame-label')).toHaveText('Step 2');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(frame.getByTestId('frame-label')).toHaveText('Start');
  expect(await numsOf(frame)).toEqual(['2', '7', '11', '15']);
});

// Review Focus 4: the reload starts well inside the 500 ms save debounce.
test('an edit made just before a reload survives', async ({ page }) => {
  let frame = await twoSum(page);
  await editSlot(frame, bySel(frame, 'val', await cardId(cardOf(frame, 'array', 'nums')), 'item', 0), '5');
  await page.reload();
  await ensureTestcaseOpen(page);
  frame = await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['5', '7', '11', '15']);
});

test('two tabs on one problem: the last save wins and is one whole canvas', async ({ page, context }) => {
  const a = await twoSum(page);
  const pageB = await context.newPage();
  const b = await twoSum(pageB);

  await page.bringToFront();
  await editSlot(a, bySel(a, 'val', await cardId(cardOf(a, 'array', 'nums')), 'item', 0), '100');
  await nextStep(a);
  await page.waitForTimeout(800); // let tab A's debounced save land first

  await pageB.bringToFront();
  await editSlot(b, bySel(b, 'val', await cardId(cardOf(b, 'array', 'nums')), 'item', 1), '200');
  await nextStep(b);
  await nextStep(b);
  await pageB.waitForTimeout(800); // let tab B's debounced save land last

  await page.bringToFront();
  await page.reload();
  await ensureTestcaseOpen(page);
  const a2 = await openCanvas(page);
  await expect.poll(() => numsOf(a2)).toEqual(['2', '200', '11', '15']);
  expect(await frameCount(a2)).toBe(3);
});

test('reloading the extension mid-session removes its UI from the page', async ({ page, context }) => {
  const frame = await twoSum(page);
  await nextStep(frame);
  const src = await page.locator('iframe[data-leetvisual-frame]').getAttribute('src');
  const id = new URL(src!).host;

  const admin = await context.newPage();
  await admin.goto('chrome://extensions/');
  // Without Developer mode, Chrome reloads an unpacked extension as disabled (unsupportedDeveloperExtension).
  await admin.evaluate(
    (extId) =>
      new Promise<void>((resolve) => {
        const dev = (globalThis as unknown as DevPrivate).chrome.developerPrivate;
        dev.updateProfileConfiguration({ inDeveloperMode: true }, () =>
          dev.reload(extId, { failQuietly: true }, () => resolve()),
        );
      }),
    id,
  );
  await admin.close();

  await page.bringToFront();
  await page.evaluate(() => document.body.append(document.createElement('div'))); // a mutation wakes the orphaned observer
  for (const hook of [
    '[data-leetvisual-tab]',
    '[data-leetvisual-divider]',
    '[data-leetvisual-float]',
    'iframe[data-leetvisual-frame]',
    'style[data-leetvisual-style]',
    '[data-leetvisual-active]',
  ]) {
    await expect(page.locator(hook)).toHaveCount(0);
  }

  await page.evaluate(() => document.body.append(document.createElement('div')));
  await page.waitForTimeout(500); // the torn-down script must not re-add anything
  await expect(page.locator('[data-leetvisual-tab]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-leetvisual-tab]')).toBeVisible();
});
