// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findAnchor, type Anchor } from '../../../src/content/adapter';
import { ensureStyle, ensureTab, noAnchorWarning, removeAll, setSelected } from '../../../src/content/tab';
import { loadFixture } from '../../fixtures/load';

const tabs = () => document.querySelectorAll('[data-leetvisual-tab]');
const anchor = () => findAnchor(document).anchor!;

beforeEach(() => loadFixture());

describe('ensureTab in the tab bar', () => {
  it('adds one Canvas tab after a divider and the LeetCode tabs, with tab semantics', () => {
    const tab = ensureTab(anchor(), () => {});
    expect(tabs()).toHaveLength(1);
    const divider = tab.previousElementSibling!;
    expect(divider.className).toBe('flexlayout__tabset_tab_divider');
    expect(divider.hasAttribute('data-leetvisual-divider')).toBe(true);
    expect(divider.previousElementSibling?.querySelector('#result_tab')).not.toBeNull();
    expect(tab.getAttribute('role')).toBe('tab');
    expect(tab.tabIndex).toBe(0);
    expect(tab.getAttribute('aria-selected')).toBe('false');
    expect(tab.classList.contains('flexlayout__tab_button')).toBe(true);
    expect(tab.textContent).toBe('Canvas');
  });

  it('is idempotent and never duplicates', () => {
    const first = ensureTab(anchor(), () => {});
    expect(ensureTab(anchor(), () => {})).toBe(first);
    expect(tabs()).toHaveLength(1);
  });

  it('re-adds the tab after React removes it or replaces the tab bar', () => {
    ensureTab(anchor(), () => {}).remove();
    ensureTab(anchor(), () => {});
    expect(tabs()).toHaveLength(1);
    expect(document.querySelectorAll('[data-leetvisual-divider]')).toHaveLength(1);
    const a = anchor() as Extract<Anchor, { kind: 'tabbar' }>;
    const fresh = a.bar.cloneNode(true) as HTMLElement;
    fresh.querySelectorAll('[data-leetvisual-tab], [data-leetvisual-divider]').forEach((el) => el.remove());
    a.bar.replaceWith(fresh);
    ensureTab(anchor(), () => {});
    expect(tabs()).toHaveLength(1);
    expect(fresh.contains(tabs()[0])).toBe(true);
  });

  it('activates on click, Enter and Space without reaching LeetCode handlers', () => {
    const onActivate = vi.fn();
    const tab = ensureTab(anchor(), onActivate);
    const barHandler = vi.fn();
    tab.parentElement!.addEventListener('click', barHandler);
    tab.parentElement!.addEventListener('pointerdown', barHandler);
    tab.click();
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onActivate).toHaveBeenCalledTimes(3);
    expect(barHandler).not.toHaveBeenCalled();
  });
});

describe('floating button fallback', () => {
  it('goes next to the run button and is replaced by the tab when the tab bar returns', () => {
    const bar = document.querySelector('[data-layout-path="/c1/ts1"]')!;
    const parent = bar.parentElement!;
    bar.remove();
    const onActivate = vi.fn();
    const btn = ensureTab(anchor(), onActivate);
    expect(btn.hasAttribute('data-leetvisual-float')).toBe(true);
    expect(btn.previousElementSibling?.getAttribute('data-e2e-locator')).toBe('console-run-button');
    expect(ensureTab(anchor(), onActivate)).toBe(btn);
    btn.click();
    expect(onActivate).toHaveBeenCalledTimes(1);
    parent.prepend(bar);
    ensureTab(anchor(), onActivate);
    expect(document.querySelectorAll('[data-leetvisual-float]')).toHaveLength(0);
    expect(tabs()).toHaveLength(1);
  });

  it('names the chain levels it tried when both fail', () => {
    expect(noAnchorWarning(['testcase tab bar', 'run button'])).toBe(
      'LeetVisual: no place for the Canvas tab (tried testcase tab bar, run button).',
    );
  });
});

describe('selection, style and removal', () => {
  it('marks the tab selected and mutes LeetCode tabs through the tabset attribute', () => {
    const a = anchor() as Extract<Anchor, { kind: 'tabbar' }>;
    const tab = ensureTab(a, () => {});
    setSelected(tab, a.tabset, true);
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(a.tabset.hasAttribute('data-leetvisual-active')).toBe(true);
    expect(document.querySelector('[data-layout-path="/c1/ts1/tb0"]')!.className).toContain('flexlayout__tab_button--selected');
    setSelected(tab, a.tabset, false);
    expect(tab.getAttribute('aria-selected')).toBe('false');
    expect(a.tabset.hasAttribute('data-leetvisual-active')).toBe(false);
  });

  it('uses aria-pressed on the floating button', () => {
    document.querySelector('[data-layout-path="/c1/ts1"]')!.remove();
    const btn = ensureTab(anchor(), () => {});
    setSelected(btn, null, true);
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('injects one style with the selected look and the muting rule for both themes', () => {
    ensureStyle(document);
    ensureStyle(document);
    const styles = document.querySelectorAll('style[data-leetvisual-style]');
    expect(styles).toHaveLength(1);
    const css = styles[0].textContent!;
    expect(css).toContain('html.light .flexlayout__tabset[data-leetvisual-active] .flexlayout__tab_button--selected { color: rgba(0, 0, 0, 0.55)');
    expect(css).toContain('html.dark .flexlayout__tabset[data-leetvisual-active] .flexlayout__tab_button--selected { color: rgba(255, 255, 255, 0.6)');
    expect(css).toContain('html.dark [data-leetvisual-tab][aria-selected="true"] { color: rgb(245, 245, 245)');
  });

  it("mutes the selected tab's label and icon with LeetCode's own unselected rules, so it keeps its width", () => {
    ensureStyle(document);
    const css = document.querySelector('style[data-leetvisual-style]')!.textContent!;
    expect(css).toContain('.flexlayout__tabset[data-leetvisual-active] .flexlayout__tab_button--selected .medium { opacity: 0; }');
    expect(css).toContain('.flexlayout__tabset[data-leetvisual-active] .flexlayout__tab_button--selected .normal { display: block; }');
    expect(css).toContain('.flexlayout__tabset[data-leetvisual-active] .flexlayout__tab_button--selected .flexlayout__tab_button_content svg { opacity: 0.4; }');
  });

  it("gives the Canvas label the 20px line height of LeetCode's tab labels, so they share a baseline", () => {
    ensureStyle(document);
    const css = document.querySelector('style[data-leetvisual-style]')!.textContent!;
    expect(css).toContain('[data-leetvisual-tab] { cursor: pointer; user-select: none; line-height: 20px; }');
  });

  it('removeAll takes out the tab, the floating button, the style and the attribute', () => {
    const a = anchor() as Extract<Anchor, { kind: 'tabbar' }>;
    const tab = ensureTab(a, () => {});
    ensureStyle(document);
    setSelected(tab, a.tabset, true);
    removeAll(document);
    expect(
      document.querySelectorAll('[data-leetvisual-tab], [data-leetvisual-divider], [data-leetvisual-float], style[data-leetvisual-style], [data-leetvisual-active]'),
    ).toHaveLength(0);
  });
});

describe('ensureStyle', () => {
  it('carries the trace highlight colours for both themes', () => {
    ensureStyle(document);
    const css = document.querySelector('style[data-leetvisual-style]')!.textContent!;
    expect(css).toContain('.lv-line { background: rgba(0, 122, 255, 0.14); }');
    expect(css).toContain('html.dark .lv-line { background: rgba(10, 132, 255, 0.22); }');
    expect(css).toContain('.lv-line-err { background: rgba(239, 71, 67, 0.16); }');
    expect(css).toContain('html.dark .lv-line-err { background: rgba(239, 71, 67, 0.24); }');
  });
});
