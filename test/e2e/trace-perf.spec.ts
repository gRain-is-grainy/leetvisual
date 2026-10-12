import type { Frame } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, openProblem, test } from './fixtures';
import { setInputs } from './canvas';
import { endText, lastStep, openTrace, setCode, solution, stepInfo, traceNow, usePython } from './trace';

const EXAMPLES: [slug: string, file: string][] = [
  ['two-sum', 'two-sum'],
  ['longest-substring-without-repeating-characters', 'longest-substring'],
  ['reverse-linked-list', 'reverse-linked-list'],
  ['merge-two-sorted-lists', 'merge-two-sorted-lists'],
  ['maximum-depth-of-binary-tree', 'maximum-depth'],
  ['number-of-islands', 'number-of-islands'],
  ['lru-cache', 'lru-cache'],
];

const GRID = JSON.stringify(Array.from({ length: 30 }, () => Array<string>(30).fill('1')));

// Milliseconds, in panel time, from the Trace click to two frames after the outcome is applied.
// `modeFirst` clicks Trace mode first, for the fresh-tab case.
async function timeTrace(frame: Frame, modeFirst = false): Promise<number> {
  return frame.evaluate(async (modeFirst) => {
    if (modeFirst) {
      document.querySelector<HTMLButtonElement>('[data-testid=mode-trace]')!.click();
      await new Promise((r) => setTimeout(r, 0)); // Preact renders the Trace button
    }
    const run = document.querySelector<HTMLButtonElement>('[data-testid=trace-run]')!;
    return new Promise<number>((resolve) => {
      let busy = false;
      const obs = new MutationObserver(() => {
        const t = run.textContent?.trim();
        if (t === 'Stop') busy = true;
        else if (busy && t === 'Trace') {
          obs.disconnect();
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)));
        }
      });
      obs.observe(document.body, { subtree: true, childList: true, characterData: true });
      const t0 = performance.now();
      run.click();
    });
  }, modeFirst);
}

async function expectFirstStepShown(frame: Frame): Promise<void> {
  await expect(frame.getByTestId('trace-step')).toHaveText(/^Step 1 \/ \d+$/);
  const visible = await frame
    .locator('[data-card]')
    .evaluateAll((els) => els.filter((el) => getComputedStyle(el).visibility === 'visible' && el.getClientRects().length > 0).length);
  expect(visible, 'cards shown').toBeGreaterThan(0);
}

for (const [slug, file] of EXAMPLES) {
  test(`with the worker warm, ${slug} shows its first step in under 500 ms`, async ({ page, context }) => {
    test.setTimeout(120_000);
    await usePython(context);
    await openProblem(page, slug);
    await ensureTestcaseOpen(page);
    await setCode(page, solution(file));
    const frame = await openTrace(page);
    await traceNow(frame); // warm-up: starts Python and runs this code once
    const ms = await timeTrace(frame);
    await expectFirstStepShown(frame);
    test.info().annotations.push({ type: 'first-step-ms', description: `${slug}: ${ms.toFixed(0)} ms` });
    console.log(`first step, warm, ${slug}: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(500);
  });
}

test('on a fresh tab, tracing right after the first switch to Trace mode shows the first step in under 2 s', async ({ page, context }) => {
  test.setTimeout(120_000);
  await usePython(context);
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  await setCode(page, solution('two-sum'));
  const frame = await openCanvas(page);
  await expect(frame.getByTestId('mode-trace')).toBeVisible(); // the panel has mounted; the timer starts at the click
  const ms = await timeTrace(frame, true);
  await expectFirstStepShown(frame);
  test.info().annotations.push({ type: 'fresh-ms', description: `${ms.toFixed(0)} ms` });
  console.log(`first step, fresh tab: ${ms.toFixed(0)} ms`);
  expect(ms).toBeLessThan(2000);
});

test('scrubbing one step of a capped 10,000-step trace takes under 16 ms', async ({ page, context }) => {
  test.setTimeout(240_000);
  await usePython(context);
  await openProblem(page, 'number-of-islands');
  await ensureTestcaseOpen(page);
  await setInputs(page, [GRID]);
  await setCode(page, solution('islands-bfs'));
  const frame = await openTrace(page);
  await traceNow(frame);
  await lastStep(frame);
  await expect(endText(frame)).toHaveText('Stopped after 10,000 steps');
  expect((await stepInfo(frame)).n).toBe(10_000);
  await expect(frame.getByTestId('banner')).toHaveCount(0); // 30×30 is within the render limits

  await frame.getByTestId('trace-scrubber').fill('5000');
  await expect.poll(async () => (await stepInfo(frame)).k).toBeGreaterThan(4000);
  const start = (await stepInfo(frame)).k;

  const times = await frame.evaluate(async () => {
    const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const settle = () => new Promise<void>((r) => setTimeout(r, 0));
    (document.activeElement as HTMLElement | null)?.blur();
    const out: number[] = [];
    for (const key of [...Array<string>(9).fill('['), ...Array<string>(9).fill(']')]) {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      const t0 = performance.now();
      press(key);
      await settle();
      void document.body.offsetHeight;
      out.push(performance.now() - t0);
    }
    return out;
  });
  expect((await stepInfo(frame)).k).toBe(start);

  const sorted = [...times].sort((a, b) => a - b);
  const median = (sorted[8] + sorted[9]) / 2;
  const max = sorted[sorted.length - 1];
  test.info().annotations.push({ type: 'scrub-ms', description: `median ${median.toFixed(2)} ms, max ${max.toFixed(2)} ms` });
  console.log(`scrub: median ${median.toFixed(2)} ms, max ${max.toFixed(2)} ms`);
  expect(median).toBeLessThan(16);
});
