import { ensureTestcaseOpen, expect, extensionId, openCanvas, openProblem, test } from './fixtures';
import { caseTag, hideCanvas, toAddTwoNumbers } from './canvas';
import { card, endText, goStep, highlighted, lastStep, openTrace, setCode, solution, traceNow, traceWith, tracedProblem, usePython } from './trace';

type DevPrivate = {
  chrome: {
    developerPrivate: {
      updateProfileConfiguration(update: { inDeveloperMode: boolean }, done: () => void): void;
      reload(id: string, opts: { failQuietly: boolean }, done: () => void): void;
    };
  };
};

const EMPTY = 'Press Trace to run your code on this test case.';

test('the highlight follows the steps and clears for Canvas mode and while the canvas is hidden', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  await expect.poll(() => highlighted(page)).toEqual({ line: 2, err: false });
  await goStep(frame, 1);
  await expect.poll(() => highlighted(page)).toEqual({ line: 3, err: false });
  await goStep(frame, 2);
  await expect.poll(() => highlighted(page)).toEqual({ line: 4, err: false });
  await lastStep(frame);
  await expect.poll(() => highlighted(page)).toEqual({ line: 6, err: false });
  await frame.getByTestId('trace-prev').click();
  await frame.getByTestId('trace-prev').click();
  await expect.poll(() => highlighted(page)).toEqual({ line: 5, err: false });

  await frame.getByTestId('mode-canvas').click();
  await expect.poll(() => highlighted(page)).toBeNull();
  await frame.getByTestId('mode-trace').click();
  await expect.poll(() => highlighted(page)).toEqual({ line: 5, err: false });

  await hideCanvas(page);
  await expect.poll(() => highlighted(page)).toBeNull();
  await openCanvas(page);
  await expect.poll(() => highlighted(page)).toEqual({ line: 5, err: false });
});

// Review Focus 5.
test('an edit clears the highlight, marks the trace stale, and re-tracing from the badge keeps moved cards in place', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  await expect.poll(() => highlighted(page)).toEqual({ line: 2, err: false });

  // Card dragging still works in Trace mode (spec §6.1).
  const target = card(frame, 'target');
  const head = await target.locator('.lv-card-head').boundingBox();
  const was = (await target.boundingBox())!;
  await page.mouse.move(head!.x + 12, head!.y + 10);
  await page.mouse.down();
  await page.mouse.move(head!.x + 92, head!.y + 70, { steps: 8 });
  await page.mouse.up();
  const moved = (await target.boundingBox())!;
  expect(moved.x - was.x).toBeGreaterThan(40);
  const nums = (await card(frame, 'nums').boundingBox())!;

  // A real keystroke in Monaco: the page script clears the highlight on the first edit, before the 300 ms debounce.
  // The last rendered line with text: the editor pane is short here and the view may sit partly under LeetCode's editor toolbar.
  await page.locator('.monaco-editor .view-lines .view-line').filter({ hasText: /\S/ }).last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await expect.poll(() => highlighted(page), { timeout: 250 }).toBeNull();
  await expect(frame.getByTestId('trace-stale')).toBeVisible();
  await expect(frame.getByTestId('trace-timeline')).toBeVisible(); // the stale trace stays on screen

  await traceWith(frame, () => frame.getByTestId('trace-stale').click());
  await expect(frame.getByTestId('trace-stale')).toBeHidden();
  await expect(frame.getByTestId('trace-step')).toHaveText(/^Step 1 \/ \d+$/);
  await expect.poll(() => highlighted(page)).toEqual({ line: 2, err: false });
  const after = (await target.boundingBox())!;
  expect(Math.abs(after.x - moved.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.y - moved.y)).toBeLessThanOrEqual(1);
  const numsAfter = (await card(frame, 'nums').boundingBox())!;
  expect(Math.abs(numsAfter.x - nums.x) + Math.abs(numsAfter.y - nums.y)).toBeLessThanOrEqual(2);
});

test('a case switch marks the trace stale and the badge traces the new case', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  await hideCanvas(page);
  await caseTag(page, 1).click();
  await openCanvas(page);
  await expect(frame.getByTestId('trace-stale')).toBeVisible();
  await expect.poll(() => highlighted(page)).toBeNull();
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned [0, 1]');

  await traceWith(frame, () => frame.getByTestId('trace-stale').click());
  await expect(frame.getByTestId('trace-stale')).toBeHidden();
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned [1, 2]');
  await expect.poll(() => highlighted(page)).toEqual({ line: 6, err: false });
});

test('a problem switch clears the trace and the highlight, and each problem keeps its own mode', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  await expect.poll(() => highlighted(page)).toEqual({ line: 2, err: false });

  await toAddTwoNumbers(page);
  await expect.poll(() => highlighted(page)).toBeNull();
  await ensureTestcaseOpen(page);
  await openCanvas(page);
  // Add Two Numbers was never left in Trace mode.
  await expect(frame.getByTestId('mode-canvas')).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.getByTestId('mode-trace')).toHaveAttribute('aria-pressed', 'false');

  await page.goBack();
  await page.waitForURL(/\/problems\/two-sum\//);
  await openCanvas(page);
  await expect(frame.getByTestId('mode-trace')).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.getByTestId('trace-empty')).toHaveText(EMPTY);
  expect(await highlighted(page)).toBeNull();
});

test('reloading the extension clears the highlight with the rest of its UI', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  await goStep(frame, 2);
  await expect.poll(() => highlighted(page)).toEqual({ line: 4, err: false });
  const id = await extensionId(page);

  const admin = await context.newPage();
  await admin.goto('chrome://extensions/');
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
  await expect(page.locator('iframe[data-leetvisual-frame]')).toHaveCount(0);
  await expect.poll(() => highlighted(page)).toBeNull();
});

test('Trace mode is restored after a reload, with no trace kept', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  await expect(frame.getByTestId('trace-timeline')).toBeVisible();

  await page.reload();
  await ensureTestcaseOpen(page);
  const again = await openCanvas(page);
  await expect(again.getByTestId('mode-trace')).toHaveAttribute('aria-pressed', 'true');
  await expect(again.getByTestId('trace-empty')).toHaveText(EMPTY);

  await setCode(page, solution('two-sum')); // the reload brought back LeetCode's snippet
  await traceNow(again);
  await lastStep(again);
  await expect(endText(again)).toHaveText('Returned [0, 1]');
});

// Review Focus 1.
test('a run still going when the problem changes never lands on the new problem', async ({ page, context }) => {
  test.setTimeout(120_000);
  await usePython(context);
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  await setCode(page, solution('slow-c-call'));
  const frame = await openTrace(page);
  const run = frame.getByTestId('trace-run');
  await run.click();
  await expect(run).toHaveText('Stop');

  await toAddTwoNumbers(page);
  await ensureTestcaseOpen(page);
  await openCanvas(page);
  await frame.getByTestId('mode-trace').click();
  await expect(frame.getByTestId('trace-empty')).toHaveText(EMPTY);

  await page.waitForTimeout(8000); // the slug message cancels the Two Sum run; its outcome must not appear later
  await expect(frame.getByTestId('trace-empty')).toHaveText(EMPTY);
  await expect(run).toHaveText('Trace');
  expect(await highlighted(page)).toBeNull();
});
