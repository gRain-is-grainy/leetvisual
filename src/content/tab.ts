import type { Anchor } from './adapter';

export const TAB_ATTR = 'data-leetvisual-tab';
export const DIVIDER_ATTR = 'data-leetvisual-divider';
export const FLOAT_ATTR = 'data-leetvisual-float';
export const STYLE_ATTR = 'data-leetvisual-style';
export const ACTIVE_ATTR = 'data-leetvisual-active';

// The .medium/.normal/svg rules copy LeetCode's own unselected-tab rules (its FlexLayout theme hooks, not Tailwind),
// so the muted tab looks unselected without changing width.
const CSS = `
[${TAB_ATTR}] { cursor: pointer; user-select: none; }
[${TAB_ATTR}]:focus-visible { outline: 2px solid #007aff; outline-offset: -2px; }
html.light [${TAB_ATTR}][aria-selected="true"] { color: rgb(26, 26, 26); font-weight: 500; }
html.dark [${TAB_ATTR}][aria-selected="true"] { color: rgb(245, 245, 245); font-weight: 500; }
html.light .flexlayout__tabset[${ACTIVE_ATTR}] .flexlayout__tab_button--selected { color: rgba(0, 0, 0, 0.55); font-weight: 400; }
html.dark .flexlayout__tabset[${ACTIVE_ATTR}] .flexlayout__tab_button--selected { color: rgba(255, 255, 255, 0.6); font-weight: 400; }
.flexlayout__tabset[${ACTIVE_ATTR}] .flexlayout__tab_button--selected .medium { opacity: 0; }
.flexlayout__tabset[${ACTIVE_ATTR}] .flexlayout__tab_button--selected .normal { display: block; }
.flexlayout__tabset[${ACTIVE_ATTR}] .flexlayout__tab_button--selected .flexlayout__tab_button_content svg { opacity: 0.4; }
[${FLOAT_ATTR}] { margin-left: 8px; padding: 4px 10px; border: 0; border-radius: 6px; font: inherit; font-size: 14px; cursor: pointer; background: rgba(0, 0, 0, 0.06); color: rgb(38, 38, 38); }
html.dark [${FLOAT_ATTR}] { background: rgba(255, 255, 255, 0.1); color: rgb(245, 245, 245); }
[${FLOAT_ATTR}][aria-pressed="true"] { font-weight: 500; }
`;

const stop = (e: Event) => e.stopPropagation();

function createTab(doc: Document, onActivate: () => void): HTMLElement {
  const tab = doc.createElement('div');
  tab.setAttribute(TAB_ATTR, '');
  tab.className = 'flexlayout__tab_button flexlayout__tab_button_top flexlayout__tab_button--unselected';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.tabIndex = 0;
  const label = doc.createElement('div');
  label.className = 'flexlayout__tab_button_content';
  label.textContent = 'Canvas';
  tab.append(label);
  tab.addEventListener('pointerdown', stop);
  tab.addEventListener('mousedown', stop);
  tab.addEventListener('click', (e) => {
    e.stopPropagation();
    onActivate();
  });
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    onActivate();
  });
  return tab;
}

function createFloat(doc: Document, onActivate: () => void): HTMLElement {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.setAttribute(FLOAT_ATTR, '');
  btn.setAttribute('aria-pressed', 'false');
  btn.textContent = 'Canvas';
  btn.addEventListener('pointerdown', stop);
  btn.addEventListener('mousedown', stop);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onActivate();
  });
  return btn;
}

export function ensureTab(anchor: Anchor, onActivate: () => void): HTMLElement {
  if (anchor.kind === 'tabbar') {
    const here = anchor.bar.querySelector<HTMLElement>(`:scope > [${TAB_ATTR}]`);
    if (here) return here;
  } else if (anchor.run.nextElementSibling?.hasAttribute(FLOAT_ATTR)) {
    return anchor.run.nextElementSibling as HTMLElement;
  }
  const doc = (anchor.kind === 'tabbar' ? anchor.bar : anchor.run).ownerDocument;
  doc.querySelectorAll(`[${TAB_ATTR}], [${DIVIDER_ATTR}], [${FLOAT_ATTR}]`).forEach((el) => el.remove());
  if (anchor.kind === 'tabbar') {
    const divider = doc.createElement('div');
    divider.className = 'flexlayout__tabset_tab_divider';
    divider.setAttribute(DIVIDER_ATTR, '');
    const tab = createTab(doc, onActivate);
    anchor.bar.append(divider, tab);
    return tab;
  }
  const btn = createFloat(doc, onActivate);
  anchor.run.after(btn);
  return btn;
}

export function ensureStyle(doc: Document): void {
  if (doc.querySelector(`style[${STYLE_ATTR}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(STYLE_ATTR, '');
  style.textContent = CSS;
  doc.head.append(style);
}

export function setSelected(tab: HTMLElement, tabset: HTMLElement | null, on: boolean): void {
  tab.setAttribute(tab.hasAttribute(FLOAT_ATTR) ? 'aria-pressed' : 'aria-selected', String(on));
  tabset?.toggleAttribute(ACTIVE_ATTR, on);
}

export function noAnchorWarning(tried: string[]): string {
  return `LeetVisual: no place for the Canvas tab (tried ${tried.join(', ')}).`;
}

export function removeAll(doc: Document): void {
  doc.querySelectorAll(`[${TAB_ATTR}], [${DIVIDER_ATTR}], [${FLOAT_ATTR}], style[${STYLE_ATTR}]`).forEach((el) => el.remove());
  doc.querySelectorAll(`[${ACTIVE_ATTR}]`).forEach((el) => el.removeAttribute(ACTIVE_ATTR));
}
