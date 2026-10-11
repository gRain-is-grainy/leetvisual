import type { Job } from '../trace/raw';
import type { TraceResult } from '../trace/types';

export type ToWorker = { type: 'init'; base: string } | { type: 'run'; id: number; job: Job };
export type FromWorker =
  | { type: 'ready'; snapshot: boolean }
  | { type: 'done'; id: number; result: TraceResult; heap: number }
  | { type: 'fatal'; msg: string };

// The worker is our own code, so this checks only the shape the runner reads.
export function isFromWorker(x: unknown): x is FromWorker {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Record<string, unknown>;
  if (m.type === 'ready') return typeof m.snapshot === 'boolean';
  if (m.type === 'fatal') return typeof m.msg === 'string';
  if (m.type !== 'done' || typeof m.id !== 'number' || typeof m.heap !== 'number') return false;
  const r = m.result as Record<string, unknown> | null;
  return (
    typeof r === 'object' &&
    r !== null &&
    Array.isArray(r.steps) &&
    typeof r.end === 'object' &&
    r.end !== null &&
    typeof r.truncated === 'boolean' &&
    typeof r.code === 'string'
  );
}
