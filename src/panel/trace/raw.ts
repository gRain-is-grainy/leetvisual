import type { Meta } from '../../shared/messages';

export type Caps = { steps: number; ms: number; bytes: number };
export const DEFAULT_CAPS: Caps = { steps: 10_000, ms: 3_000, bytes: 5_000_000 };
export type Job = { code: string; slug: string; meta: Meta | null; inputs: string[]; caps: Caps };

// A primitive's display text (Python literal syntax, strings JSON-quoted), inline text of a nested value, or a heap reference.
export type RVal = string | ['R', number];
export type RObj =
  | ['LIST', ...RVal[]]
  | ['TUPLE', ...RVal[]]
  | ['SET', ...RVal[]]
  | ['DEQUE', ...RVal[]]
  | ['DICT', ...[RVal, RVal][]]
  | ['LNODE', RVal, RVal]
  | ['TNODE', RVal, RVal, RVal]
  | ['OBJ', string, [string, RVal][], string?];
export type RFrame = { fid: number; fn: string; names: string[]; locals: Record<string, RVal> };
export type RFrameDelta = { fid: number; set?: Record<string, RVal>; del?: string[] };
export type RStep = {
  line: number;
  ev: 'call' | 'line' | 'return' | 'exception';
  depth: number;
  k?: 1;
  stack?: RFrame[];
  heap?: Record<string, RObj>;
  push?: RFrame;
  pop?: 1;
  fd?: RFrameDelta[];
  dh?: Record<string, RObj>;
  ret?: RVal;
  exc?: [string, string];
};
export type RFacts = { cursors: [string, string][]; grids: [string, string, string][]; strs: string[] };
export type REnd =
  | { kind: 'return'; value?: RVal }
  | { kind: 'exception'; type: string; msg: string; line: number }
  | { kind: 'cap'; cap: 'steps' | 'time' | 'size' }
  | { kind: 'syntax'; msg: string; line: number; col: number }
  | { kind: 'input'; param: string }
  | { kind: 'unsupported' };
export type RTrace = {
  v: 1;
  keyEvery: number;
  facts: Record<string, RFacts>;
  entry: { lists: string[]; trees: string[]; args: RVal[] };
  steps: RStep[];
  end: REnd;
  outputs: { at: number; v: string }[] | null;
  truncated: boolean;
};
