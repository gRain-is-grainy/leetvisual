export type Param = { name: string; type: string };
export type Meta = {
  name?: string;
  params?: Param[];
  classname?: string;
  manual?: boolean;
  systemdesign?: boolean;
  return?: { type: string };
  constructor?: unknown; // { params: Param[] } on design problems. Only the Python harness reads it, and a typed
  // property named constructor would clash with every object literal's apparent Object.prototype.constructor.
  methods?: { name: string; params: Param[]; return?: { type: string } }[];
};

export type Theme = 'light' | 'dark';
export type ContextMsg = { type: 'context'; slug: string; metaData: Meta | null; inputs: string[]; theme: Theme };
export type SlugMsg = { type: 'slug'; slug: string };
export type ThemeMsg = { type: 'theme'; theme: Theme };
export type ReadyMsg = { type: 'ready' };
export type GetCodeMsg = { type: 'getCode' };
export type LineMsg = { type: 'line'; line: number | null; err?: true };
export type CodeMsg = { type: 'code'; code: string; lang: string } | { type: 'code'; error: 'no-editor' };
export type CodeChangedMsg = { type: 'codeChanged' };
export type ToPanel = ContextMsg | SlugMsg | ThemeMsg | CodeMsg | CodeChangedMsg;
export type ToContent = ReadyMsg | GetCodeMsg | LineMsg;

// Content script <-> page script, over window.postMessage(msg, LEETCODE_ORIGIN), accepted only when event.source === window.
export const TO_PAGE = 'leetvisual';
export const FROM_PAGE = 'leetvisual-page';
export type ToPage =
  | { source: 'leetvisual'; type: 'getCode'; id: number }
  | { source: 'leetvisual'; type: 'line'; line: number | null; err?: true };
export type FromPage =
  | { source: 'leetvisual-page'; type: 'code'; id: number; code: string; lang: string }
  | { source: 'leetvisual-page'; type: 'code'; id: number; error: 'no-editor' }
  | { source: 'leetvisual-page'; type: 'codeChanged' };

export const LEETCODE_ORIGIN = 'https://leetcode.com';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isTheme = (x: unknown): x is Theme => x === 'light' || x === 'dark';
const opt = (x: unknown, type: 'string' | 'boolean') => x === undefined || typeof x === type;
const isParam = (x: unknown): x is Param => isObj(x) && typeof x.name === 'string' && typeof x.type === 'string';
const isId = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
const isLine = (x: Obj) =>
  (x.line === null || (typeof x.line === 'number' && Number.isInteger(x.line) && x.line >= 1)) && (x.err === undefined || x.err === true);
// Either the code and its language, or the no-editor answer; never a mix.
const isCode = (x: Obj) =>
  x.error === undefined
    ? typeof x.code === 'string' && typeof x.lang === 'string'
    : x.error === 'no-editor' && x.code === undefined && x.lang === undefined;

export function isMeta(x: unknown): x is Meta {
  return (
    isObj(x) &&
    opt(x.name, 'string') &&
    opt(x.classname, 'string') &&
    opt(x.manual, 'boolean') &&
    opt(x.systemdesign, 'boolean') &&
    (x.params === undefined || (Array.isArray(x.params) && x.params.every(isParam)))
  );
}

export function isToPanel(x: unknown): x is ToPanel {
  if (!isObj(x)) return false;
  if (x.type === 'theme') return isTheme(x.theme);
  if (x.type === 'code') return isCode(x);
  if (x.type === 'codeChanged') return true;
  if (x.type === 'slug') return typeof x.slug === 'string' && x.slug !== '';
  return (
    x.type === 'context' &&
    typeof x.slug === 'string' &&
    x.slug !== '' &&
    (x.metaData === null || isMeta(x.metaData)) &&
    Array.isArray(x.inputs) &&
    x.inputs.every((i) => typeof i === 'string') &&
    isTheme(x.theme)
  );
}

export function isToContent(x: unknown): x is ToContent {
  if (!isObj(x)) return false;
  return x.type === 'ready' || x.type === 'getCode' || (x.type === 'line' && isLine(x));
}

export function isToPage(x: unknown): x is ToPage {
  if (!isObj(x) || x.source !== TO_PAGE) return false;
  return (x.type === 'getCode' && isId(x.id)) || (x.type === 'line' && isLine(x));
}

export function isFromPage(x: unknown): x is FromPage {
  if (!isObj(x) || x.source !== FROM_PAGE) return false;
  return (x.type === 'code' && isId(x.id) && isCode(x)) || x.type === 'codeChanged';
}
