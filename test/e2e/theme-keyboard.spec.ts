import type { Frame, Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, openProblem, panel, test } from './fixtures';
import { bySel, cardId, cardOf, cycleTo, editSlot, focusBeforeCanvasTab, frameCount, key, slots, tabTo, twoSum } from './canvas';

async function ptrIndex(frame: Frame, id: string, name: string): Promise<number> {
  return frame.evaluate(
    ({ id, name }) => {
      const chip = document.querySelector(`[data-sel='${JSON.stringify(['ptr', id, name])}']`)!.getBoundingClientRect();
      const cx = chip.x + chip.width / 2;
      const cells = [...document.querySelectorAll(`[data-sel^='["val","${id}","item",']`)];
      return cells.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return cx >= r.left && cx <= r.right;
      });
    },
    { id, name },
  );
}

test('light and dark switches apply live to the tab and the panel', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const frame = await twoSum(page);
  const card = frame.locator('[data-card]').first();
  const tab = page.locator('[data-leetvisual-tab]');
  const leetSelected = page.locator('.flexlayout__tab_button--selected', { has: page.locator('#testcase_tab') });

  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(tab).toHaveCSS('color', 'rgb(26, 26, 26)');
  await expect(leetSelected).toHaveCSS('color', 'rgba(0, 0, 0, 0.55)');

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 1000 });
  await expect(card).toHaveCSS('background-color', 'rgb(48, 48, 48)', { timeout: 1000 });
  await expect(tab).toHaveCSS('color', 'rgb(245, 245, 245)', { timeout: 1000 });
  await expect(leetSelected).toHaveCSS('color', 'rgba(255, 255, 255, 0.6)', { timeout: 1000 });

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass(/\blight\b/);
  await expect(frame.locator('html')).toHaveAttribute('data-theme', 'light', { timeout: 1000 });
});

// Both tests move focus from the page into the panel (Tab, or openCanvas calling iframe.focus()), which Page.bringToFront breaks (see the page fixture).
test.describe('panel focus from the page', () => {
  test.use({ foreground: false });

  test('keyboard-only Two Sum trace', async ({ page }) => {
    test.setTimeout(120_000);
    await openProblem(page, 'two-sum');
    await ensureTestcaseOpen(page);
    const kb = page.keyboard;
    const redoKey = process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Y';

    await focusBeforeCanvasTab(page);
    await kb.press('Tab');
    await expect(page.locator('[data-leetvisual-tab]')).toBeFocused();
    await kb.press('Enter');
    const iframe = page.locator('iframe[data-leetvisual-frame]');
    await expect(iframe).toBeVisible();
    await expect(iframe).toBeFocused();
    const frame = await panel(page);
    const nums = await cardId(cardOf(frame, 'array', 'nums'));
    const label = frame.getByTestId('frame-label');

    // Pointer i on nums, moved right and back.
    await tabTo(frame, { sel: `[data-card="${nums}"] button[aria-label^="Add pointer"]` });
    await kb.press('Enter');
    await expect(bySel(frame, 'ptr', nums, 'i')).toHaveCount(1);
    expect(await ptrIndex(frame, nums, 'i')).toBe(0);
    await tabTo(frame, { sel: `[data-sel='${key('ptr', nums, 'i')}']` });
    await kb.press('ArrowRight');
    await expect.poll(() => ptrIndex(frame, nums, 'i')).toBe(1);
    await kb.press('ArrowLeft');
    await expect.poll(() => ptrIndex(frame, nums, 'i')).toBe(0);

    // A scratch map from the Add menu.
    await tabTo(frame, { sel: '[data-testid=add-menu]' });
    await kb.press('Enter');
    await tabTo(frame, { sel: 'button', text: 'Map' });
    await kb.press('Enter');
    const mapCard = frame.locator('[data-card][data-kind=map]');
    await expect(mapCard).toHaveCount(1);
    const map = await cardId(mapCard);

    // seen[nums[i]] = i, by Space / arrows / Space, then F2 on the new value.
    const remember = async (i: number, num: string) => {
      const n = await slots(frame, map, 'key').count();
      await tabTo(frame, { sel: `[data-sel='${key('val', nums, 'item', i)}']` });
      await kb.press('Space');
      await cycleTo(frame, key(map, 'add'));
      await kb.press('Space');
      await expect(bySel(frame, 'val', map, 'key', n)).toHaveText(num);
      await tabTo(frame, { sel: `[data-sel='${key('val', map, 'val', n)}']` });
      await kb.press('F2');
      await expect(frame.locator('input.lv-edit')).toBeFocused();
      await kb.type(String(i));
      await kb.press('Enter');
      await expect(bySel(frame, 'val', map, 'val', n)).toHaveText(String(i));
    };

    await remember(0, '2');
    await kb.press('Enter');
    await expect.poll(() => frameCount(frame)).toBe(2);
    await expect(label).toHaveText('Draft');

    await tabTo(frame, { sel: `[data-sel='${key('ptr', nums, 'i')}']` });
    await kb.press('ArrowRight');
    await expect.poll(() => ptrIndex(frame, nums, 'i')).toBe(1);
    await remember(1, '7');
    await kb.press('Enter');
    await expect.poll(() => frameCount(frame)).toBe(3);

    // Scrub back to the start and forward again.
    await kb.press('[');
    await expect(label).toHaveText('Step 2');
    await expect(slots(frame, map, 'key')).toHaveCount(2);
    await kb.press('[');
    await expect(label).toHaveText('Step 1');
    await expect(slots(frame, map, 'key')).toHaveCount(1);
    expect(await ptrIndex(frame, nums, 'i')).toBe(0);
    await kb.press('[');
    await expect(label).toHaveText('Start');
    await expect(mapCard).toHaveCount(0);
    await expect(bySel(frame, 'ptr', nums, 'i')).toHaveCount(0);
    for (let i = 0; i < 3; i++) await kb.press(']');
    await expect(label).toHaveText('Draft');

    // Undo the last Next step, then the value edit; redo both.
    await kb.press('ControlOrMeta+Z');
    await expect.poll(() => frameCount(frame)).toBe(2);
    await expect(slots(frame, map, 'key')).toHaveCount(2);
    await kb.press('ControlOrMeta+Z');
    await expect(bySel(frame, 'val', map, 'val', 1)).toHaveText('');
    await kb.press(redoKey);
    await expect(bySel(frame, 'val', map, 'val', 1)).toHaveText('1');
    await kb.press('ControlOrMeta+Shift+Z');
    await expect.poll(() => frameCount(frame)).toBe(3);
  });

  // Review Focus 5.
  test('keys typed in the code editor never reach the canvas', async ({ page }) => {
    const frame = await twoSum(page);
    const nums = await cardId(cardOf(frame, 'array', 'nums'));
    await editSlot(frame, bySel(frame, 'val', nums, 'item', 0), '5');

    const code = page.locator('.monaco-editor .view-lines').first();
    await code.click();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+Z');
    await page.keyboard.press('[');
    await expect(bySel(frame, 'val', nums, 'item', 0)).toHaveText('5');
    await expect(frame.getByTestId('frame-label')).toHaveText('Draft');
    expect(await frameCount(frame)).toBe(1);

    const before = await code.textContent();
    // Monaco has the page's focus here. A focus() call inside the cross-origin iframe is not known to move it,
    // so focus the panel the way a user can: the Canvas tab (show() is idempotent and focuses the iframe).
    await openCanvas(page);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(bySel(frame, 'val', nums, 'item', 0)).toHaveText('2');
    expect(await code.textContent()).toBe(before);
  });
});
