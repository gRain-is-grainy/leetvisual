import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Frame, Locator, Page } from '@playwright/test';
import { setInputs } from './canvas';
import { ensureTestcaseOpen, expect, openCanvas, openProblem } from './fixtures';

type Model = {
  getValue(): string;
  setValue(v: string): void;
  getLanguageId(): string;
  getAllDecorations(): { range: { startLineNumber: number }; options: { className?: string | null } }[];
};
type Monaco = { editor: { getEditors(): { getModel(): Model | null }[] } };

// Decision 26: before LeetCode's scripts run, so the editor opens in Python3. Every frame runs it; only leetcode.com's matters.
export async function usePython(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    if (location.hostname === 'leetcode.com') localStorage.setItem('global_lang', '"python3"');
  });
}

export async function setCode(page: Page, code: string): Promise<void> {
  await page.waitForFunction(() => {
    const m = (window as unknown as { monaco?: Monaco }).monaco?.editor.getEditors()[0]?.getModel();
    return !!m && m.getLanguageId().startsWith('python');
  });
  await page.evaluate((src) => {
    (window as unknown as { monaco: Monaco }).monaco.editor.getEditors()[0].getModel()!.setValue(src);
  }, code);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { monaco: Monaco }).monaco.editor.getEditors()[0].getModel()!.getValue()))
    .toBe(code);
}

// A Windows checkout may turn the fixture's line endings into CRLF; Monaco's model uses \n.
export function solution(name: string): string {
  return readFileSync(path.resolve('test/fixtures/solutions', `${name}.py`), 'utf8').replace(/\r\n/g, '\n');
}

export async function openTrace(page: Page): Promise<Frame> {
  const frame = await openCanvas(page);
  await frame.getByTestId('mode-trace').click();
  await expect(frame.getByTestId('mode-trace')).toHaveAttribute('aria-pressed', 'true');
  return frame;
}

// The button reads exactly Stop from the click's render until the render that shows the outcome, so waiting for it to
// read Trace again works for a first trace and a re-trace alike.
export async function runTrace(frame: Frame): Promise<void> {
  await frame.getByTestId('trace-run').click();
  await expect(frame.getByTestId('trace-run')).toHaveText('Trace', { timeout: 30_000 });
}

export async function highlighted(page: Page): Promise<{ line: number; err: boolean } | null> {
  return page.evaluate(() => {
    const model = (window as unknown as { monaco: Monaco }).monaco.editor.getEditors()[0].getModel()!;
    const d = model.getAllDecorations().find((x) => x.options.className === 'lv-line' || x.options.className === 'lv-line-err');
    return d ? { line: d.range.startLineNumber, err: d.options.className === 'lv-line-err' } : null;
  });
}

export const card = (frame: Frame, name: string): Locator => frame.locator(`[data-card="t:${name}"]`);

export const endText = (frame: Frame): Locator => frame.getByTestId('trace-end');

// The Trace button reads Stop from the click until the outcome is applied. A MutationObserver sees both flips even
// when the run is faster than Playwright's polling, and works for a first trace and for every re-trace alike.
export async function traceWith(frame: Frame, start: () => Promise<void>): Promise<void> {
  await frame.evaluate(() => {
    const w = window as unknown as { lvTraced?: Promise<void> };
    w.lvTraced = new Promise<void>((resolve) => {
      let busy = false;
      const obs = new MutationObserver(() => {
        const t = document.querySelector('[data-testid=trace-run]')?.textContent?.trim();
        if (t === 'Stop') busy = true;
        else if (busy && t === 'Trace') {
          obs.disconnect();
          resolve();
        }
      });
      obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
  });
  await start();
  await frame.evaluate(() => (window as unknown as { lvTraced: Promise<void> }).lvTraced);
}

export const traceNow = (frame: Frame): Promise<void> => traceWith(frame, () => frame.getByTestId('trace-run').click());

// Inputs are set before the canvas opens: the iframe covers the testcase inputs while it is shown.
export async function tracedProblem(
  page: Page,
  context: BrowserContext,
  slug: string,
  file: string,
  inputs?: string[],
): Promise<Frame> {
  await usePython(context);
  await openProblem(page, slug);
  await ensureTestcaseOpen(page);
  if (inputs) await setInputs(page, inputs);
  await setCode(page, solution(file));
  const frame = await openTrace(page);
  await traceNow(frame);
  return frame;
}

export async function stepInfo(frame: Frame): Promise<{ k: number; n: number }> {
  const text = (await frame.getByTestId('trace-step').textContent())?.trim() ?? '';
  const m = /^Step (\d+) \/ (\d+)$/.exec(text);
  if (!m) throw new Error(`unexpected step label "${text}"`);
  return { k: Number(m[1]), n: Number(m[2]) };
}

// Keys dispatched on document.body reach keys.ts's window listener like real key presses with nothing focused,
// without moving page focus. Each key gets a task turn, so Preact's microtask render lands before the next one.
export async function pressInPanel(frame: Frame, keys: string[]): Promise<void> {
  await frame.evaluate(async (keys) => {
    (document.activeElement as HTMLElement | null)?.blur();
    for (const key of keys) {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    }
  }, keys);
}

export async function goStep(frame: Frame, i: number): Promise<void> {
  await pressInPanel(frame, ['Home', ...Array<string>(i).fill(']')]);
  await expect(frame.getByTestId('trace-step')).toHaveText(new RegExp(`^Step ${i + 1} / \\d+$`));
}

export async function lastStep(frame: Frame): Promise<void> {
  await pressInPanel(frame, ['End']);
  const { n } = await stepInfo(frame);
  await expect(frame.getByTestId('trace-step')).toHaveText(`Step ${n} / ${n}`);
}

// Steps forward from the current step until an element matching `selector` (and, when given, whose whitespace-collapsed
// text matches `text`) exists. Fails when the last step is reached without one.
export async function stepUntil(frame: Frame, selector: string, text?: RegExp, max = 3000): Promise<void> {
  const found = await frame.evaluate(
    async ({ selector, source, flags, max }) => {
      (document.activeElement as HTMLElement | null)?.blur();
      const re = source === null ? null : new RegExp(source, flags);
      const hit = () =>
        [...document.querySelectorAll(selector)].some(
          (el) => !re || re.test((el.textContent ?? '').replace(/\s+/g, ' ').trim()),
        );
      const label = () => document.querySelector('[data-testid=trace-step]')?.textContent ?? '';
      for (let i = 0; i < max; i++) {
        if (hit()) return true;
        const before = label();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true }));
        await new Promise((r) => setTimeout(r, 0));
        if (label() === before) return hit(); // the last step: nothing further to look at
      }
      return false;
    },
    { selector, source: text?.source ?? null, flags: text?.flags ?? '', max },
  );
  expect(found, `a step shows ${selector}${text ? ` with text ${text}` : ''}`).toBe(true);
}

export type ChipAt = { text: string; idx: string | null; cell: [number, number] | null } | { aside: string } | null;

// Where a pointer chip is drawn: on an element (its value text, its array index, its grid cell) or beside the card.
export async function chipAt(frame: Frame, cardId: string, name: string): Promise<ChipAt> {
  return frame.evaluate(
    ({ cardId, name }) => {
      const key = JSON.stringify(['ptr', cardId, name]);
      const chip = [...document.querySelectorAll<HTMLElement>('[data-sel]')].find((el) => el.dataset.sel === key);
      if (!chip) return null;
      const aside = chip.closest('.lv-nullptr');
      if (aside) return { aside: (aside.textContent ?? '').replace(/\s+/g, ' ').trim() };
      const host = chip.closest<HTMLElement>('.lv-col, .lv-grid-cell, .lv-list-node, .lv-tree-node');
      const text = (host?.querySelector('.lv-slot')?.textContent ?? '').trim();
      const idx = host?.querySelector('.lv-idx')?.textContent?.trim() ?? null;
      const cell: [number, number] | null = host?.classList.contains('lv-grid-cell')
        ? [Number(host.style.gridRow) - 1, Number(host.style.gridColumn) - 1]
        : null;
      return { text, idx, cell };
    },
    { cardId, name },
  );
}
