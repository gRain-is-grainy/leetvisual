import type { Board, Val } from '../model/types';

export type Ev = 'call' | 'line' | 'return' | 'exception';
export type Step = {
  board: Board; // shares unchanged structures with the previous step's board
  line: number; // 1-based line in the user's code
  ev: Ev;
  depth: number; // user frames on the stack
  fn: string; // current function's name
  detail?: string; // return value text, or "ValueError: msg"
};
export type End =
  | { kind: 'return'; value?: Val }
  | { kind: 'exception'; type: string; msg: string; line: number }
  | { kind: 'cap'; cap: 'steps' | 'time' | 'size' }
  | { kind: 'syntax'; msg: string; line: number; col: number }
  | { kind: 'input'; param: string }
  | { kind: 'unsupported' };
export type TraceResult = { steps: Step[]; end: End; truncated: boolean; code: string };
export type RunOutcome = TraceResult | { fail: 'timeout' | 'fatal' | 'load' | 'stopped' };
