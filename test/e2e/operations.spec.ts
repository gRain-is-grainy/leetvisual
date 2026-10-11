import type { Frame, Locator, Page } from '@playwright/test';
import { expect, openCanvas, openProblem, test } from './fixtures';
import { byDrop, bySel, cardId, cardOf, cycleTo, editSlot, frameCount, key, nextStep, slots } from './canvas';

test.describe.configure({ timeout: 120_000 });

type Point = { x: number; y: number };

// New structures land wherever placement finds room, so give the board space and fit it.
async function open(page: Page, slug: string, add: string[] = []): Promise<Frame> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openProblem(page, slug);
  const frame = await openCanvas(page);
  for (const label of add) {
    await frame.getByTestId('add-menu').click();
    await frame.getByRole('menuitem', { name: label, exact: true }).click();
  }
  if (add.length) await frame.getByTestId('fit').click();
  return frame;
}

async function center(l: Locator): Promise<Point> {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function emptySpot(frame: Frame): Promise<Point> {
  const board = (await frame.getByTestId('board').boundingBox())!;
  const boxes = await Promise.all((await frame.locator('[data-card]').all()).map((l) => l.boundingBox()));
  for (let y = board.y + 12; y < board.y + board.height - 12; y += 24) {
    for (let x = board.x + 12; x < board.x + board.width - 12; x += 24) {
      if (boxes.every((b) => !b || x < b.x - 4 || x > b.x + b.width + 4 || y < b.y - 4 || y > b.y + b.height + 4)) return { x, y };
    }
  }
  throw new Error('no empty spot on the board');
}

// The editor a button or F2 just opened: it must have focus (Decision 12), then Enter commits.
async function typeIn(frame: Frame, text: string): Promise<void> {
  const input = frame.locator('input.lv-edit');
  await expect(input).toBeFocused();
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
}

async function kbDrop(frame: Frame, src: Locator, dropKey: string): Promise<void> {
  await src.focus();
  await frame.page().keyboard.press('Space');
  await cycleTo(frame, dropKey);
  await frame.page().keyboard.press('Space');
}

// The pointer chip `name` of structure `s`, inside the element that carries location `at`.
const chipAt = (frame: Frame, s: string, name: string, ...at: (string | number)[]): Locator =>
  byDrop(frame, s, ...at).locator(`[data-sel='${key('ptr', s, name)}']`);

test('array: append, remove last and pointers, by mouse and by keyboard', async ({ page }) => {
  const frame = await open(page, 'two-sum');
  const kb = page.keyboard;
  const nums = await cardId(cardOf(frame, 'array', 'nums'));
  const button = (name: string) => frame.locator(`[data-card="${nums}"]`).getByRole('button', { name, exact: true });
  const chip = (name: string) => bySel(frame, 'ptr', nums, name);

  // Mouse: Append opens the editor on the new cell; Remove last takes it off.
  await button('Append').click();
  await typeIn(frame, '20');
  await expect(slots(frame, nums, 'item')).toHaveText(['2', '7', '11', '15', '20']);
  await button('Remove last').click();
  await expect(slots(frame, nums, 'item')).toHaveText(['2', '7', '11', '15']);

  // Keyboard: Enter on Append; Delete on the last cell (Decision 15).
  await button('Append').focus();
  await kb.press('Enter');
  await typeIn(frame, '30');
  await bySel(frame, 'val', nums, 'item', 4).focus();
  await kb.press('Delete');
  await expect(slots(frame, nums, 'item')).toHaveText(['2', '7', '11', '15']);

  // Mouse: add a pointer, drag it onto a cell, double-click to rename it, drag it off the array for null.
  await button('Add pointer').click();
  await expect(chipAt(frame, nums, 'i', 'item', 0)).toHaveCount(1);
  await chip('i').dragTo(byDrop(frame, nums, 'item', 2));
  await expect(chipAt(frame, nums, 'i', 'item', 2)).toHaveCount(1);
  await chip('i').dblclick();
  await typeIn(frame, 'lo');
  await drag(page, await center(chip('lo')), await emptySpot(frame));
  await expect(frame.locator('.lv-nullptr', { has: chip('lo') })).toContainText('null');

  // Keyboard: F2 renames, Space / arrows / Space carries it onto a cell, Delete removes it.
  await chip('lo').focus();
  await kb.press('F2');
  await typeIn(frame, 'hi');
  await kbDrop(frame, chip('hi'), key(nums, 'item', 3));
  await expect(chipAt(frame, nums, 'hi', 'item', 3)).toHaveCount(1);
  await chip('hi').focus();
  await kb.press('Delete');
  await expect(chip('hi')).toHaveCount(0);
});

test('grid: mark, edit and an [r, c] pointer, by mouse and by keyboard', async ({ page }) => {
  const frame = await open(page, 'number-of-islands');
  const kb = page.keyboard;
  const grid = await cardId(cardOf(frame, 'grid', 'grid'));
  const cell = (r: number, c: number) => bySel(frame, 'val', grid, 'cell', r, c);

  // Keyboard: M marks and unmarks the focused cell (Decision 7). Plan 4 covers the click.
  await cell(1, 2).focus();
  await kb.press('m');
  await expect(cell(1, 2)).toHaveClass(/lv-marked/);
  await kb.press('m');
  await expect(cell(1, 2)).not.toHaveClass(/lv-marked/);

  // Mouse: a double-click edits and never marks (Decision 8). The grid stays all strings, so values show unquoted.
  await cell(0, 4).dblclick();
  await typeIn(frame, '"1"');
  await expect(cell(0, 4)).toHaveText('1');
  await page.waitForTimeout(400); // the first click's 250 ms mark must not land later
  await expect(cell(0, 4)).not.toHaveClass(/lv-marked/);

  // Keyboard: F2 edits.
  await cell(3, 0).focus();
  await kb.press('F2');
  await typeIn(frame, '"1"');
  await expect(cell(3, 0)).toHaveText('1');

  // Pointer: added at [0, 0]; arrows move it by keyboard (Decision 16), a drag by mouse.
  await frame.locator(`[data-card="${grid}"]`).getByRole('button', { name: 'Add pointer', exact: true }).click();
  await expect(chipAt(frame, grid, 'i', 'cell', 0, 0)).toHaveCount(1);
  await bySel(frame, 'ptr', grid, 'i').focus();
  await kb.press('ArrowDown');
  await expect(chipAt(frame, grid, 'i', 'cell', 1, 0)).toHaveCount(1);
  await kb.press('ArrowRight');
  await expect(chipAt(frame, grid, 'i', 'cell', 1, 1)).toHaveCount(1);
  await bySel(frame, 'ptr', grid, 'i').dragTo(byDrop(frame, grid, 'cell', 2, 3));
  await expect(chipAt(frame, grid, 'i', 'cell', 2, 3)).toHaveCount(1);
});

test('list: pointer steps, next handles and new nodes, by mouse and by keyboard', async ({ page }) => {
  const frame = await open(page, 'reverse-linked-list');
  const kb = page.keyboard;
  const list = await cardId(cardOf(frame, 'list', 'head'));
  const card = frame.locator(`[data-card="${list}"]`);
  const next = (n: string) => bySel(frame, 'link', list, n, 'next');

  // Keyboard: Right follows next, Left goes to the predecessor (Decision 16). Mouse: drag the chip onto a node.
  await bySel(frame, 'ptr', list, 'head').focus();
  await kb.press('ArrowRight');
  await expect(chipAt(frame, list, 'head', 'node', 'n2')).toHaveCount(1);
  await kb.press('ArrowLeft');
  await expect(chipAt(frame, list, 'head', 'node', 'n1')).toHaveCount(1);
  await bySel(frame, 'ptr', list, 'head').dragTo(byDrop(frame, list, 'node', 'n4'));
  await expect(chipAt(frame, list, 'head', 'node', 'n4')).toHaveCount(1);

  // Mouse: the tail's next dragged onto the first node closes a cycle, drawn as a back arrow. Undo opens it again.
  await expect(next('n5')).not.toHaveClass(/lv-handle-set/);
  await next('n5').dragTo(byDrop(frame, list, 'node', 'n1'));
  await expect(next('n5')).toHaveClass(/lv-handle-set/);
  await expect(card.locator('path.lv-arrow-back')).toHaveCount(1);
  await kb.press('ControlOrMeta+Z');
  await expect(card.locator('path.lv-arrow-back')).toHaveCount(0);

  // Keyboard: the same rewiring with Space, arrows and Space.
  await kbDrop(frame, next('n5'), key(list, 'node', 'n1'));
  await expect(card.locator('path.lv-arrow-back')).toHaveCount(1);

  // Add node opens the editor on a detached node: by mouse, then by Enter.
  const addNode = card.getByRole('button', { name: 'Add node', exact: true });
  await addNode.click();
  await typeIn(frame, '6');
  await addNode.focus();
  await kb.press('Enter');
  await typeIn(frame, '7');
  await expect(slots(frame, list, 'node')).toHaveCount(7);
  await expect(bySel(frame, 'val', list, 'node', 'n7')).toHaveText('7');
});

test('tree: pointer steps, left and right handles and new nodes, by mouse and by keyboard', async ({ page }) => {
  const frame = await open(page, 'maximum-depth-of-binary-tree');
  const kb = page.keyboard;
  const tree = await cardId(cardOf(frame, 'tree', 'root'));
  const card = frame.locator(`[data-card="${tree}"]`);
  const link = (n: string, side: 'left' | 'right') => bySel(frame, 'link', tree, n, side);
  const rootAt = (n: string) => chipAt(frame, tree, 'root', 'node', n);

  // [3,9,20,null,null,15,7]: n1 = 3 has n2 = 9 and n3 = 20; n3 has n4 = 15 and n5 = 7.
  // Keyboard (Decision 16): Left and Right go to children, Up to the parent, Down to the left child.
  await bySel(frame, 'ptr', tree, 'root').focus();
  await kb.press('ArrowLeft');
  await expect(rootAt('n2')).toHaveCount(1);
  await kb.press('ArrowUp');
  await expect(rootAt('n1')).toHaveCount(1);
  await kb.press('ArrowRight');
  await expect(rootAt('n3')).toHaveCount(1);
  await kb.press('ArrowDown');
  await expect(rootAt('n4')).toHaveCount(1);
  await bySel(frame, 'ptr', tree, 'root').dragTo(byDrop(frame, tree, 'node', 'n5'));
  await expect(rootAt('n5')).toHaveCount(1);

  // Mouse: a right handle onto empty space detaches n5; a left handle onto n5 attaches it to n2.
  await expect(link('n3', 'right')).toHaveClass(/lv-handle-set/);
  await drag(page, await center(link('n3', 'right')), await emptySpot(frame));
  await expect(link('n3', 'right')).not.toHaveClass(/lv-handle-set/);
  await link('n2', 'left').dragTo(byDrop(frame, tree, 'node', 'n5'));
  await expect(link('n2', 'left')).toHaveClass(/lv-handle-set/);

  // Keyboard: a right handle carried onto a node.
  await expect(link('n2', 'right')).not.toHaveClass(/lv-handle-set/);
  await kbDrop(frame, link('n2', 'right'), key(tree, 'node', 'n4'));
  await expect(link('n2', 'right')).toHaveClass(/lv-handle-set/);

  // Add node: by Enter, then by mouse.
  const addNode = card.getByRole('button', { name: 'Add node', exact: true });
  await addNode.focus();
  await kb.press('Enter');
  await typeIn(frame, '1');
  await expect(bySel(frame, 'val', tree, 'node', 'n6')).toHaveText('1');
  await addNode.click();
  await typeIn(frame, '2');
  await expect(slots(frame, tree, 'node')).toHaveCount(7);
});

test('variable, map and set: drop, add, edit and delete, by mouse and by keyboard', async ({ page }) => {
  const frame = await open(page, 'two-sum', ['Map', 'Set']);
  const kb = page.keyboard;
  const nums = await cardId(cardOf(frame, 'array', 'nums'));
  const target = await cardId(cardOf(frame, 'var', 'target'));
  const map = await cardId(frame.locator('[data-card][data-kind=map]'));
  const set = await cardId(frame.locator('[data-card][data-kind=set]'));
  const button = (s: string, name: string) => frame.locator(`[data-card="${s}"]`).getByRole('button', { name, exact: true });
  const item = (i: number) => bySel(frame, 'val', nums, 'item', i);
  const value = bySel(frame, 'val', target, 'var');

  // Variable: a dragged value is copied in (mouse); F2 edits (keyboard).
  await item(3).dragTo(value);
  await expect(value).toHaveText('15');
  await value.focus();
  await kb.press('F2');
  await typeIn(frame, '9');
  await expect(value).toHaveText('9');

  // Map by mouse: Add entry opens the editor on a new key, a value dropped on "+ key" makes an entry, × deletes one.
  await button(map, 'Add entry').click();
  await typeIn(frame, '1');
  await editSlot(frame, bySel(frame, 'val', map, 'val', 0), '10');
  await item(0).dragTo(byDrop(frame, map, 'add'));
  await expect(slots(frame, map, 'key')).toHaveText(['1', '2']);
  await button(map, 'Delete entry').first().click();
  await expect(slots(frame, map, 'key')).toHaveText(['2']);
  // Map by keyboard: Delete on a key deletes its entry; Enter on Add entry adds one.
  await bySel(frame, 'val', map, 'key', 0).focus();
  await kb.press('Delete');
  await expect(slots(frame, map, 'key')).toHaveCount(0);
  await button(map, 'Add entry').focus();
  await kb.press('Enter');
  await typeIn(frame, '3');
  await expect(slots(frame, map, 'key')).toHaveText(['3']);

  // Set by mouse: Add item, a dropped value, × removes.
  await button(set, 'Add item').click();
  await typeIn(frame, '5');
  await item(1).dragTo(byDrop(frame, set, 'add'));
  await expect(slots(frame, set, 'item')).toHaveText(['5', '7']);
  await button(set, 'Remove item').first().click();
  await expect(slots(frame, set, 'item')).toHaveText(['7']);
  // Set by keyboard: a value carried in with Space, arrows and Space; Delete removes it.
  await kbDrop(frame, item(2), key(set, 'add'));
  await expect(slots(frame, set, 'item')).toHaveText(['7', '11']);
  await bySel(frame, 'val', set, 'item', 0).focus();
  await kb.press('Delete');
  await expect(slots(frame, set, 'item')).toHaveText(['11']);
});

test('queue, stack and call stack: push, pop and edit, by mouse and by keyboard', async ({ page }) => {
  const frame = await open(page, 'two-sum', ['Queue', 'Stack', 'Call stack']);
  const kb = page.keyboard;
  const idOf = (kind: string) => cardId(frame.locator(`[data-card][data-kind=${kind}]`));
  const queue = await idOf('queue');
  const stack = await idOf('stack');
  const calls = await idOf('calls');
  const button = (s: string, name: string) => frame.locator(`[data-card="${s}"]`).getByRole('button', { name, exact: true });
  const frames = frame.locator(`[data-card="${calls}"] .lv-frame`);

  // Queue by mouse: enqueue twice, dequeue the front.
  await button(queue, 'Enqueue').click();
  await typeIn(frame, '1');
  await button(queue, 'Enqueue').click();
  await typeIn(frame, '2');
  await button(queue, 'Dequeue').click();
  await expect(slots(frame, queue, 'item')).toHaveText(['2']);
  // Queue by keyboard: Enter on Enqueue; Delete on the front dequeues (Decision 15).
  await button(queue, 'Enqueue').focus();
  await kb.press('Enter');
  await typeIn(frame, '3');
  await expect(slots(frame, queue, 'item')).toHaveText(['2', '3']);
  await bySel(frame, 'val', queue, 'item', 0).focus();
  await kb.press('Delete');
  await expect(slots(frame, queue, 'item')).toHaveText(['3']);

  // Stack by keyboard: Enter on Push twice; Delete on the top pops. By mouse: the Pop button, disabled when empty.
  for (const v of ['4', '5']) {
    await button(stack, 'Push').focus();
    await kb.press('Enter');
    await typeIn(frame, v);
  }
  await expect(slots(frame, stack, 'item')).toHaveText(['5', '4']); // top first
  await bySel(frame, 'val', stack, 'item', 1).focus();
  await kb.press('Delete');
  await expect(slots(frame, stack, 'item')).toHaveText(['4']);
  await button(stack, 'Pop').click();
  await expect(slots(frame, stack, 'item')).toHaveCount(0);
  await expect(button(stack, 'Pop')).toBeDisabled();

  // A new call stack starts with one frame, f (Plan 4's createStruct). Pop it by mouse; then Pop frame and Add local are disabled.
  await expect(frames).toHaveCount(1);
  await button(calls, 'Pop frame').click();
  await expect(frames).toHaveCount(0);
  await expect(button(calls, 'Pop frame')).toBeDisabled();
  await expect(button(calls, 'Add local')).toBeDisabled();
  // Call stack by mouse: push a frame, add a local and name it, double-click its value to set it.
  await button(calls, 'Push frame').click();
  await expect(bySel(frame, 'val', calls, 'fn', 0)).toHaveText('f');
  await button(calls, 'Add local').click();
  await typeIn(frame, 'n');
  await editSlot(frame, bySel(frame, 'val', calls, 'local', 0, 0), '5');
  // A pushed frame copies the function name and the local names, with empty values.
  await button(calls, 'Push frame').click();
  await expect(frames).toHaveCount(2);
  await expect(bySel(frame, 'val', calls, 'lname', 1, 0)).toHaveText('n');
  await expect(bySel(frame, 'val', calls, 'local', 1, 0)).toHaveText('');
  // Call stack by keyboard: F2 on the function name and on a local; Enter on Pop frame.
  await bySel(frame, 'val', calls, 'fn', 1).focus();
  await kb.press('F2');
  await typeIn(frame, 'dfs');
  await expect(bySel(frame, 'val', calls, 'fn', 1)).toHaveText('dfs');
  await bySel(frame, 'val', calls, 'local', 1, 0).focus();
  await kb.press('F2');
  await typeIn(frame, '4');
  await expect(bySel(frame, 'val', calls, 'local', 1, 0)).toHaveText('4');
  await button(calls, 'Pop frame').focus();
  await kb.press('Enter');
  await expect(frames).toHaveCount(1);
  await button(calls, 'Pop frame').click();
  await expect(frames).toHaveCount(0);
});

test('cards, board and timeline: move, rename, delete, pan, continue and line tags', async ({ page }) => {
  const frame = await open(page, 'two-sum');
  const kb = page.keyboard;
  const nums = await cardId(cardOf(frame, 'array', 'nums'));
  const target = await cardId(cardOf(frame, 'var', 'target'));
  const header = bySel(frame, 'card', nums);
  const name = frame.locator(`[data-card="${nums}"] [data-testid=card-name]`);
  const label = frame.getByTestId('frame-label');
  const x = async (s: string) => (await frame.locator(`[data-card="${s}"]`).boundingBox())!.x;
  const moved = async (s: string, from: number) => Math.round((await x(s)) - from);

  // Move a card at 100% zoom: drag its header (mouse); arrows move it 16 px (keyboard, Decision 7).
  let before = await x(nums);
  const grab = await center(name);
  await drag(page, grab, { x: grab.x + 120, y: grab.y + 40 });
  await expect.poll(() => moved(nums, before)).toBe(120);
  before = await x(nums);
  await header.focus();
  await kb.press('ArrowRight');
  await expect.poll(() => moved(nums, before)).toBe(16);

  // Rename by keyboard: F2 on the header. Plan 3 covers the double-click.
  await kb.press('F2');
  await typeIn(frame, 'arr');
  await expect(name).toHaveText('arr');

  // Pan: drag empty space (mouse); arrows on the focused board pan 40 px the other way (keyboard).
  before = await x(target);
  const spot = await emptySpot(frame);
  await drag(page, spot, { x: spot.x + 60, y: spot.y });
  await expect.poll(() => moved(target, before)).toBe(60);
  before = await x(target);
  await frame.getByTestId('board').focus();
  await kb.press('ArrowRight');
  await expect.poll(() => moved(target, before)).toBe(-40);

  // Delete: the × button (mouse), Delete on a focused header (keyboard). Undo brings both back.
  await frame.getByRole('button', { name: 'Delete target', exact: true }).click();
  await expect(frame.locator(`[data-card="${target}"]`)).toHaveCount(0);
  await header.focus();
  await kb.press('Delete');
  await expect(frame.locator('[data-card]')).toHaveCount(0);
  await kb.press('ControlOrMeta+Z');
  await kb.press('ControlOrMeta+Z');
  await expect(frame.locator('[data-card]')).toHaveCount(2);

  // Continue from here on Step 1 of three frames: by mouse, undone once (§4), then by Enter on the button.
  await nextStep(frame);
  await nextStep(frame);
  expect(await frameCount(frame)).toBe(3);
  await frame.getByTestId('prev-frame').click();
  await frame.getByTestId('prev-frame').click();
  await expect(label).toHaveText('Step 1');
  await frame.getByTestId('continue').click();
  await expect.poll(() => frameCount(frame)).toBe(2);
  await expect(label).toHaveText('Draft');
  await kb.press('ControlOrMeta+Z');
  await expect.poll(() => frameCount(frame)).toBe(3);
  await kb.press('[');
  await kb.press('[');
  await expect(label).toHaveText('Step 1');
  await frame.getByTestId('continue').focus();
  await kb.press('Enter');
  await expect.poll(() => frameCount(frame)).toBe(2);

  // Line tag: typed on the draft and committed on blur, then carried by the frame Next step makes (Decision 17).
  const line = frame.getByTestId('line-tag');
  await line.focus();
  await kb.type('7');
  await kb.press('Tab');
  await nextStep(frame);
  await kb.press('[');
  await expect(label).toHaveText('Step 2');
  await expect(line).toHaveValue('7');
});
