import { describe, expect, it, vi } from 'vitest';
import type { CallsS } from '../../../src/panel/model/types';
import { buildSteps } from '../../../src/panel/trace/steps';
import * as text from '../../../src/panel/trace/text';
import { boardAt, frame, key, R, step, trace } from '../../helpers/raw';

vi.mock('../../../src/panel/trace/text', async (orig) => {
  const m = await orig<typeof import('../../../src/panel/trace/text')>();
  return { ...m, textOf: vi.fn(m.textOf) };
});

const framesAt = (r: ReturnType<typeof buildSteps>, k: number) => (r.steps[k].board.structs['t:#calls'] as CallsS).frames;
const fr = (n: number, locals: Record<string, string | ['R', number]> = {}) => frame(n, `Solution.f${n}`, { n: String(n), ...locals });

describe('buildSteps: calls card frame reuse', () => {
  it('reuses unchanged CallFrames across a push and a pop', () => {
    const raw = trace([
      key(2, [fr(1), fr(2)]),
      step(3, { depth: 3, push: fr(3) }),
      step(4, { depth: 3, pop: 1, ev: 'return' }),
      step(5, { depth: 2 }),
    ]);
    const r = buildSteps(raw, '');
    const [a, b, c, d] = [0, 1, 2, 3].map((k) => framesAt(r, k));
    expect(b).toHaveLength(3);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
    expect(c[2]).toBe(b[2]);
    expect(d).toHaveLength(2);
    expect(d[0]).toBe(a[0]);
    expect(d[1]).toBe(a[1]);
  });

  it('reuses CallFrames when the 200-frame window slides by one', () => {
    const stack = Array.from({ length: 200 }, (_, i) => fr(i + 1));
    const raw = trace([key(2, stack), step(3, { depth: 201, push: fr(201) })]);
    const r = buildSteps(raw, '');
    const a = framesAt(r, 0);
    const b = framesAt(r, 1);
    expect(b).toHaveLength(200);
    expect(b[0].fn).toBe('f2');
    for (let i = 0; i < 199; i++) expect(b[i]).toBe(a[i + 1]);
    expect(b[199]).toEqual({ fn: 'f201', locals: [['n', '201']] });
  });

  it('builds a new correct CallFrame for a frame whose local or heap object changed, and reuses the others', () => {
    const raw = trace([
      key(2, [fr(1, { xs: R(1) }), fr(2), fr(3, { y: '0' })], { 1: ['LIST', '1'] }),
      step(3, { depth: 3, fd: [{ fid: 3, set: { y: '5' } }] }),
      step(4, { depth: 3, dh: { 1: ['LIST', '1', '2'] } }),
    ]);
    const r = buildSteps(raw, '');
    const [a, b, c] = [0, 1, 2].map((k) => framesAt(r, k));
    expect(b[2]).not.toBe(a[2]);
    expect(b[2].locals).toEqual([['n', '3'], ['y', '5']]);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
    expect(c[0]).not.toBe(b[0]);
    expect(c[0].locals).toEqual([['n', '1'], ['xs', '[1, 2]']]);
    expect(c[1]).toBe(b[1]);
    expect(a[0].locals).toEqual([['n', '1'], ['xs', '[1]']]);
  });

  it('gives every step the same calls card a fresh mapBoard would', () => {
    const stack = Array.from({ length: 203 }, (_, i) => fr(i + 1, { xs: R(1) }));
    const raw = trace(
      [
        key(2, stack, { 1: ['LIST', '1'] }),
        step(3, { depth: 204, push: fr(204, { xs: R(1) }) }),
        step(4, { depth: 204, dh: { 1: ['LIST', '1', '2'] } }),
        step(5, { depth: 204, fd: [{ fid: 204, set: { n: '9' } }] }),
        step(6, { depth: 204, ev: 'return', pop: 1 }),
        step(7, { depth: 203, fd: [{ fid: 5, del: ['xs'] }] }),
      ],
      {},
    );
    const r = buildSteps(raw, '');
    raw.steps.forEach((_, k) => expect(r.steps[k].board.structs['t:#calls']).toEqual(boardAt(raw, k).structs['t:#calls']));
  });

  it('keeps an untouched frame as the same object when the top frame changes, without formatting it again', () => {
    const stack = Array.from({ length: 50 }, (_, i) => fr(i + 1, { y: '0' }));
    const steps = Array.from({ length: 20 }, (_, i) => step(3 + i, { depth: 50, fd: [{ fid: 50, set: { y: String(i + 1) } }] }));
    const raw = trace([key(2, stack), ...steps]);
    vi.mocked(text.textOf).mockClear();
    const r = buildSteps(raw, '');
    for (let k = 1; k <= 20; k++) {
      expect(framesAt(r, k)[0]).toBe(framesAt(r, 0)[0]);
      expect(framesAt(r, k)[48]).toBe(framesAt(r, 0)[48]);
      expect(framesAt(r, k)[49]).toEqual({ fn: 'f50', locals: [['n', '50'], ['y', String(k)]] });
    }
    // 50 frames x 2 locals once for the keyframe, then only the top frame and the top card's variables per step.
    expect(vi.mocked(text.textOf).mock.calls.length).toBeLessThan(400);
  });
});
