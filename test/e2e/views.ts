import type { Frame, Locator, Page } from '@playwright/test';
import { selKey, type Sel } from '../../src/panel/model/loc';
import { ensureTestcaseOpen, openCanvas, openProblem } from './fixtures';

type XY = { x: number; y: number };

export const bySel = (frame: Frame, sel: Sel): Locator => frame.locator(`[data-sel='${selKey(sel)}']`);

export async function open(page: Page, slug: string): Promise<Frame> {
  await openProblem(page, slug);
  await ensureTestcaseOpen(page);
  return openCanvas(page);
}

export async function center(l: Locator): Promise<XY> {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export async function emptySpot(frame: Frame): Promise<XY> {
  const board = (await frame.getByTestId('board').boundingBox())!;
  const boxes = await Promise.all((await frame.locator('[data-card]').all()).map((l) => l.boundingBox()));
  for (let y = board.y + 12; y < board.y + board.height - 12; y += 24) {
    for (let x = board.x + 12; x < board.x + board.width - 12; x += 24) {
      const free = boxes.every((b) => !b || x < b.x - 4 || x > b.x + b.width + 4 || y < b.y - 4 || y > b.y + b.height + 4);
      if (free) return { x, y };
    }
  }
  throw new Error('no empty spot on the board');
}

export async function drag(page: Page, from: Locator, to: XY): Promise<void> {
  const a = await center(from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

// exact: Playwright matches role names as case-insensitive substrings, so 'Stack' alone also matches 'Call stack'.
export async function addFromMenu(frame: Frame, label: string): Promise<void> {
  await frame.getByTestId('add-menu').click();
  await frame.getByRole('menuitem', { name: label, exact: true }).click();
}

export async function typeInEditor(root: Frame | Locator, text: string): Promise<void> {
  const input = root.locator('input.lv-edit');
  await input.fill(text);
  await input.press('Enter');
}

// Clicks a button that adds an item and opens its editor (push, + item, + key, + local) once per text.
export async function addItems(card: Locator, button: string, texts: string[]): Promise<void> {
  for (const text of texts) {
    await card.getByRole('button', { name: button, exact: true }).click();
    await typeInEditor(card, text);
  }
}
