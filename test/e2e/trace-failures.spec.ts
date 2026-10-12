import { ensureTestcaseOpen, expect, openProblem, test } from './fixtures';
import { endText, highlighted, lastStep, openTrace, setCode, solution, stepInfo, traceNow, tracedProblem, usePython } from './trace';

const FATAL = "Python crashed: recursion this deep (for example through @cache) overflows the browser's stack.";

test('a syntax error shows its message and tints its line', async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'syntax-error');
  await expect(frame.getByTestId('trace-empty')).toHaveText(/^SyntaxError: .+ \(line 3\)$/);
  await expect(frame.getByTestId('trace-timeline')).toHaveCount(0);
  await expect.poll(() => highlighted(page)).toEqual({ line: 3, err: true });
});

test('a non-Python editor language is not run', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('global_lang', '"cpp"'));
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  expect(
    await page.evaluate(async () => {
      const m = (window as unknown as { monaco?: { editor: { getEditors(): { getModel(): { getLanguageId(): string } | null }[] } } }).monaco;
      for (let i = 0; i < 40 && !m?.editor.getEditors()[0]?.getModel(); i++) await new Promise((r) => setTimeout(r, 250));
      return m?.editor.getEditors()[0]?.getModel()?.getLanguageId();
    }),
  ).toBe('cpp');
  const frame = await openTrace(page);
  await traceNow(frame);
  await expect(frame.getByTestId('trace-empty')).toHaveText('Tracing supports Python 3. Switch the editor language to Python3.');
  expect(await highlighted(page)).toBeNull();
});

test('deep @cache recursion crashes Python, and the next trace works', async ({ page, context, extErrors }) => {
  test.setTimeout(120_000);
  const frame = await tracedProblem(page, context, 'climbing-stairs', 'deep-cache');
  await expect(frame.getByTestId('trace-empty')).toHaveText(FATAL);

  await setCode(page, solution('climbing-stairs-cache'));
  await traceNow(frame);
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned 2');

  // The crash is this test's doing: Pyodide's own fatal-error handler logs it with console.error in the worker
  // ("Pyodide has suffered a fatal error", then the RangeError). Nothing else may be dropped.
  const crash = (e: string) => /Pyodide has suffered a fatal error|The cause of the fatal error|Maximum call stack size exceeded/.test(e);
  extErrors.splice(0, extErrors.length, ...extErrors.filter((e) => !crash(e)));
});

test('a long C call is stopped by the 5 s wall timeout, and the next trace works', async ({ page, context }) => {
  test.setTimeout(120_000);
  await usePython(context);
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  await setCode(page, solution('slow-c-call'));
  const frame = await openTrace(page);
  await traceNow(frame); // warm the worker with a first run, so the timing below is the run alone
  await expect(frame.getByTestId('trace-empty')).toHaveText('Stopped after 5 s.');

  const t0 = Date.now();
  await traceNow(frame);
  const ms = Date.now() - t0;
  await expect(frame.getByTestId('trace-empty')).toHaveText('Stopped after 5 s.');
  expect(ms, 'the wall timeout, not an earlier stop').toBeGreaterThanOrEqual(4900);
  expect(ms, 'the restart does not hang').toBeLessThan(20_000);

  await setCode(page, solution('two-sum'));
  await traceNow(frame);
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned [0, 1]');
});

test('Stop ends a run at once and leaves the previous trace', async ({ page, context }) => {
  test.setTimeout(120_000);
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum');
  await lastStep(frame);
  const { n } = await stepInfo(frame);

  await setCode(page, solution('slow-c-call'));
  await expect(frame.getByTestId('trace-stale')).toBeVisible();
  const run = frame.getByTestId('trace-run');
  await run.click();
  await expect(run).toHaveText('Stop');
  await expect(frame.getByTestId('trace-status')).toHaveText('Tracing…');
  await run.click();
  await expect(run).toHaveText('Trace', { timeout: 2000 });
  await expect(frame.getByTestId('trace-step')).toHaveText(`Step ${n} / ${n}`);
  await expect(endText(frame)).toHaveText('Returned [0, 1]');
  await expect(frame.getByTestId('trace-stale')).toBeVisible();

  await setCode(page, solution('two-sum'));
  const t0 = Date.now();
  await traceNow(frame);
  expect(Date.now() - t0, 'the restarted worker answers well before a timeout').toBeLessThan(5000);
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Returned [0, 1]');
});

// Review Focus 4.
test("a malformed custom input names the input it couldn't read", async ({ page, context }) => {
  const frame = await tracedProblem(page, context, 'two-sum', 'two-sum', ['[2,7,', '9']);
  await expect(frame.getByTestId('trace-empty')).toHaveText('Couldn\'t read input "nums".');
});
