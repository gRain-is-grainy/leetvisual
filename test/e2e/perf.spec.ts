import { ensureTestcaseOpen, expect, openCanvas, openProblem, test } from './fixtures';
import { cardId, cardOf, frameCount, nextStep, setInputs, slots } from './canvas';

const TREE = `[${Array.from({ length: 127 }, (_, i) => i + 1).join(',')}]`;

test('scrubbing one frame on the largest supported board takes under 16 ms', async ({ page }) => {
  test.setTimeout(240_000);
  await openProblem(page, 'maximum-depth-of-binary-tree');
  await ensureTestcaseOpen(page);
  await setInputs(page, [TREE]);
  const frame = await openCanvas(page);
  const tree = await cardId(cardOf(frame, 'tree', 'root'));
  await expect(slots(frame, tree, 'node')).toHaveCount(127);

  await frame.getByTestId('add-menu').click();
  await frame.getByRole('menuitem', { name: 'Array', exact: true }).click();
  await frame.getByLabel('Length').fill('200');
  await frame.getByLabel('Fill').fill('0');
  await frame.getByLabel('Fill').press('Enter');
  const array = frame.locator('[data-card][data-kind=array]');
  await expect(array).toHaveCount(1);
  const id = await cardId(array);
  await expect(slots(frame, id, 'item')).toHaveCount(200);
  await expect(frame.getByTestId('banner')).toHaveCount(0);

  for (let k = 0; k < 10; k++) {
    await slots(frame, id, 'item').nth(k).evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('F2');
    const input = frame.locator('input.lv-edit');
    await input.fill(String(k + 1));
    await input.press('Enter');
    await expect(input).toHaveCount(0);
    await nextStep(frame);
  }
  expect(await frameCount(frame)).toBe(11);

  const times = await frame.evaluate(async () => {
    const press = (key: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    const settle = () => new Promise<void>((r) => setTimeout(r, 0));
    (document.activeElement as HTMLElement | null)?.blur();
    press('['); // Draft → Step 10; the draft equals Step 10, so this one is not measured
    await settle();
    const out: number[] = [];
    // Step 10 → Step 1 and back. Start is left out: it has no array (see above).
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
  await expect(frame.getByTestId('frame-label')).toHaveText('Step 10');

  const sorted = [...times].sort((a, b) => a - b);
  const median = (sorted[8] + sorted[9]) / 2;
  const max = sorted[sorted.length - 1];
  test.info().annotations.push({ type: 'scrub-ms', description: `median ${median.toFixed(2)} ms, max ${max.toFixed(2)} ms` });
  console.log(`scrub: median ${median.toFixed(2)} ms, max ${max.toFixed(2)} ms`);
  expect(median).toBeLessThan(16);
});
