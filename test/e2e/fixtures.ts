import { test as base, chromium, expect, type BrowserContext, type ConsoleMessage, type Frame, type Page } from '@playwright/test';
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

export const test = base.extend<{ extDir: string; context: BrowserContext; page: Page; extErrors: string[]; foreground: boolean }>({
  foreground: [true, { option: true }],
  // The unpacked extension to load. A spec can point it at a modified copy of dist/ with test.use({ extDir }).
  extDir: [DIST, { option: true }],
  context: async ({ extDir }, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    });
    await use(context);
    await context.close();
  },
  page: async ({ context, foreground }, use, testInfo) => {
    const page = context.pages()[0] ?? (await context.newPage());
    // Windows activates a background-launched window late, after the first click in the iframe, which blurs the iframe mid-test.
    // But after Page.bringToFront, focus moved from the top page (iframe.focus(), contentWindow.focus(), Tab) never enters the cross-origin
    // panel iframe, while focus() inside the panel frame still works, so specs that move focus from the page into the panel opt out.
    if (foreground) {
      await page.bringToFront();
      await expect
        .poll(() => page.evaluate(() => document.hasFocus()), {
          message: 'Chromium window never became the OS foreground window (leave the desktop alone during headed runs)',
        })
        .toBe(true);
    }
    await use(page);
    // The Defect loop reads this. A page that has already crashed or closed has nothing to show.
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({ path: testInfo.outputPath('failure.png') }).catch(() => {});
    }
  },
  extErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      const onConsole = (msg: ConsoleMessage) => {
        // The text check catches what Chrome logs against the page about the extension (blocked loads, postMessage origin mismatches).
        const fromExt = msg.location().url.startsWith('chrome-extension://') || msg.text().includes('chrome-extension://');
        if ((msg.type() === 'error' || msg.type() === 'warning') && fromExt) {
          errors.push(`${msg.type()}: ${msg.text()} (${msg.location().url})`);
        }
      };
      const watch = (page: Page) => {
        page.on('console', onConsole);
        // Console output from a dedicated worker goes to its Worker object, not to the page.
        page.workers().forEach((w) => w.on('console', onConsole));
        page.on('worker', (w) => w.on('console', onConsole));
        page.on('pageerror', (err) => {
          if (`${err.message}
${err.stack}`.includes('chrome-extension://')) errors.push(`pageerror: ${err.message}`);
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

export async function extensionId(page: Page): Promise<string> {
  const iframe = page.locator('iframe[data-leetvisual-frame]');
  if (!(await iframe.count())) await openCanvas(page);
  return new URL((await iframe.getAttribute('src'))!).host;
}
