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
export type ThemeMsg = { type: 'theme'; theme: Theme };
export type ReadyMsg = { type: 'ready' };
export type ToPanel = ContextMsg | ThemeMsg;
export type ToContent = ReadyMsg;

export const LEETCODE_ORIGIN = 'https://leetcode.com';

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isTheme = (x: unknown): x is Theme => x === 'light' || x === 'dark';
const opt = (x: unknown, type: 'string' | 'boolean') => x === undefined || typeof x === type;
const isParam = (x: unknown): x is Param => isObj(x) && typeof x.name === 'string' && typeof x.type === 'string';

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
  return isObj(x) && x.type === 'ready';
}
