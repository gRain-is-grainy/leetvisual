import type { Frame, Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, openProblem, test } from './fixtures';
import {
  bySel,
  cardId,
  cardOf,
  caseTag,
  editSlot,
  expectNoOverlap,
  frameCount,
  hideCanvas,
  nextStep,
  numsOf,
  setInputs,
  slots,
  texts,
} from './canvas';

async function seeded(page: Page, slug: string, cards: [kind: string, name: string][]): Promise<Frame> {
  await openProblem(page, slug);
  await ensureTestcaseOpen(page);
  await expect(page.locator('[data-leetvisual-tab]')).toBeVisible();
  const frame = await openCanvas(page);
  await expect(frame.locator('[data-card]')).toHaveCount(cards.length);
  for (const [kind, name] of cards) await expect(cardOf(frame, kind, name)).toHaveCount(1);
  await expectNoOverlap(frame);
  return frame;
}

test('Two Sum seeds an array and a variable', async ({ page }) => {
  const frame = await seeded(page, 'two-sum', [['array', 'nums'], ['var', 'target']]);
  expect(await numsOf(frame)).toEqual(['2', '7', '11', '15']);
  await expect(bySel(frame, 'val', await cardId(cardOf(frame, 'var', 'target')), 'var')).toHaveText('9');
});

test('Longest Substring seeds a string shown as unquoted characters', async ({ page }) => {
  const frame = await seeded(page, 'longest-substring-without-repeating-characters', [['array', 's']]);
  const s = await cardId(cardOf(frame, 'array', 's'));
  expect(await texts(frame, s, 'item')).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'b', 'b']);
});

test('Reverse Linked List seeds a list with a head pointer', async ({ page }) => {
  const frame = await seeded(page, 'reverse-linked-list', [['list', 'head']]);
  const head = await cardId(cardOf(frame, 'list', 'head'));
  await expect(slots(frame, head, 'node')).toHaveCount(5);
  for (let k = 1; k <= 5; k++) await expect(bySel(frame, 'val', head, 'node', `n${k}`)).toHaveText(String(k));
  await expect(bySel(frame, 'ptr', head, 'head')).toBeVisible();
});

test('Merge Two Sorted Lists seeds one shared list pool with two head pointers', async ({ page }) => {
  const frame = await seeded(page, 'merge-two-sorted-lists', [['list', 'list1, list2']]);
  const pool = await cardId(cardOf(frame, 'list', 'list1, list2'));
  await expect(slots(frame, pool, 'node')).toHaveCount(6);
  await expect(bySel(frame, 'ptr', pool, 'list1')).toBeVisible();
  await expect(bySel(frame, 'ptr', pool, 'list2')).toBeVisible();
});

test('Maximum Depth seeds a tree from level order with gaps', async ({ page }) => {
  const frame = await seeded(page, 'maximum-depth-of-binary-tree', [['tree', 'root']]);
  const root = await cardId(cardOf(frame, 'tree', 'root'));
  await expect(slots(frame, root, 'node')).toHaveCount(5);
  for (const [n, v] of [['n1', '3'], ['n2', '9'], ['n3', '20'], ['n4', '15'], ['n5', '7']]) {
    await expect(bySel(frame, 'val', root, 'node', n)).toHaveText(v);
  }
  await expect(bySel(frame, 'ptr', root, 'root')).toBeVisible();
});

test('Number of Islands seeds a grid shown as unquoted characters', async ({ page }) => {
  const frame = await seeded(page, 'number-of-islands', [['grid', 'grid']]);
  const grid = await cardId(cardOf(frame, 'grid', 'grid'));
  expect(await texts(frame, grid, 'cell')).toEqual([
    '1', '1', '1', '1', '0',
    '1', '1', '0', '1', '0',
    '1', '1', '0', '0', '0',
    '0', '0', '0', '0', '0',
  ]);
});

test('LRU Cache seeds method names and ragged arguments', async ({ page }) => {
  const frame = await seeded(page, 'lru-cache', [['array', 'methods'], ['grid', 'args']]);
  const methods = await cardId(cardOf(frame, 'array', 'methods'));
  expect(await texts(frame, methods, 'item')).toEqual([
    '"LRUCache"', '"put"', '"put"', '"get"', '"put"', '"get"', '"put"', '"get"', '"get"', '"get"',
  ]);
  const args = await cardId(cardOf(frame, 'grid', 'args'));
  await expect(bySel(frame, 'val', args, 'cell', 0, 0)).toHaveText('2');
  await expect(bySel(frame, 'val', args, 'cell', 0, 1)).toHaveCount(0);
  await expect(bySel(frame, 'val', args, 'cell', 1, 0)).toHaveText('1');
  await expect(bySel(frame, 'val', args, 'cell', 1, 1)).toHaveText('1');
  await expect(bySel(frame, 'val', args, 'cell', 9, 0)).toHaveText('4');
});

test('a custom test case gets its own canvas and the original comes back', async ({ page }) => {
  const frame = await seeded(page, 'two-sum', [['array', 'nums'], ['var', 'target']]);
  await editSlot(frame, bySel(frame, 'val', await cardId(cardOf(frame, 'array', 'nums')), 'item', 0), '5');
  await nextStep(frame);

  await hideCanvas(page);
  await setInputs(page, ['[1,5,9]', '10']);
  await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['1', '5', '9']);
  await expect(bySel(frame, 'val', await cardId(cardOf(frame, 'var', 'target')), 'var')).toHaveText('10');
  expect(await frameCount(frame)).toBe(1);

  await hideCanvas(page);
  await setInputs(page, ['[2,7,11,15]', '9']);
  await openCanvas(page);
  await expect.poll(() => numsOf(frame)).toEqual(['5', '7', '11', '15']);
  expect(await frameCount(frame)).toBe(2);
});

// Review Focus 1: the iframe is display:none here, so every card measures 0×0 while the new board renders.
test('a board swapped while the canvas is hidden is placed with real sizes', async ({ page }) => {
  const frame = await seeded(page, 'two-sum', [['array', 'nums'], ['var', 'target']]);
  await hideCanvas(page);
  await caseTag(page, 1).click();
  await expect.poll(() => numsOf(frame)).toEqual(['3', '2', '4']);
  await openCanvas(page);
  // Placement runs from the board's ResizeObserver on the iframe's next render, which can come after the parent
  // page sees the iframe as visible. If the observer stays quiet, the cards stay unplaced, stacked at the board's
  // origin, until some unrelated re-render places them much later. The bound keeps that from passing.
  await expect(() => expectNoOverlap(frame)).toPass({ timeout: 5_000 });
});
