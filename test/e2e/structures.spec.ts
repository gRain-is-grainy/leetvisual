import { expect, test } from './fixtures';
import { addFromMenu, addItems, bySel, center, drag, emptySpot, open } from './views';

test('Reverse Linked List: dropping a next handle on empty space sets it to null', async ({ page }) => {
  const frame = await open(page, 'reverse-linked-list');
  const list = frame.locator('[data-kind=list]');
  await expect(list).toHaveCount(1);
  await expect(list.locator('path.lv-arrow')).toHaveCount(4);
  const handle = bySel(frame, { t: 'link', s: 's1', n: 'n1', side: 'next' });
  await expect(handle).toHaveClass(/lv-handle-set/);
  await drag(page, handle, await emptySpot(frame));
  await expect(list.locator('path.lv-arrow')).toHaveCount(3);
  await expect(handle).not.toHaveClass(/lv-handle-set/);
});

test("Reverse Linked List: dropping the tail's next on another node's handle links to that node", async ({ page }) => {
  const frame = await open(page, 'reverse-linked-list');
  const list = frame.locator('[data-kind=list]');
  const target = bySel(frame, { t: 'link', s: 's1', n: 'n2', side: 'next' });
  await drag(page, bySel(frame, { t: 'link', s: 's1', n: 'n5', side: 'next' }), await center(target));
  await expect(list.locator('path.lv-arrow-back')).toHaveCount(1);
  await expect(list.locator('path.lv-arrow')).toHaveCount(5);
});

test('Two Sum: Build as list from the card menu turns nums into a linked list', async ({ page }) => {
  const frame = await open(page, 'two-sum');
  await frame.getByRole('button', { name: 'nums menu', exact: true }).click();
  await frame.getByRole('menuitem', { name: 'Build as list', exact: true }).click();
  const list = frame.locator('[data-kind=list]');
  await expect(list).toHaveCount(1);
  await expect(list.locator('path.lv-arrow')).toHaveCount(3);
  await expect(bySel(frame, { t: 'ptr', s: 's1', name: 'nums' })).toBeVisible();
});

test('Merge Two Sorted Lists: both inputs share one list card with a pointer each', async ({ page }) => {
  const frame = await open(page, 'merge-two-sorted-lists');
  await expect(frame.locator('[data-kind=list]')).toHaveCount(1);
  await expect(bySel(frame, { t: 'ptr', s: 's1', name: 'list1' })).toBeVisible();
  await expect(bySel(frame, { t: 'ptr', s: 's1', name: 'list2' })).toBeVisible();
});

test('Maximum Depth of Binary Tree: the input is one tree card with its edges', async ({ page }) => {
  const frame = await open(page, 'maximum-depth-of-binary-tree');
  const tree = frame.locator('[data-kind=tree]');
  await expect(tree).toHaveCount(1);
  await expect(tree.locator('path.lv-edge')).toHaveCount(4);
});

test('Number of Islands: grid cells show unquoted and a click marks a cell', async ({ page }) => {
  const frame = await open(page, 'number-of-islands');
  const cell = bySel(frame, { t: 'val', at: { s: 's1', k: 'cell', r: 0, c: 0 } });
  await expect(cell).toHaveText('1');
  await cell.click();
  await expect(cell).toHaveClass(/lv-marked/);
});

test('LRU Cache: a methods array and an args grid', async ({ page }) => {
  const frame = await open(page, 'lru-cache');
  await expect(frame.locator('[data-kind=array] [data-testid=card-name]')).toHaveText('methods');
  await expect(frame.locator('[data-kind=grid] [data-testid=card-name]')).toHaveText('args');
});

test('Add menu: a stack can be pushed and popped by dragging the top off', async ({ page }) => {
  const frame = await open(page, 'two-sum');
  await addFromMenu(frame, 'Stack');
  const stack = frame.locator('[data-kind=stack]');
  await expect(stack).toHaveCount(1);
  await frame.getByTestId('fit').click();
  await addItems(stack, 'Push', ['7', '8']);
  await expect(stack.locator('.lv-bag-items .lv-slot')).toHaveText(['8', '7']);
  await drag(page, stack.locator('.lv-bag-items .lv-slot').first(), await emptySpot(frame));
  await expect(stack.locator('.lv-bag-items .lv-slot')).toHaveText(['7']);
});

test('Add menu works by keyboard', async ({ page }) => {
  const frame = await open(page, 'two-sum');
  await frame.getByTestId('add-menu').focus();
  await page.keyboard.press('Enter');
  await expect(frame.getByRole('menuitem', { name: 'Variable', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(frame.getByRole('menuitem', { name: 'Array', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(frame.getByLabel('Length')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  const arrays = frame.locator('[data-kind=array]');
  await expect(arrays).toHaveCount(2);
  await expect(arrays.last().locator('.lv-slot')).toHaveCount(3);
});
