import { isToContent, type Meta, type ToPanel } from '../shared/messages';
import {
  findAnchor,
  findPanelArea,
  isRunButton,
  isRunShortcut,
  pageShowsProblem,
  readInputs,
  readSlug,
  readTheme,
  selectedTab,
} from './adapter';
import { createFrame, floatBox, positionFrame, showFrame } from './frame';
import { fetchMeta, type MetaDeps, type MetaResult, type MetaStorage } from './meta';
import { ensureStyle, ensureTab, noAnchorWarning, removeAll, setSelected, TAB_ATTR } from './tab';

export type Runtime = { readonly id?: string; getURL(path: string): string };
export type ControllerDeps = { runtime: Runtime; storage: MetaStorage; fetch: MetaDeps['fetch'] };
export type Controller = { start(): void; stop(): void };

const DEBOUNCE_MS = 300;
const STALE_MS = 3_000;
const WARN_AFTER_MS = 10_000;
const NO_META: MetaResult = { meta: null, examples: [], paid: false };

const invalidated = (e: unknown) => e instanceof Error && /Extension context invalidated/i.test(e.message);
const countOf = (meta: Meta | null) => meta?.params?.length ?? null;

export function createController(deps: ControllerDeps): Controller {
  const panelUrl = deps.runtime.getURL('panel.html');
  const extOrigin = deps.runtime.getURL('').replace(/\/$/, '');
  const firstSlug = readSlug(location.pathname);
  let slug: string | null = null;
  let meta: Promise<MetaResult> = Promise.resolve(NO_META);
  let tab: HTMLElement | null = null;
  let tabset: HTMLElement | null = null;
  let area: HTMLElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  let floating = false;
  let shown = false;
  let shownTab: string | null = null;
  let ready = false;
  let lastInputs: string | null = null;
  let staleInputs: string | null = null;
  let theme = readTheme(document);
  let raf = 0;
  let inputTimer: ReturnType<typeof setTimeout> | undefined;
  let staleTimer: ReturnType<typeof setTimeout> | undefined;
  let warnTimer: ReturnType<typeof setTimeout> | undefined;
  let warned = false;
  let stopped = false;

  const bodyObs = new MutationObserver(schedule);
  const tabObs = new MutationObserver(schedule);
  const htmlObs = new MutationObserver(() => guard(onTheme));
  const areaObs = new ResizeObserver(() => guard(position));

  // Every entry point runs through here, so nothing touches the page or the iframe once the extension is gone.
  function guard(fn: () => void) {
    if (stopped) return;
    if (!deps.runtime.id) return stop();
    try {
      fn();
    } catch (e) {
      if (!invalidated(e)) throw e;
      stop();
    }
  }

  function schedule() {
    if (raf || stopped) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      guard(tick);
    });
  }

  function tick() {
    const s = readSlug(location.pathname);
    if (s !== slug) onSlug(s);
    if (!slug) return hide();
    mount();
    if (shown && tabset && selectedTab(tabset) !== shownTab) hide();
    position();
    checkInputs();
  }

  function onSlug(s: string | null) {
    slug = s;
    // The previous problem's inputs stay on screen until the new problem's data arrives; don't send them.
    if (lastInputs !== null) staleInputs = lastInputs;
    lastInputs = null;
    clearTimeout(staleTimer);
    if (staleInputs !== null) {
      staleTimer = setTimeout(() => {
        staleInputs = null;
        schedule();
      }, STALE_MS);
    }
    meta = s
      ? fetchMeta(s, { fetch: deps.fetch, storage: deps.storage, doc: document, firstSlug }).catch((e: unknown) => {
          if (invalidated(e)) stop();
          return NO_META;
        })
      : Promise.resolve(NO_META);
  }

  function mount() {
    const { anchor, tried } = findAnchor(document);
    if (!anchor) {
      tab = null;
      if (!warned && !warnTimer) {
        warnTimer = setTimeout(() => {
          warnTimer = undefined;
          if (tab || !slug || stopped) return;
          warned = true;
          console.warn(noAnchorWarning(tried));
        }, WARN_AFTER_MS);
      }
      return;
    }
    clearTimeout(warnTimer);
    warnTimer = undefined;
    ensureStyle(document);
    tab = ensureTab(anchor, () => guard(show));
    floating = anchor.kind === 'float';
    const ts = anchor.kind === 'tabbar' ? anchor.tabset : null;
    if (ts !== tabset) {
      tabset = ts;
      tabObs.disconnect();
      if (ts) tabObs.observe(ts, { attributes: true, attributeFilter: ['class'], subtree: true });
    }
    const a = tabset ? findPanelArea(tabset) : null;
    if (a !== area) {
      areaObs.disconnect();
      area = a;
      if (a) areaObs.observe(a);
    }
    if (shown) setSelected(tab, tabset, true);
  }

  function show() {
    if (!frame) frame = createFrame(document, `${panelUrl}#${readTheme(document)}`);
    shown = true;
    shownTab = tabset ? selectedTab(tabset) : null;
    if (tab) setSelected(tab, tabset, true);
    position();
    showFrame(frame, true);
  }

  function hide() {
    if (!shown) return;
    shown = false;
    if (tab) setSelected(tab, tabset, false);
    if (frame) showFrame(frame, false);
  }

  function position() {
    if (!frame || !shown) return;
    const box = floating ? floatBox(window) : area?.getBoundingClientRect();
    if (box) positionFrame(frame, box);
  }

  function checkInputs() {
    // Every line, not just this problem's parameters: the key only detects change, and must not move when metaData arrives.
    const key = JSON.stringify(readInputs(document, null));
    if (key === lastInputs || key === staleInputs) return;
    staleInputs = null;
    clearTimeout(staleTimer);
    lastInputs = key;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => guard(() => void sendContext()), DEBOUNCE_MS);
  }

  async function sendContext() {
    if (!ready || !slug || staleInputs !== null) return;
    const s = slug;
    const r = await meta;
    guard(() => {
      if (s !== slug) return;
      const usable = !r.paid || pageShowsProblem(document);
      const metaData = usable ? r.meta : null;
      const n = countOf(metaData);
      const inputs = readInputs(document, n) ?? (usable ? r.examples.slice(0, n ?? r.examples.length) : []);
      post({ type: 'context', slug: s, metaData, inputs, theme: readTheme(document) });
    });
  }

  function post(msg: ToPanel) {
    frame?.contentWindow?.postMessage(msg, extOrigin);
  }

  function onMessage(e: MessageEvent) {
    guard(() => {
      if (e.origin !== extOrigin || !frame || e.source !== frame.contentWindow || !isToContent(e.data)) return;
      ready = true;
      void sendContext();
    });
  }

  function onTheme() {
    const t = readTheme(document);
    if (t === theme) return;
    theme = t;
    if (ready) post({ type: 'theme', theme: t });
  }

  function onPress(e: PointerEvent) {
    guard(() => {
      if (!shown) return;
      const btn = e.target instanceof Element ? e.target.closest('.flexlayout__tab_button') : null;
      if (isRunButton(e.target) || (btn && tabset?.contains(btn) && !btn.hasAttribute(TAB_ATTR))) hide();
    });
  }

  function onKey(e: KeyboardEvent) {
    guard(() => {
      if (shown && (isRunShortcut(e) || (isRunButton(e.target) && (e.key === 'Enter' || e.key === ' ')))) hide();
    });
  }

  function onResize() {
    guard(position);
  }

  function start() {
    bodyObs.observe(document.body, { childList: true, subtree: true, characterData: true });
    htmlObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('message', onMessage);
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerdown', onPress, true);
    document.addEventListener('keydown', onKey, true);
    guard(tick);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    bodyObs.disconnect();
    tabObs.disconnect();
    htmlObs.disconnect();
    areaObs.disconnect();
    window.removeEventListener('message', onMessage);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('pointerdown', onPress, true);
    document.removeEventListener('keydown', onKey, true);
    cancelAnimationFrame(raf);
    clearTimeout(inputTimer);
    clearTimeout(staleTimer);
    clearTimeout(warnTimer);
    removeAll(document);
    frame?.remove();
    frame = null;
    tab = null;
  }

  return { start, stop };
}
