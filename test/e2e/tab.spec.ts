import { expect, openCanvas, openProblem, test } from './fixtures';

test('the Canvas tab opens a seeded panel on Two Sum and Testcase hides it', async ({ page }) => {
  await openProblem(page, 'two-sum');
  const tab = page.locator('.flexlayout__tabset:has(#testcase_tab) [data-leetvisual-tab]');
  await expect(tab).toHaveCount(1);
  await expect(tab).toHaveText('Canvas');
  const frame = await openCanvas(page);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.flexlayout__tabset[data-leetvisual-active]')).toHaveCount(1);
  await expect(frame.locator('[data-card][data-kind="array"]')).toHaveCount(1);
  await expect(frame.locator('[data-card][data-kind="var"]')).toHaveCount(1);
  await page.locator('#testcase_tab').click();
  await expect(page.locator('iframe[data-leetvisual-frame]')).toBeHidden();
  await expect(tab).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('.flexlayout__tabset[data-leetvisual-active]')).toHaveCount(0);
});

test('Reverse Linked List seeds a list card', async ({ page }) => {
  await openProblem(page, 'reverse-linked-list');
  const frame = await openCanvas(page);
  await expect(frame.locator('[data-card][data-kind="list"]')).toHaveCount(1);
});

// The only test of the ResizeObserver path: happy-dom's ResizeObserver never fires.
// Checked live 2026-10-10: FlexLayout keeps the drag when the pointer crosses into the iframe.
test('the panel follows the testcase splitter when it is dragged across the open canvas', async ({ page }) => {
  await openProblem(page, 'two-sum');
  await openCanvas(page);
  const area = page.locator('.flexlayout__tabset:has(#testcase_tab) > .flexlayout__tabset_content');
  const before = (await area.boundingBox())!;
  const splitter = (await page.locator('[data-layout-path="/c1/s0"]').boundingBox())!;
  const x = splitter.x + splitter.width / 2;
  const y = splitter.y + splitter.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 100, { steps: 10 }); // ends over the iframe
  await page.mouse.up();
  await expect.poll(async () => (await area.boundingBox())!.height).toBeLessThan(before.height - 50);
  const after = (await area.boundingBox())!;
  await expect
    .poll(async () => {
      const b = (await page.locator('iframe[data-leetvisual-frame]').boundingBox())!;
      return Math.max(Math.abs(b.x - after.x), Math.abs(b.y - after.y), Math.abs(b.width - after.width), Math.abs(b.height - after.height));
    })
    .toBeLessThanOrEqual(1);
});
