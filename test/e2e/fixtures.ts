import { test as base, chromium, expect, type BrowserContext, type Frame, type Page } from '@playwright/test';
import path from 'node:path';

const DIST = path.resolve('dist');

export { expect };

export const VIEWPORTS = [
  { w: 1024, h: 768 },
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1536, h: 864 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
];

export const test = base.extend<{ context: BrowserContext; page: Page; extErrors: string[] }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    await use(context.pages()[0] ?? (await context.newPage()));
  },
  extErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      const watch = (page: Page) => {
        page.on('console', (msg) => {
          // The text check catches what Chrome logs against the page about the extension (blocked loads, postMessage origin mismatches).
          const fromExt = msg.location().url.startsWith('chrome-extension://') || msg.text().includes('chrome-extension://');
          if ((msg.type() === 'error' || msg.type() === 'warning') && fromExt) {
            errors.push(`${msg.type()}: ${msg.text()} (${msg.location().url})`);
          }
        });
        page.on('pageerror', (err) => {
          if (`${err.message}\n${err.stack}`.includes('chrome-extension://')) errors.push(`pageerror: ${err.message}`);
        });
      };
      context.pages().forEach(watch);
      context.on('page', watch);
      await use(errors);
      expect(errors, 'console errors or warnings from the extension').toEqual([]);
    },
    { auto: true },
  ],
});

export async function openProblem(page: Page, slug: string): Promise<void> {
  await page.goto(`https://leetcode.com/problems/${slug}/`);
  await page.locator('#testcase_tab').waitFor();
}

const testcaseContent = (page: Page) => page.locator('.flexlayout__tabset:has(#testcase_tab) > .flexlayout__tabset_content');

export async function ensureTestcaseOpen(page: Page): Promise<void> {
  const height = async () => (await testcaseContent(page).boundingBox())?.height ?? 0;
  if ((await height()) >= 200) return;
  const box = await page.locator('[data-layout-path="/c1/s0"]').boundingBox();
  if (!box) throw new Error('testcase splitter [data-layout-path="/c1/s0"] not found');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, Math.max(160, y - 360), { steps: 12 });
  await page.mouse.up();
  await expect.poll(height).toBeGreaterThanOrEqual(200);
}

export async function panel(page: Page): Promise<Frame> {
  const handle = await page.waitForSelector('iframe[data-leetvisual-frame]', { state: 'attached' });
  const frame = await handle.contentFrame();
  if (!frame) throw new Error('the LeetVisual iframe has no frame');
  return frame;
}

export async function openCanvas(page: Page): Promise<Frame> {
  await ensureTestcaseOpen(page);
  await page.locator('[data-leetvisual-tab]').click();
  await expect(page.locator('iframe[data-leetvisual-frame]')).toBeVisible();
  return panel(page);
}
