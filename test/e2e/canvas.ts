import type { Frame, Locator, Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, openCanvas, openProblem } from './fixtures';

type SlotKind = 'item' | 'node' | 'key' | 'val' | 'cell';

export const key = (...parts: (string | number)[]): string => JSON.stringify(parts);

export const bySel = (frame: Frame, ...parts: (string | number)[]): Locator =>
  frame.locator(`[data-sel='${key(...parts)}']`);

export const byDrop = (frame: Frame, ...parts: (string | number)[]): Locator =>
  frame.locator(`[data-drop='${key(...parts)}']`);

export const slots = (frame: Frame, id: string, k: SlotKind): Locator =>
  frame.locator(`[data-sel^='["val","${id}","${k}",']`);

export async function texts(frame: Frame, id: string, k: SlotKind): Promise<string[]> {
  return (await slots(frame, id, k).allTextContents()).map((t) => t.trim());
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = (text: string): RegExp => new RegExp(`^${escapeRe(text)}$`);

export const cardOf = (frame: Frame, kind: string, name: string): Locator =>
  frame
    .locator(`[data-card][data-kind="${kind}"]`)
    .filter({ has: frame.locator('[data-testid=card-name]', { hasText: exact(name) }) });

export async function cardId(card: Locator): Promise<string> {
  const id = await card.getAttribute('data-card');
  if (!id) throw new Error('card has no data-card attribute');
  return id;
}

export async function numsOf(frame: Frame): Promise<string[]> {
  return texts(frame, await cardId(cardOf(frame, 'array', 'nums')), 'item');
}

export async function editSlot(frame: Frame, slot: Locator, text: string): Promise<void> {
  await slot.dblclick();
  const input = frame.locator('input.lv-edit');
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(slot).toHaveText(text);
}

export async function frameCount(frame: Frame): Promise<number> {
  return Number(await frame.getByTestId('scrubber').getAttribute('max'));
}

export async function nextStep(frame: Frame): Promise<void> {
  const before = await frameCount(frame);
  await frame.getByTestId('next-step').click();
  await expect.poll(() => frameCount(frame)).toBe(before + 1);
}

export async function hideCanvas(page: Page): Promise<void> {
  await page.locator('#testcase_tab').click();
  await expect(page.locator('iframe[data-leetvisual-frame]')).toBeHidden();
}

export async function setInputs(page: Page, values: string[]): Promise<void> {
  const boxes = page.locator('[data-e2e-locator="console-testcase-input"]');
  await expect(boxes).toHaveCount(values.length);
  for (const [i, v] of values.entries()) {
    await boxes.nth(i).fill(v);
    await expect(boxes.nth(i)).toHaveText(v);
  }
}

export const caseTag = (page: Page, i: number): Locator =>
  page.locator('[data-e2e-locator="console-testcase-tag"]').nth(i);

export async function twoSum(page: Page): Promise<Frame> {
  await openProblem(page, 'two-sum');
  await ensureTestcaseOpen(page);
  return openCanvas(page);
}

export async function expectNoOverlap(frame: Frame): Promise<void> {
  const rects = await frame.locator('[data-card]').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-card'), x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  for (const r of rects) expect(r.w * r.h, `card ${r.id} has a size`).toBeGreaterThan(0);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      expect(apart, `cards ${a.id} and ${b.id} overlap`).toBe(true);
    }
  }
}

export async function cycleTo(frame: Frame, dropKey: string, max = 50): Promise<void> {
  await expect(frame.getByTestId('kb-drag')).toBeVisible();
  for (let i = 0; i < max; i++) {
    if (await frame.locator(`.lv-drop-target[data-drop='${dropKey}']`).count()) return;
    await frame.page().keyboard.press('ArrowRight');
  }
  throw new Error(`keyboard drag never reached ${dropKey}`);
}

export async function panelGap(page: Page): Promise<number> {
  const area = await page.locator('.flexlayout__tabset:has(#testcase_tab) > .flexlayout__tabset_content').boundingBox();
  const box = await page.locator('iframe[data-leetvisual-frame]').boundingBox();
  if (!area || !box) return Infinity;
  return Math.max(
    Math.abs(box.x - area.x),
    Math.abs(box.y - area.y),
    Math.abs(box.width - area.width),
    Math.abs(box.height - area.height),
  );
}

type Want = { sel: string; text?: string };

export async function tabTo(frame: Frame, want: Want, max = 200): Promise<void> {
  const keyboard = frame.page().keyboard;
  for (let i = 0; i < max; i++) {
    const state = await frame.evaluate(({ sel, text }) => {
      const matches = (el: Element | null) =>
        !!el && el.matches(sel) && (text === undefined || el.textContent?.trim() === text);
      const el = document.activeElement;
      if (matches(el)) return 'hit';
      const target = [...document.querySelectorAll(sel)].find((t) => matches(t));
      if (!target || !el || el === document.body) return 'Tab';
      return el.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_PRECEDING ? 'Shift+Tab' : 'Tab';
    }, want);
    if (state === 'hit') return;
    await keyboard.press(state);
  }
  throw new Error(`Tab never reached ${want.sel}${want.text ? ` "${want.text}"` : ''} in ${max} presses`);
}

export async function focusBeforeCanvasTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    const all = [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].filter(
      (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0,
    );
    const i = all.findIndex((el) => el.hasAttribute('data-leetvisual-tab'));
    if (i < 1) throw new Error('no focusable element before the Canvas tab');
    all[i - 1].focus();
  });
}
