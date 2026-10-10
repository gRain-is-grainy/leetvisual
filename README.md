# LeetVisual

LeetVisual is an in-development Chrome extension for building and stepping through a LeetCode problem's data structures on the problem page.

LeetVisual is not affiliated with LeetCode.

## Install from source

1. Install Node.js 22.12 or later.
2. Run `npm install`.
3. Run `npm run build`.
4. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select the `dist` folder.

## Develop

| Command | What it does |
|---|---|
| `npm test` | Runs the unit tests (Vitest) |
| `npm run check` | Type-checks the project |
| `npm run build` | Builds the extension into `dist/` |
| `npm run e2e` | Builds, then runs the end-to-end tests (Playwright, headed Chromium) |

Before the first end-to-end run, install the browser with `npx playwright install chromium`. The end-to-end tests open a visible Chromium window and run against the live leetcode.com site while logged out, so they need network access.

## License

MIT. See [LICENSE](LICENSE).
