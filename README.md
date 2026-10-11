# LeetVisual

LeetVisual is a Chrome extension that adds a **Canvas** tab to the testcase panel on leetcode.com problem pages. The canvas is a board of data structures, seeded from the active test case, that you edit by drag and drop or with the keyboard and save as numbered steps. Use it to:

- work an example by hand before you write code, and
- hand-trace your own code after you write it,

without drawing the problem somewhere else.

LeetVisual is not affiliated with LeetCode.

## Features

- **Structures:** arrays, strings, grids, linked lists and binary trees, plus maps, sets, stacks, queues, variables and a call stack.
- **Seeding:** the board starts from the problem's parameter types and the active test case. Each test case, including a custom one, gets its own canvas.
- **Steps:** Next step saves the board as a frame. Move between frames, undo and redo, and continue from any earlier frame. Changes since the previous frame are highlighted.
- **Storage:** canvases are saved per problem and per test case in the extension's local storage (the 100 most recently used, up to 500 frames each). Nothing leaves your browser.
- **Themes:** light and dark follow LeetCode's.

## Install

LeetVisual is not yet in the Chrome Web Store. To install it from source:

1. Install Node.js 22.12 or later.
2. Build the extension:

   ```sh
   npm ci
   npm run build
   ```

3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the `dist/` folder.

## Usage

1. Open a problem on leetcode.com.
2. In the panel with the **Testcase** and **Test Result** tabs, click **Canvas**.
3. The board shows one card per parameter of the active test case. Use the **+ Add** menu for scratch structures.
4. Edit the board, then press **Next step** (or Enter) to save it as a frame. Use the timeline to move between frames.

With the mouse:

- Double-click a value to edit it.
- Drag a value onto a cell, node, map entry, variable or call-frame local to copy it there, or onto a map's "+ key" slot, a set, a stack or a queue to add it. Drag one array cell onto another to swap them.
- Drag a `next`, `left` or `right` handle onto a node, or onto empty space for `null`.
- Drag a pointer onto a cell or node, or off its structure for `null`.
- Click a grid cell to mark or unmark it.
- Drag a card's header to move it, double-click its name to rename it, and click its × to delete it.
- Use an array card's ⋯ menu (**Build as list** or **Build as tree**) to rebuild it as a linked list or a binary tree, for when the problem's types are not available.
- Drag empty space to pan. Use Ctrl+wheel or a trackpad pinch to zoom, and **Fit** to see everything.

### Keys

Keys work while the canvas has focus, so they never reach the code editor.

| Key | Action |
|---|---|
| Enter | Next step (when not editing) |
| Ctrl+Z (Cmd+Z on macOS) | Undo |
| Ctrl+Y or Ctrl+Shift+Z (Cmd+Shift+Z on macOS) | Redo |
| `[` / `]` | Previous / next frame |
| Delete or Backspace | Remove the selected element |
| F2 | Edit the selected value |
| Space | Pick up or drop the selected value, pointer or handle |
| Arrow keys or Tab | While carrying: choose where to drop |
| Esc | Cancel an edit or a drag |
| Arrow keys | Move the selected pointer, move the selected card, or pan when the board is selected |
| M | Mark or unmark the selected grid cell |
| Tab | Move through cards and the elements inside them |

## Development

```sh
npm ci
npx playwright install chromium
```

| Command | What it does |
|---|---|
| `npm run build` | Builds the extension into `dist/` |
| `npm test` | Runs the unit tests (Vitest) |
| `npm run check` | Type-checks the project |
| `npm run e2e` | Builds, then runs the end-to-end tests (Playwright) |

The end-to-end tests load the unpacked extension into Playwright's bundled Chromium and open live leetcode.com pages, logged out, on free problems only. They run headed, because leetcode.com answers headless browsers with a Cloudflare challenge (HTTP 403). Branded Chrome 137 and later ignores `--load-extension`, which is why the tests use Playwright's Chromium.

### Project layout

```
manifest.json      extension manifest, copied into dist/
panel.html         the panel page shown in the iframe
src/content/       content script: LeetCode adapter, Canvas tab, iframe, metadata, theme
src/panel/         panel app: bridge, parse, model, layout, board, views, drag, timeline, store
src/shared/        message types shared by the content script and the panel
test/unit/         Vitest unit tests
test/e2e/          Playwright end-to-end tests
test/fixtures/     hand-written LeetCode DOM and input fixtures
test/helpers/      shared test helpers: boards, in-memory storage, panel and view setup
```

## License

MIT. See [LICENSE](LICENSE).
