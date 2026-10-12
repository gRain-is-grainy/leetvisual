import type { ConsoleMessage } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, openProblem, panel, test } from './fixtures';
import { focusBeforeCanvasTab, tabTo } from './canvas';
import { highlighted, setCode, solution, stepInfo, traceWith, usePython } from './trace';

// The test moves focus from the page into the panel (Tab), which Page.bringToFront breaks (see the page fixture).
test.describe('panel focus from the page', () => {
  test.use({ foreground: false });

  test('keyboard-only Two Sum trace', async ({ page, context }) => {
    test.setTimeout(120_000);
    await usePython(context);
    await openProblem(page, 'two-sum');
    await ensureTestcaseOpen(page);
    await setCode(page, solution('two-sum'));
    const kb = page.keyboard;

    await focusBeforeCanvasTab(page);
    await kb.press('Tab');
    await expect(page.locator('[data-leetvisual-tab]')).toBeFocused();
    await kb.press('Enter');
    const iframe = page.locator('iframe[data-leetvisual-frame]');
    await expect(iframe).toBeVisible();
    await expect(iframe).toBeFocused();
    const frame = await panel(page);

    // Tab from a panel that is still loading has nothing to land on and leaves the iframe.
    await expect(frame.getByTestId('mode-trace')).toBeVisible();
    // Canvas | Trace by keyboard.
    await tabTo(frame, { sel: '[data-testid=mode-trace]' });
    await kb.press('Enter');
    await expect(frame.getByTestId('mode-trace')).toHaveAttribute('aria-pressed', 'true');
    await expect(frame.getByTestId('trace-empty')).toBeVisible();

    // T traces; [ ] Home End move.
    await traceWith(frame, () => kb.press('t'));
    const step = frame.getByTestId('trace-step');
    await expect(step).toHaveText(/^Step 1 \/ \d+$/);
    const { n } = await stepInfo(frame);
    await kb.press(']');
    await expect(step).toHaveText(`Step 2 / ${n}`);
    await kb.press('End');
    await expect(step).toHaveText(`Step ${n} / ${n}`);
    await expect(frame.getByTestId('trace-end')).toHaveText('Returned [0, 1]');
    await kb.press('[');
    await expect(step).toHaveText(`Step ${n - 1} / ${n}`);
    await kb.press('Home');
    await expect(step).toHaveText(`Step 1 / ${n}`);

    // The scrubber's own keys, then the ‹ and › buttons.
    await tabTo(frame, { sel: '[data-testid=trace-scrubber]' });
    await kb.press('End');
    await expect(step).toHaveText(`Step ${n} / ${n}`);
    await kb.press('ArrowLeft');
    await expect(step).toHaveText(`Step ${n - 1} / ${n}`);
    await tabTo(frame, { sel: '[data-testid=trace-prev]' });
    await kb.press('Enter');
    await expect(step).toHaveText(`Step ${n - 2} / ${n}`);
    await tabTo(frame, { sel: '[data-testid=trace-next]' });
    await kb.press('Enter');
    await expect(step).toHaveText(`Step ${n - 1} / ${n}`);

    // Esc stops a running trace and keeps this one.
    await setCode(page, solution('slow-c-call'));
    await expect(frame.getByTestId('trace-stale')).toBeVisible();
    await kb.press('t');
    await expect(frame.getByTestId('trace-run')).toHaveText('Stop');
    await expect(frame.getByTestId('trace-status')).toHaveText('Tracing…');
    await kb.press('Escape');
    await expect(frame.getByTestId('trace-run')).toHaveText('Trace', { timeout: 2000 });
    await expect(step).toHaveText(`Step ${n - 1} / ${n}`);

    // The stale badge re-traces by keyboard.
    await setCode(page, solution('two-sum'));
    await tabTo(frame, { sel: '[data-testid=trace-stale]' });
    await traceWith(frame, () => kb.press('Enter'));
    await expect(frame.getByTestId('trace-stale')).toBeHidden();
    await expect(step).toHaveText(/^Step 1 \/ \d+$/);
    await expect.poll(() => highlighted(page)).toEqual({ line: 2, err: false });

    // Back to Canvas mode.
    await tabTo(frame, { sel: '[data-testid=mode-canvas]' });
    await kb.press('Enter');
    await expect(frame.getByTestId('mode-canvas')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => highlighted(page)).toBeNull();
  });
});

test('a trace causes no CSP violation in the panel or its worker', async ({ page, context }) => {
  const csp: string[] = [];
  const watch = (msg: ConsoleMessage) => {
    if (/Content Security Policy|Refused to (load|execute|compile|create|evaluate)/i.test(msg.text())) csp.push(msg.text());
  };
  page.on('console', watch);
  page.on('worker', (w) => w.on('console', watch));

  await usePython(context);
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  await setCode(page, solution('two-sum'));
  const frame = await openCanvas(page);
  // Before Trace mode starts the worker, so every load from here on is watched.
  await frame.evaluate(() => {
    const w = window as unknown as { lvCsp: string[] };
    w.lvCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.lvCsp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  await frame.getByTestId('mode-trace').click();
  await traceWith(frame, () => frame.getByTestId('trace-run').click());
  await expect(frame.getByTestId('trace-timeline')).toBeVisible();

  expect(await frame.evaluate(() => (window as unknown as { lvCsp: string[] }).lvCsp), 'panel CSP violations').toEqual([]);
  expect(csp, 'CSP messages in the page or worker console').toEqual([]);
});
