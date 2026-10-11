import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { DEFAULT_CAPS, type Job } from '../../src/panel/trace/raw';
import { hideCanvas } from './canvas';
import { expect, extensionId, openCanvas, openProblem, test } from './fixtures';

const TWO_SUM: Job = {
  code: [
    'class Solution:',
    '    def twoSum(self, nums: List[int], target: int) -> List[int]:',
    '        seen = {}',
    '        for i, n in enumerate(nums):',
    '            if target - n in seen:',
    '                return [seen[target - n], i]',
    '            seen[n] = i',
    '',
  ].join('\n'),
  slug: 'two-sum',
  meta: {
    name: 'twoSum',
    params: [
      { name: 'nums', type: 'integer[]' },
      { name: 'target', type: 'integer' },
    ],
    return: { type: 'integer[]' },
  },
  inputs: ['[2,7,11,15]', '9'],
  caps: DEFAULT_CAPS,
};

type Ran = { ready: unknown; end: unknown; steps: number; ret: unknown };

// Starts the bundled worker in an extension-origin document and runs one job. Not panel.html: opened as a top-level
// page it would post `ready` to itself with a LeetCode target origin and log an error.
async function runInExtension(page: Page, job: Job): Promise<Ran> {
  await openProblem(page, 'two-sum');
  const id = await extensionId(page);
  const ext = await page.context().newPage();
  await ext.goto(`chrome-extension://${id}/manifest.json`);
  return ext.evaluate(async (job) => {
    const worker = new Worker('/assets/py.worker.js', { type: 'module' });
    const next = () =>
      new Promise<any>((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error(e.message || 'worker error'));
      });
    worker.postMessage({ type: 'init', base: `${location.origin}/pyodide/` });
    const ready = await next();
    if (ready.type !== 'ready') throw new Error(`worker init failed: ${JSON.stringify(ready)}`);
    worker.postMessage({ type: 'run', id: 1, job });
    const done = await next();
    worker.terminate();
    if (done.type !== 'done') throw new Error(`worker run failed: ${JSON.stringify(done)}`);
    const steps = done.result.steps;
    return { ready, end: done.result.end, steps: steps.length, ret: steps[steps.length - 1]?.board.structs['t:#return'] ?? null };
  }, job);
}

async function usePython3(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => localStorage.setItem('global_lang', '"python3"'));
}

async function waitForPython3(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as any).monaco?.editor.getEditors().some((e: any) => e.getModel()?.getLanguageId() === 'python3'),
    null,
    { timeout: 30_000 },
  );
}

const editorCode = (page: Page) => page.evaluate(() => (window as any).monaco.editor.getEditors()[0].getModel().getValue() as string);

const lit = (page: Page) =>
  page.evaluate(() =>
    (window as any).monaco.editor
      .getEditors()[0]
      .getModel()
      .getAllDecorations()
      .filter((d: any) => d.options.className === 'lv-line' || d.options.className === 'lv-line-err')
      .map((d: any) => [d.range.startLineNumber, d.options.className]),
  );

test('the bundled worker restores the snapshot and traces Two Sum', async ({ page }) => {
  test.setTimeout(120_000);
  const ran = await runInExtension(page, TWO_SUM);
  expect(ran.ready).toEqual({ type: 'ready', snapshot: true });
  expect(ran.end).toEqual({ kind: 'return', value: '[0, 1]' });
  expect(ran.steps).toBeGreaterThan(3);
  expect(ran.ret).toMatchObject({ id: 't:#return', kind: 'array', name: 'return', items: ['0', '1'] });
});

test.describe('without a snapshot', () => {
  const PLAIN = path.resolve('test-results/dist-no-snapshot');
  test.use({ extDir: PLAIN });
  test.beforeAll(() => {
    rmSync(PLAIN, { recursive: true, force: true });
    cpSync(path.resolve('dist'), PLAIN, { recursive: true });
    rmSync(path.join(PLAIN, 'pyodide', 'snapshot.bin'));
  });

  test('the worker loads Pyodide plainly and still traces Two Sum', async ({ page }) => {
    test.setTimeout(120_000);
    const ran = await runInExtension(page, TWO_SUM);
    expect(ran.ready).toEqual({ type: 'ready', snapshot: false });
    expect(ran.end).toEqual({ kind: 'return', value: '[0, 1]' });
  });
});

test('getCode returns the editor code and its language through the content script', async ({ page, context }) => {
  await usePython3(context);
  await openProblem(page, 'two-sum');
  await waitForPython3(page);
  const code = await editorCode(page);
  const frame = await openCanvas(page);
  const reply = await frame.evaluate(
    () =>
      new Promise((resolve) => {
        addEventListener('message', (e) => {
          if (e.data?.type === 'code') resolve(e.data);
        });
        parent.postMessage({ type: 'getCode' }, 'https://leetcode.com');
      }),
  );
  expect(reply).toEqual({ type: 'code', code, lang: 'python3' });
  expect(code).toContain('def twoSum');
});

test('a line message tints that line, hiding the canvas clears it, showing restores it and an edit clears it', async ({ page, context }) => {
  await usePython3(context);
  await openProblem(page, 'two-sum');
  await waitForPython3(page);
  const frame = await openCanvas(page);
  const line = (n: number, err?: true) =>
    frame.evaluate(([n, err]) => parent.postMessage({ type: 'line', line: n, ...(err ? { err } : {}) }, 'https://leetcode.com'), [n, err] as const);

  await line(2);
  await expect.poll(() => lit(page)).toEqual([[2, 'lv-line']]);
  await expect(page.locator('.monaco-editor .view-overlays .lv-line')).toHaveCSS('background-color', 'rgba(0, 122, 255, 0.14)');
  await line(1, true);
  await expect.poll(() => lit(page)).toEqual([[1, 'lv-line-err']]);

  await hideCanvas(page);
  await expect.poll(() => lit(page)).toEqual([]);
  await page.locator('[data-leetvisual-tab]').click();
  await expect.poll(() => lit(page)).toEqual([[1, 'lv-line-err']]);

  await page.evaluate(() => (window as any).monaco.editor.getEditors()[0].getModel().applyEdits([{ range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 1 }, text: '#' }]));
  await expect.poll(() => lit(page)).toEqual([]);
});
