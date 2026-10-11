import { describe, expect, it } from 'vitest';
import { isFromWorker } from '../../../src/panel/runner/protocol';

const result = { steps: [], end: { kind: 'return' }, truncated: false, code: '' };

describe('isFromWorker', () => {
  it('accepts ready, done and fatal', () => {
    expect(isFromWorker({ type: 'ready', snapshot: true })).toBe(true);
    expect(isFromWorker({ type: 'done', id: 1, result, heap: 0 })).toBe(true);
    expect(isFromWorker({ type: 'fatal', msg: 'x' })).toBe(true);
  });

  it('rejects wrong shapes', () => {
    const bad = [
      null,
      1,
      'ready',
      [],
      { type: 'ready' },
      { type: 'ready', snapshot: 'yes' },
      { type: 'done', id: '1', result, heap: 0 },
      { type: 'done', id: 1, result, heap: '0' },
      { type: 'done', id: 1, result: null, heap: 0 },
      { type: 'done', id: 1, result: { ...result, steps: {} }, heap: 0 },
      { type: 'done', id: 1, result: { ...result, code: 1 }, heap: 0 },
      { type: 'fatal', msg: 3 },
      { type: 'init', base: '' },
    ];
    for (const x of bad) expect(isFromWorker(x), JSON.stringify(x)).toBe(false);
  });
});
