import { ensureTestcaseOpen, expect, openCanvas, openProblem, test } from './fixtures';
import { bySel, expectNoOverlap, hideCanvas, texts } from './canvas';
import {
  card,
  chipAt,
  endText,
  goStep,
  highlighted,
  lastStep,
  openTrace,
  setCode,
  solution,
  stepInfo,
  stepUntil,
  traceWith,
  tracedProblem,
  usePython,
} from './trace';

const chipSel = (cardId: string, name: string) => `[data-sel='${JSON.stringify(['ptr', cardId, name])}']`;

test('Two Sum: an array with a cursor, a variable, a map and the returned array', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  const step = frame.getByTestId('trace-step');
  await expect(step).toHaveText(/^Step 1 \/ \d+$/);
  expect((await stepInfo(frame)).n).toBeGreaterThanOrEqual(5);
  await expect(frame.getByTestId('trace-event')).toHaveText('call twoSum');
  await expect(frame.getByTestId('trace-line')).toHaveText(/^2\s*def twoSum\(self, nums: list\[int\], target: int\) -> list\[int\]:$/);

  await expect(card(frame, 'nums')).toHaveAttribute('data-kind', 'array');
  expect(await texts(frame, 't:nums', 'item')).toEqual(['2', '7', '11', '15']);
  await expect(card(frame, 'target')).toHaveAttribute('data-kind', 'var');
  await expect(bySel(frame, 'val', 't:target', 'var')).toHaveText('9');
  await expect(card(frame, 'self')).toHaveCount(0);
  await expect(card(frame, 'seen')).toHaveCount(0); // not bound yet

  // The first step where i is bound: a cursor on nums at index 0, and no card for i itself.
  await stepUntil(frame, `[data-card="t:nums"] .lv-col ${chipSel('t:nums', 'i')}`);
  expect(await chipAt(frame, 't:nums', 'i')).toMatchObject({ idx: '0', text: '2' });
  await expect(card(frame, 'i')).toHaveCount(0);
  await expect(card(frame, 'seen')).toHaveAttribute('data-kind', 'map');
  await expect(card(frame, 'n')).toHaveAttribute('data-kind', 'var');

  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned [0, 1]');
  await expect(frame.getByTestId('trace-event')).toHaveText('return [0, 1]');
  await expect(card(frame, '#return')).toHaveAttribute('data-kind', 'array');
  expect(await texts(frame, 't:#return', 'item')).toEqual(['0', '1']);
  expect(await chipAt(frame, 't:nums', 'i')).toMatchObject({ idx: '1', text: '7' });
  expect(await texts(frame, 't:seen', 'key')).toEqual(['2']);
  expect(await texts(frame, 't:seen', 'val')).toEqual(['0']);
});

test('Longest Substring: a character array with two cursors and a set', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'longest-substring-without-repeating-characters', 'longest-substring');
  await expect(card(frame, 's')).toHaveAttribute('data-kind', 'array');
  expect(await texts(frame, 't:s', 'item')).toEqual(['a', 'b', 'c', 'a', 'b', 'c', 'b', 'b']);

  await stepUntil(frame, `[data-card="t:s"] .lv-col ${chipSel('t:s', 'right')}`);
  expect(await chipAt(frame, 't:s', 'left')).toMatchObject({ idx: '0' });
  expect(await chipAt(frame, 't:s', 'right')).toMatchObject({ idx: '0' });
  await expect(card(frame, 'left')).toHaveCount(0);
  await expect(card(frame, 'right')).toHaveCount(0);
  await expect(card(frame, 'seen')).toHaveAttribute('data-kind', 'set');
  await expect(card(frame, 'best')).toHaveAttribute('data-kind', 'var');

  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned 3');
  await expect(bySel(frame, 'val', 't:#return', 'var')).toHaveText('3');
});

test('Reverse Linked List: one list pool, pointers instead of cards, and a return pointer', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'reverse-linked-list', 'reverse-linked-list');
  const pool = card(frame, '#list');
  await expect(pool).toHaveAttribute('data-kind', 'list');
  await expect(pool.getByTestId('card-name')).toHaveText('head');
  expect(await chipAt(frame, 't:#list', 'head')).toMatchObject({ text: '1' });

  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned ListNode(5)');
  expect((await texts(frame, 't:#list', 'node')).sort()).toEqual(['1', '2', '3', '4', '5']);
  expect(await chipAt(frame, 't:#list', 'return')).toMatchObject({ text: '5' });
  expect(await chipAt(frame, 't:#list', 'prev')).toMatchObject({ text: '5' });
  expect(await chipAt(frame, 't:#list', 'head')).toMatchObject({ text: '1' });
  expect(await chipAt(frame, 't:#list', 'curr')).toEqual({ aside: 'curr: null' });
  for (const name of ['head', 'prev', 'curr', 'nxt']) await expect(card(frame, name)).toHaveCount(0);
  await expect(card(frame, '#return')).toHaveCount(0);
});

test('Merge Two Sorted Lists: a pool named after both lists, with the dummy node', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'merge-two-sorted-lists', 'merge-two-sorted-lists');
  const pool = card(frame, '#list');
  await expect(pool.getByTestId('card-name')).toHaveText('list1, list2');
  expect(await chipAt(frame, 't:#list', 'list1')).toMatchObject({ text: '1' });
  expect(await chipAt(frame, 't:#list', 'list2')).toMatchObject({ text: '1' });

  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned ListNode(1)');
  expect((await texts(frame, 't:#list', 'node')).sort()).toEqual(['0', '1', '1', '2', '3', '4', '4']);
  expect(await chipAt(frame, 't:#list', 'dummy')).toMatchObject({ text: '0' });
  expect(await chipAt(frame, 't:#list', 'return')).toMatchObject({ text: '1' });
  expect(await chipAt(frame, 't:#list', 'list1')).toEqual({ aside: 'list1: null' });
});

test('Maximum Depth: a tree pool, a call stack card and a null pointer in a leaf call', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'maximum-depth-of-binary-tree', 'maximum-depth');
  const pool = card(frame, '#tree');
  await expect(pool).toHaveAttribute('data-kind', 'tree');
  await expect(pool.getByTestId('card-name')).toHaveText('root');
  expect((await texts(frame, 't:#tree', 'node')).sort()).toEqual(['15', '20', '3', '7', '9']);
  expect(await chipAt(frame, 't:#tree', 'root')).toMatchObject({ text: '3' });
  // The trace reaches depth 2, so the call stack card is there from the first step.
  await expect(card(frame, '#calls')).toHaveAttribute('data-kind', 'calls');
  await expect(card(frame, '#calls').locator('.lv-frame')).toHaveCount(1);

  await stepUntil(frame, '[data-card="t:#calls"] .lv-frame ~ .lv-frame ~ .lv-frame ~ .lv-frame');
  await goStep(frame, 0);
  await stepUntil(frame, '[data-card="t:#tree"] .lv-nullptr', /^root: null$/);

  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned 3');
  await expect(bySel(frame, 'val', 't:#return', 'var')).toHaveText('3');
  await expect(card(frame, '#calls').locator('.lv-frame')).toHaveCount(1);
});

test('Number of Islands: a grid with an r,c cursor, closure variables and an off-grid cursor', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'number-of-islands', 'number-of-islands');
  await expect(card(frame, 'grid')).toHaveAttribute('data-kind', 'grid');
  expect(await texts(frame, 't:grid', 'cell')).toHaveLength(20);

  await stepUntil(frame, `[data-card="t:grid"] .lv-grid-cell ${chipSel('t:grid', 'r,c')}`);
  expect(await chipAt(frame, 't:grid', 'r,c')).toMatchObject({ cell: [0, 0] });
  await expect(card(frame, 'r')).toHaveCount(0);
  await expect(card(frame, 'c')).toHaveCount(0);
  await expect(card(frame, 'dfs')).toHaveCount(0); // a function: hidden
  await expect(card(frame, '#calls')).toHaveCount(1);

  // Inside dfs, the free variables it closes over (rows, cols, grid) are cards too (PEP 667); count is not one of them.
  await stepUntil(frame, '[data-card="t:#calls"] .lv-frame ~ .lv-frame');
  await expect(card(frame, 'rows')).toHaveAttribute('data-kind', 'var');
  await expect(card(frame, 'cols')).toHaveAttribute('data-kind', 'var');
  await expect(card(frame, 'grid')).toHaveAttribute('data-kind', 'grid');
  await expect(card(frame, 'count')).toHaveCount(0);

  // dfs(r - 1, c) from the top row: a cursor outside the grid is listed beside it (index Decision 11).
  await stepUntil(frame, '[data-card="t:grid"] .lv-nullptr', /^r,c: \[-1, \d+\]$/);

  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned 1');
  expect(new Set(await texts(frame, 't:grid', 'cell'))).toEqual(new Set(['0']));
});

test('LRU Cache: self attributes as cards and an output card filled call by call', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'lru-cache', 'lru-cache');
  await expect(card(frame, '#output')).toHaveAttribute('data-kind', 'array');
  expect(await texts(frame, 't:#output', 'item')).toEqual([]);
  await expect(card(frame, 'capacity')).toHaveAttribute('data-kind', 'var');
  await expect(card(frame, 'self')).toHaveCount(0);

  await stepUntil(frame, '[data-card="t:self.cache"]');
  await expect(card(frame, 'self.cache')).toHaveAttribute('data-kind', 'map');

  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Finished');
  await expect(card(frame, '#return')).toHaveCount(0);
  await expect(bySel(frame, 'val', 't:self.cap', 'var')).toHaveText('2');
  expect(await texts(frame, 't:self.cache', 'key')).toEqual(['3', '4']);
  expect(await texts(frame, 't:self.cache', 'val')).toEqual(['3', '4']);
  expect(await texts(frame, 't:#output', 'item')).toEqual(['None', 'None', 'None', '1', 'None', '-1', 'None', '-1', '3', '4']);
});

test('a custom test case is the one that is traced', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum', ['[5,1,9,4]', '13']);
  expect(await texts(frame, 't:nums', 'item')).toEqual(['5', '1', '9', '4']);
  await expect(bySel(frame, 'val', 't:target', 'var')).toHaveText('13');
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned [2, 3]');
});

// Review Focus 2: the iframe is display:none when the outcome arrives, so every card measures 0×0 while it renders.
test('a trace that finishes while the canvas is hidden is placed with real sizes', async ({ page, context }) => {
  await usePython(context);
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  await setCode(page, solution('two-sum'));
  const frame = await openTrace(page);
  // Hide first, then start the run inside the hidden iframe (a programmatic click works under display:none),
  // so the outcome always lands while hidden instead of racing Python's startup.
  await hideCanvas(page);
  await traceWith(frame, () =>
    frame.evaluate(() => document.querySelector<HTMLButtonElement>('[data-testid=trace-run]')!.click()),
  );
  await expect(page.locator('iframe[data-leetvisual-frame]')).toBeHidden();

  await openCanvas(page);
  await expect(frame.getByTestId('trace-step')).toHaveText(/^Step 1 \/ \d+$/);
  // Placement runs from the board's ResizeObserver on the iframe's next render, after the page sees it visible.
  await expect(() => expectNoOverlap(frame)).toPass({ timeout: 5000 });
  await expect(frame.locator('[data-card]')).toHaveCount(2);
  await expect.poll(() => highlighted(page)).toEqual({ line: 2, err: false });
});
