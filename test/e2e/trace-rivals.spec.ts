import { expect, test } from './fixtures';
import { bySel } from './canvas';
import { card, chipAt, endText, goStep, highlighted, lastStep, pressInPanel, stepInfo, stepUntil, tracedProblem } from './trace';

test('collections.deque works without an import', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'maximum-depth-of-binary-tree', 'max-depth-deque');
  await stepUntil(frame, '[data-card="t:q"][data-kind="queue"] .lv-slot', /^TreeNode\(\d+\)$/);
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned 3');
});

test('Climbing Stairs with @cache: the wrapper is hidden and the calls are on the call stack card', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'climbing-stairs', 'climbing-stairs-cache');
  await expect(card(frame, 'ways')).toHaveCount(0);
  await expect(card(frame, '#calls')).toHaveCount(1);
  await stepUntil(frame, '[data-card="t:#calls"] .lv-frame ~ .lv-frame ~ .lv-frame');
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned 2');
});

test('Linked List Cycle builds the cycle from pos and returns True', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'linked-list-cycle', 'linked-list-cycle');
  await expect(card(frame, '#list').getByTestId('card-name')).toHaveText('head');
  await expect(card(frame, '#list').locator('path.lv-arrow-back')).toHaveCount(1);
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned True');
});

test('a Two Sum that raises ends on the raising line with the error tint', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum-raises');
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('IndexError: list index out of range (line 5)');
  await expect(frame.getByTestId('trace-event')).toHaveText('IndexError');
  await expect.poll(() => highlighted(page)).toEqual({ line: 5, err: true });
  // i == len(nums): the cursor is listed beside the array with its value (spec §5.5).
  expect(await chipAt(frame, 't:nums', 'i')).toEqual({ aside: 'i: 4' });
});

test('an infinite loop stops at a cap and the panel stays responsive', async ({ page, context }) => {
  test.setTimeout(120_000);
  const frame = await tracedProblem(page, context, 'two-sum', 'infinite-loop');
  await lastStep(frame);
  await expect(endText(frame)).toHaveText(/^Stopped after (10,000 steps|3 s)$/);
  const { n } = await stepInfo(frame);
  expect(n).toBeLessThanOrEqual(10_000);
  if ((await endText(frame).textContent()) === 'Stopped after 10,000 steps') expect(n).toBe(10_000);

  const step = frame.getByTestId('trace-step');
  await pressInPanel(frame, ['Home']);
  await expect(step).toHaveText(`Step 1 / ${n}`, { timeout: 1000 });
  await pressInPanel(frame, [']']);
  await expect(step).toHaveText(`Step 2 / ${n}`, { timeout: 1000 });
  await frame.getByTestId('trace-scrubber').fill(String(Math.floor(n / 2)));
  await expect.poll(async () => (await stepInfo(frame)).k, { timeout: 1000 }).toBeGreaterThan(2);
  await expect(card(frame, 'i')).toHaveAttribute('data-kind', 'var');
  await frame.getByTestId('mode-canvas').click();
  await expect(frame.getByTestId('mode-canvas')).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
  await frame.getByTestId('mode-trace').click();
  await expect(step).toBeVisible({ timeout: 1000 });
});

// Review Focus 3: index Decision 17. The fixture's guard checks this too; the explicit check names the cause.
test('prints and a SyntaxWarning trace normally and log nothing', async ({ page, context, extErrors }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum-prints');
  await goStep(frame, 0);
  await stepUntil(frame, '[data-card="t:pattern"]');
  await expect(bySel(frame, 'val', 't:pattern', 'var')).toHaveText('"\\\\d+"');
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned [0, 1]');
  expect(extErrors, 'console output from the extension').toEqual([]);
});
