# AGENTS.md

Rules for any AI agent (or human) working in this repo. This repo will be public, so treat it as public now.

## 1. Public-Repo Hygiene

Everything committed becomes public when the repo is published, including history. Deleting a file in a later commit does not remove it from history.

- Only these docs are tracked: `README.md`, `AGENTS.md`, and `LICENSE`.
- Everything else stays gitignored: research notes, specs, plans, design docs, scratch files, screenshots, and test output. Keep them in ignored paths such as `docs/`, `notes/`, `scratch/`, or `*.local.md`.
- If you create a new kind of scratch file that `.gitignore` doesn't cover, add the pattern before committing.
- Stage files by name. Never `git add .` or `git add -A` without reading `git status` first.
- Never commit secrets, tokens, `.env` files, or personal data.

## 2. README

The README is for users and contributors, so keep it professional.

- Cover what the project does, how to install and use it, how to develop it, and the license.
- No scratch notes, TODO lists, internal plans, emojis, or marketing fluff.
- Keep it accurate. Update it in the same PR as the change it describes.

## 3. Plan Before Coding

Think through the design before writing code. Choose the efficient approach, not the one that's fastest to type.

- Consider time and memory complexity, bundle size, DOM work, and re-renders.
- State your assumptions and the tradeoffs you considered. If something is unclear, ask.
- Efficient does not mean clever. No speculative abstractions or configurability nobody asked for.

## 4. Tests First

Write tests before implementation, every time.

1. Write a test for the behavior.
2. Run it and confirm it fails for the expected reason.
3. Write the minimum code to make it pass.
4. Refactor with the tests green.

A bug fix starts with a test that reproduces the bug.

Test the edge cases, not just the happy path. For this project, that includes:

- **Inputs:** empty arrays and strings, a single element, `null`/`None`, maximum constraint sizes, negatives, duplicates, unicode.
- **User code:** syntax errors, runtime exceptions, infinite loops, deep recursion, very long traces, mutated inputs, cyclic linked lists, state left over between runs.
- **The page:** SPA navigation between problems, React re-renders removing injected UI, slow or failed loads, light/dark theme switches, multiple tabs, the extension being reloaded mid-session.

## 5. Verify With Playwright

Unit tests are not enough for major changes and features. Verify them end to end in a real browser with Playwright before calling them done.

- Load the unpacked extension with `chromium.launchPersistentContext` and the `--disable-extensions-except` / `--load-extension` flags.
- Check the console for errors and warnings on every run.

When the change touches UI or UX, test at each of these viewport sizes:

| Size | Represents |
|---|---|
| 1024×768 | Half-screen or split window |
| 1280×720 | Small laptop |
| 1366×768 | Common budget laptop |
| 1536×864 | 1080p laptop at 125% scaling |
| 1920×1080 | Full HD desktop |
| 2560×1440 | QHD desktop |

At each size, take a screenshot and look at it. Confirm that:

- Every control is visible, clickable, and keyboard-reachable.
- Nothing overflows, clips, overlaps, or truncates unexpectedly.
- Alignment and spacing are consistent with the surrounding UI.
- Fonts, colors, and spacing match the page's existing style in both light and dark themes.
- The layout holds when LeetCode's resizable panels are made narrow and wide.

## 6. Commits

- Keep commits small: one logical change that touches as few files as possible. If a commit spans many files, split it.
- Every commit should build and pass tests.
- Format: `Added/Removed/Fixed x y z`, on one line, at most 200 characters.
- No `Co-authored-by` trailers and no AI attribution.

## 7. Pull Requests

Keep each PR's scope small. Split a large feature into stacked PRs, where each PR builds on the one below it.

- Branch each layer from the previous layer's branch, and set the PR's base to that branch.
- Merge from the bottom up. After a layer merges, rebase the next layer onto `main` and retarget its PR. `git rebase --update-refs` keeps the rest of the stack in sync.

Write every PR description in GitHub Copilot's PR-summary format. Build it from the actual diff (`git diff -U0 <base>...HEAD`), not from memory.

- **Opening paragraph:** start with "This pull request". Say what changes and what it replaces ("... instead of ..."), then any other notable effects. A stacked PR ends the paragraph with its position: "It is part 2 of 3 of <feature> and is stacked on #12, so merge that first."
- **Groups:** use one bold heading per area of behavior (`**Trace recording:**`), not one per file. `**Tests:**` goes last.
- **Bullets:** each `*` bullet is one or two sentences on what changed and why, with identifiers in backticks. Put long lists of cases in nested bullets.
- **Hunk links:** end each bullet with numbered links to the diff hunks it describes.

```markdown
This pull request <what changes> instead of <what it replaces>. <Other notable effect.> It is part <n> of <m> of <feature> and is stacked on #<pr>, so merge that first.

**<Area of behavior>:**

* `<identifier>` now <does what>, so <why it matters>. [[1]](diffhunk://#diff-<hash>L<start>-R<end>) [[2]](diffhunk://#diff-<hash>R<start>-R<end>)
* `<identifier>` is removed, since <reason>. [[1]](diffhunk://#diff-<hash>L<start>-L<end>)

**Tests:**

* `<test file>` covers these cases:
  * <edge case>
  * <edge case>

  [[1]](diffhunk://#diff-<hash>R1-R<end>)
```

To build a hunk link:

- `<hash>` is the SHA-256 of the file's repo-relative path: `printf '%s' 'src/path/file.ts' | sha256sum`.
- The range comes from each `@@ -a,b +c,d @@` header in `git diff -U0`. A missing count means 1.

| Hunk | Range |
|---|---|
| Lines changed (b > 0, d > 0) | `L<a>-R<c+d-1>` |
| Lines added only (b = 0) | `R<c>-R<c+d-1>` |
| Lines removed only (d = 0) | `L<a>-L<a+b-1>` |
