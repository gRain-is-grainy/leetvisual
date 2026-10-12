import type { Frame, Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, openProblem, test, VIEWPORTS } from './fixtures';
import { expectNoOverlap, panelGap } from './canvas';
import { applyPanelLayout, mouseOff, reachableTestids } from './layout';
import { goStep, openTrace, setCode, solution, stepUntil, traceNow, usePython } from './trace';

const THEMES = ['light', 'dark'] as const;
const CONTROLS = [
  'mode-canvas', 'mode-trace', 'trace-run', 'trace-status', 'trace-stale', 'zoom-out', 'zoom-level', 'zoom-in', 'fit',
  'trace-prev', 'trace-scrubber', 'trace-next', 'trace-step', 'trace-line', 'trace-event', 'trace-end',
];

async function checkTraceFit(page: Page, frame: Frame, withBoard: boolean): Promise<void> {
  await expect.poll(() => panelGap(page), 'iframe follows the testcase area').toBeLessThanOrEqual(1);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll').toBe(true);

  const outside = await frame.evaluate(
    (ids) =>
      ids
        .flatMap((id) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)])
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.left < 0 || r.top < 0 || r.right > window.innerWidth + 0.5 || r.bottom > window.innerHeight + 0.5;
        })
        .map((el) => el.dataset.testid!),
    CONTROLS,
  );
  expect(outside, 'toolbar and timeline controls are inside the panel').toEqual([]);

  const { reached, required } = await reachableTestids(frame);
  expect(required.filter((id) => !reached.includes(id)), 'every enabled control is keyboard-reachable').toEqual([]);
  if (!withBoard) return;

  // Spec 5.2: call-stack frames list locals as short text, so their rows are compact; slots elsewhere stay 32px.
  const rows = await frame.evaluate(() => ({
    local: [...document.querySelectorAll<HTMLElement>('.lv-trace .lv-frame .lv-local')].map((l) => l.offsetHeight),
    slot: [...document.querySelectorAll<HTMLElement>('.lv-card:not(:has(.lv-frame)) .lv-slot')].map((l) => l.offsetHeight),
  }));
  expect(Math.max(0, ...rows.local), 'frame local rows are compact').toBeLessThanOrEqual(22);
  expect(rows.slot.filter((h) => h !== 32), 'other slots keep their height').toEqual([]);
  // The pressed mode is told apart from the other (and from a hovered one, which only changes the background) by weight.
  expect(
    await frame.evaluate(() => [...document.querySelectorAll<HTMLElement>('.lv-modes > button')].map((b) => [b.getAttribute('aria-pressed'), getComputedStyle(b).fontWeight])),
    'pressed mode button is bold, the other is not',
  ).toEqual([['false', '400'], ['true', '600']]);
  // Spec §6.1: edit controls are hidden in Trace mode, not just disabled.
  await expect(frame.locator('.lv-card .lv-ctrl:visible, .lv-card .lv-x:visible, .lv-card .lv-menu:visible')).toHaveCount(0);
  await expect(frame.getByTestId('trace-line')).toHaveAttribute('title', /\S/);
  const scroll = await frame.getByTestId('board').evaluate((el) => [el.scrollLeft, el.scrollTop]);
  expect(scroll, 'keyboard focus leaves the board unscrolled').toEqual([0, 0]);
  await expectNoOverlap(frame);
}

async function mouseOffEmpty(page: Page, frame: Frame): Promise<void> {
  await frame.getByTestId('trace-empty').hover({ position: { x: 5, y: 5 } });
  await page.mouse.move(0, 0);
}

// A step with a cursor on nums at index 1 and one map entry; for islands, dfs called off the top row (an aside cursor).
async function middleStep(frame: Frame, slug: string): Promise<void> {
  await goStep(frame, 0);
  if (slug === 'two-sum') {
    await stepUntil(frame, `[data-card="t:nums"] .lv-col:nth-child(2) [data-sel='["ptr","t:nums","i"]']`);
  } else {
    await stepUntil(frame, '[data-card="t:grid"] .lv-nullptr', /^r,c: \[-1, \d+\]$/);
  }
}

async function shoot(page: Page, frame: Frame, name: string, withBoard: boolean): Promise<void> {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(frame.locator('html')).toHaveAttribute('data-theme', theme);
    if (withBoard) await frame.getByTestId('fit').click();
    await checkTraceFit(page, frame, withBoard);
    // The keyboard walk in checkTraceFit pans the board to each focused card and leaves a focus ring; shoot the Fit view.
    if (withBoard) await frame.getByTestId('fit').click();
    await frame.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    if (withBoard) await mouseOff(page, frame);
    else await mouseOffEmpty(page, frame);
    await page.screenshot({ path: `test-results/ui/trace-${name}-${theme}.png` });
  }
}

for (const { w, h } of VIEWPORTS) {
  for (const slug of ['two-sum', 'number-of-islands'] as const) {
    test(`Trace mode at ${w}x${h} for ${slug}`, async ({ page, context }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: w, height: h });
      await usePython(context);
      await openProblem(page, slug);
      await ensureTestcaseOpen(page);
      await setCode(page, solution(slug));
      const frame = await openTrace(page);

      if (slug === 'two-sum') {
        await applyPanelLayout(page, 'narrow', w, h);
        await shoot(page, frame, `empty-narrow-${w}x${h}`, false);
      }

      await traceNow(frame);
      await middleStep(frame, slug);
      for (const layout of ['narrow', 'wide'] as const) {
        await applyPanelLayout(page, layout, w, h);
        await shoot(page, frame, `${slug}-${layout}-${w}x${h}`, true);
      }

      // An edit makes the toolbar carry the stale badge too; the narrow panel is where it could overflow.
      await applyPanelLayout(page, 'narrow', w, h);
      await setCode(page, `${solution(slug)}\n`);
      await expect(frame.getByTestId('trace-stale')).toBeVisible();
      await shoot(page, frame, `${slug}-narrow-stale-${w}x${h}`, true);
    });
  }
}
