import type { Theme } from '../shared/messages';

export type Anchor =
  | { kind: 'tabbar'; tabset: HTMLElement; bar: HTMLElement }
  | { kind: 'float'; run: HTMLElement };

const INPUT = '[data-e2e-locator="console-testcase-input"]';
const RUN = '[data-e2e-locator="console-run-button"]';
const RUN_OR_SUBMIT = `${RUN}, [data-e2e-locator="console-submit-button"]`;

export function findTabset(doc: Document): HTMLElement | null {
  return doc.getElementById('testcase_tab')?.closest<HTMLElement>('.flexlayout__tabset') ?? null;
}

export function findAnchor(doc: Document): { anchor: Anchor | null; tried: string[] } {
  const tabset = findTabset(doc);
  const bar = doc.getElementById('testcase_tab')?.closest('.flexlayout__tab_button')?.parentElement;
  if (tabset && bar) return { anchor: { kind: 'tabbar', tabset, bar }, tried: ['testcase tab bar'] };
  const run = doc.querySelector<HTMLElement>(RUN);
  if (run) return { anchor: { kind: 'float', run }, tried: ['testcase tab bar', 'run button'] };
  return { anchor: null, tried: ['testcase tab bar', 'run button'] };
}

export function findPanelArea(tabset: HTMLElement): HTMLElement | null {
  const content = tabset.querySelector<HTMLElement>(':scope > .flexlayout__tabset_content');
  if (content) return content;
  const path = tabset.getAttribute('data-layout-path');
  return path ? tabset.ownerDocument.querySelector<HTMLElement>(`[data-layout-path="${path}/t0"]`) : null;
}

export function pageShowsProblem(doc: Document): boolean {
  return doc.querySelector(INPUT) !== null;
}

export function readInputs(doc: Document, count: number | null): string[] | null {
  const inputs = [...doc.querySelectorAll(INPUT)];
  if (inputs.length) return inputs.map((el) => el.textContent ?? '');
  const path = findTabset(doc)?.getAttribute('data-layout-path');
  const scope = (path && doc.querySelector(`[data-layout-path="${path}/t0"]`)) || doc;
  const lines = [...scope.querySelectorAll('.cm-editor .cm-line')].map((el) => el.textContent ?? '');
  return lines.length ? lines.slice(0, count ?? lines.length) : null;
}

export function readTheme(doc: Document): Theme {
  return doc.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function readSlug(pathname: string): string | null {
  return /^\/problems\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

export function selectedTab(tabset: HTMLElement): string | null {
  return tabset.querySelector('.flexlayout__tab_button--selected')?.getAttribute('data-layout-path') ?? null;
}

export function isRunButton(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(RUN_OR_SUBMIT) !== null;
}

// LeetCode's Run and Submit shortcuts. Logged out they do nothing, so only a logged-in session can check them live.
export function isRunShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && (e.key === "'" || e.key === 'Enter');
}
