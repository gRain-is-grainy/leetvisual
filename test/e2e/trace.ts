import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Frame, Page } from '@playwright/test';
import { expect, openCanvas } from './fixtures';

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
