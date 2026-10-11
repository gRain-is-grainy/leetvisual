import type { Frame, Page } from '@playwright/test';
import { ensureTestcaseOpen, expect, test, VIEWPORTS } from './fixtures';
import { addFromMenu, addItems, bySel, center, drag, open, typeInEditor } from './views';

type Case = {
  name: string;
  slug: string;
  setup?: (page: Page, frame: Frame) => Promise<void>; // once, before the screenshots
  show?: (frame: Frame) => Promise<void>; // before each screenshot, since the fit click closes the Add menu
};

const cell = (r: number, c: number) => ({ t: 'val' as const, at: { s: 's1', k: 'cell' as const, r, c } });
const node = (n: string) => ({ t: 'val' as const, at: { s: 's1', k: 'node' as const, n } });

const CASES: Case[] = [
  {
    // A mark from the last frame, a new (highlighted) mark and a new pointer chip.
    name: 'grid',
    slug: 'number-of-islands',
    setup: async (_page, frame) => {
      await bySel(frame, cell(0, 1)).click();
      await expect(bySel(frame, cell(0, 1))).toHaveClass(/lv-marked/);
      await frame.getByTestId('next-step').click();
      await bySel(frame, cell(0, 0)).click();
      await expect(bySel(frame, cell(0, 0))).toHaveClass(/lv-marked/);
      await frame.locator('[data-kind=grid]').getByRole('button', { name: 'Add pointer', exact: true }).click();
    },
  },
  {
    // The tail's next dropped on n2 (Linked List Cycle by hand) gives a back arrow under the row.
    name: 'list',
    slug: 'reverse-linked-list',
    setup: async (page, frame) => {
      await drag(page, bySel(frame, { t: 'link', s: 's1', n: 'n5', side: 'next' }), await center(bySel(frame, node('n2'))));
      await expect(frame.locator('path.lv-arrow-back')).toHaveCount(1);
    },
  },
  {
    // A second pointer on the root (stacked chips) and the leaf 7's left dropped on the root (a back edge).
    name: 'tree',
    slug: 'maximum-depth-of-binary-tree',
    setup: async (page, frame) => {
      await frame.locator('[data-kind=tree]').getByRole('button', { name: 'Add pointer', exact: true }).click();
      await drag(page, bySel(frame, { t: 'link', s: 's1', n: 'n5', side: 'left' }), await center(bySel(frame, node('n1'))));
      await expect(frame.locator('path.lv-edge-back')).toHaveCount(1);
    },
  },
  {
    name: 'containers',
    slug: 'two-sum',
    setup: async (_page, frame) => {
      const card = (kind: string) => frame.locator(`[data-kind=${kind}]`);
      // Add and fill each card in turn: a new card is placed by the sizes of the cards already there, and the
      // board doesn't move cards when one grows, so cards added empty and filled later overlap.
      // Fit before filling: the cards grow as items go in, and a click needs its card in view.
      const fill = async (label: string, kind: string, button: string, texts: string[]) => {
        await addFromMenu(frame, label);
        await frame.getByTestId('fit').click();
        await addItems(card(kind), button, texts);
      };
      await fill('Map', 'map', 'Add entry', ['2', '7']);
      for (const [i, v] of ['0', '1'].entries()) {
        await card('map').locator('.lv-map-row').nth(i).locator('.lv-slot').nth(1).dblclick();
        await typeInEditor(card('map'), v);
      }
      await fill('Set', 'set', 'Add item', ['4', '9']);
      await fill('Stack', 'stack', 'Push', ['1', '2']);
      await fill('Queue', 'queue', 'Enqueue', ['1', '2']);
      await fill('Call stack', 'calls', 'Add local', ['i']);
      await card('calls').locator('.lv-local .lv-slot').nth(1).dblclick();
      await typeInEditor(card('calls'), '0');
      await card('calls').getByRole('button', { name: 'Push frame', exact: true }).click();
    },
  },
  { name: 'add-menu', slug: 'two-sum', show: (frame) => frame.getByTestId('add-menu').click() },
  { name: 'card-menu', slug: 'two-sum', show: (frame) => frame.getByRole('button', { name: 'nums menu', exact: true }).click() },
];

for (const c of CASES) {
  test(`ui: ${c.name}`, async ({ page }) => {
    const frame = await open(page, c.slug);
    await frame.getByTestId('fit').click();
    await c.setup?.(page, frame);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(frame.locator('html')).toHaveAttribute('data-theme', theme);
      for (const { w, h } of VIEWPORTS) {
        await page.setViewportSize({ width: w, height: h });
        await ensureTestcaseOpen(page);
        await frame.getByTestId('fit').click();
        await c.show?.(frame);
        // Clear hover in both documents (as ui-board does): each keeps its last hovered element while the pointer is in the other.
        await frame.getByTestId('zoom-level').hover();
        await page.mouse.move(0, 0);
        await page.screenshot({ path: `test-results/ui/${c.name}-${w}x${h}-${theme}.png` });
        // Both menus close on Esc (focus is inside them); the card menu would otherwise stay open.
        if (c.show) await page.keyboard.press('Escape');
      }
    }
  });
}
