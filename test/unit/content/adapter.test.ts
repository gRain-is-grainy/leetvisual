// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  findAnchor,
  findPanelArea,
  findTabset,
  isRunButton,
  isRunShortcut,
  pageShowsProblem,
  readInputs,
  readSlug,
  readTheme,
  selectedTab,
} from '../../../src/content/adapter';
import { loadFixture } from '../../fixtures/load';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;

beforeEach(() => loadFixture());

describe('findAnchor', () => {
  it('picks the tab bar of the tabset that holds #testcase_tab', () => {
    const { anchor, tried } = findAnchor(document);
    expect(anchor?.kind).toBe('tabbar');
    if (anchor?.kind !== 'tabbar') return;
    expect(anchor.tabset.getAttribute('data-layout-path')).toBe('/c1/ts1');
    expect(anchor.bar.contains($('#testcase_tab'))).toBe(true);
    expect(anchor.bar.contains($('#description_tab'))).toBe(false);
    expect(tried).toEqual(['testcase tab bar']);
  });

  it('falls back to the run button, then to nothing', () => {
    $('[data-layout-path="/c1/ts1"]').remove();
    const float = findAnchor(document);
    expect(float.anchor).toEqual({ kind: 'float', run: $('[data-e2e-locator="console-run-button"]') });
    $('[data-e2e-locator="console-run-button"]').remove();
    expect(findAnchor(document)).toEqual({ anchor: null, tried: ['testcase tab bar', 'run button'] });
  });
});

describe('findPanelArea', () => {
  it('uses the tabset content box, then the /t0 content by layout path', () => {
    const tabset = findTabset(document)!;
    expect(findPanelArea(tabset)).toBe(tabset.querySelector('.flexlayout__tabset_content'));
    tabset.querySelector('.flexlayout__tabset_content')!.remove();
    expect(findPanelArea(tabset)).toBe($('[data-layout-path="/c1/ts1/t0"]'));
    $('[data-layout-path="/c1/ts1/t0"]').remove();
    expect(findPanelArea(tabset)).toBeNull();
  });
});

describe('readInputs', () => {
  it('reads the active case inputs in parameter order', () => {
    expect(readInputs(document, 2)).toEqual(['[2,7,11,15]', '9']);
    expect(pageShowsProblem(document)).toBe(true);
  });

  it('falls back to the first case of the hidden CodeMirror lines', () => {
    document.querySelectorAll('[data-e2e-locator="console-testcase-input"]').forEach((el) => el.remove());
    expect(pageShowsProblem(document)).toBe(false);
    expect(readInputs(document, 2)).toEqual(['[2,7,11,15]', '9']);
    expect(readInputs(document, null)).toEqual(['[2,7,11,15]', '9', '[3,2,4]', '6']);
  });

  it('keeps an empty input and returns null when nothing is found', () => {
    $('[data-e2e-locator="console-testcase-input"]').textContent = '';
    expect(readInputs(document, 2)).toEqual(['', '9']);
    document.querySelectorAll('[data-e2e-locator="console-testcase-input"], .cm-editor').forEach((el) => el.remove());
    expect(readInputs(document, 2)).toBeNull();
  });
});

describe('page state', () => {
  it('reads the theme class on <html>', () => {
    expect(readTheme(document)).toBe('light');
    document.documentElement.className = 'dark';
    expect(readTheme(document)).toBe('dark');
    document.documentElement.className = '';
    expect(readTheme(document)).toBe('light');
  });

  it('reads the slug from problem paths only', () => {
    expect(readSlug('/problems/two-sum/description/')).toBe('two-sum');
    expect(readSlug('/problems/two-sum')).toBe('two-sum');
    expect(readSlug('/problemset/')).toBeNull();
    expect(readSlug('/')).toBeNull();
  });

  it('reports the selected FlexLayout tab of a tabset', () => {
    const tabset = findTabset(document)!;
    expect(selectedTab(tabset)).toBe('/c1/ts1/tb0');
    $('[data-layout-path="/c1/ts1/tb0"]').className = 'flexlayout__tab_button flexlayout__tab_button--unselected';
    $('[data-layout-path="/c1/ts1/tb1"]').className = 'flexlayout__tab_button flexlayout__tab_button--selected';
    expect(selectedTab(tabset)).toBe('/c1/ts1/tb1');
  });

  it('recognises the Run and Submit buttons and their shortcuts', () => {
    expect(isRunButton($('[data-e2e-locator="console-run-button"]'))).toBe(true);
    expect(isRunButton($('[data-e2e-locator="console-submit-button"]'))).toBe(true);
    expect(isRunButton($('#testcase_tab'))).toBe(false);
    expect(isRunButton(null)).toBe(false);
    const key = (init: KeyboardEventInit) => isRunShortcut(new KeyboardEvent('keydown', init));
    expect(key({ key: "'", ctrlKey: true })).toBe(true);
    expect(key({ key: 'Enter', metaKey: true })).toBe(true);
    expect(key({ key: 'Enter' })).toBe(false);
    expect(key({ key: 'a', ctrlKey: true })).toBe(false);
  });
});
