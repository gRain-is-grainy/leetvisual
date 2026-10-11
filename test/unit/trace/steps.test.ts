import { describe, expect, it } from 'vitest';
import type { ArrayS } from '../../../src/panel/model/types';
import type { REnd, RObj } from '../../../src/panel/trace/raw';
import { buildSteps } from '../../../src/panel/trace/steps';
import { frame, key, R, step, trace } from '../../helpers/raw';

describe('buildSteps', () => {
  it('makes one step per raw step with its line, event, depth, function name and detail', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.twoSum', { nums: R(1) })], { 1: ['LIST', '2', '7'] }, { ev: 'call' }),
      step(3),
      step(4, { ev: 'call', depth: 2, push: frame(2, 'Solution.twoSum.<locals>.check', { v: '1' }) }),
      step(5, { ev: 'exception', depth: 2, exc: ['ValueError', 'bad value'] }),
      step(5, { ev: 'exception', depth: 2, exc: ['StopIteration', ''] }),
      step(5, { ev: 'return', depth: 2, pop: 1, ret: R(2), dh: { 2: ['LIST', '0', '1'] } }),
      step(6),
    ]);
    const r = buildSteps(raw, 'src');
    expect(r.steps.map(({ line, ev, depth, fn, detail }) => [line, ev, depth, fn, detail])).toEqual([
      [2, 'call', 1, 'twoSum', undefined],
      [3, 'line', 1, 'twoSum', undefined],
      [4, 'call', 2, 'check', undefined],
      [5, 'exception', 2, 'check', 'ValueError: bad value'],
      [5, 'exception', 2, 'check', 'StopIteration'],
      [5, 'return', 2, 'check', '[0, 1]'],
      [6, 'line', 1, 'twoSum', undefined],
    ]);
    expect(r.steps[1]).not.toHaveProperty('detail');
    expect(r.code).toBe('src');
  });

  it('turns a return end into text with the heap after the last step', () => {
    const raw = trace([key(2, [frame(1, 'Solution.f', { r: R(1) })], { 1: ['LIST', '1'] }), step(3, { dh: { 1: ['LIST', '1', '2'] } })], {
      end: { kind: 'return', value: R(1) },
    });
    expect(buildSteps(raw, '').end).toEqual({ kind: 'return', value: '[1, 2]' });
    expect(buildSteps({ ...raw, end: { kind: 'return' } }, '').end).toEqual({ kind: 'return' });
  });

  it('copies every other end', () => {
    const ends: REnd[] = [
      { kind: 'exception', type: 'IndexError', msg: 'list index out of range', line: 7 },
      { kind: 'cap', cap: 'steps' },
      { kind: 'syntax', msg: 'invalid syntax', line: 4, col: 9 },
      { kind: 'input', param: 'nums' },
      { kind: 'unsupported' },
    ];
    for (const end of ends) expect(buildSteps(trace([], { end }), '').end).toEqual(end);
  });

  it('is truncated when the raw trace is, or when a pool was cut', () => {
    const small = trace([key(2, [frame(1, 'Solution.f', { x: '1' })])]);
    expect(buildSteps(small, '').truncated).toBe(false);
    expect(buildSteps({ ...small, truncated: true }, '').truncated).toBe(true);
    const chain: Record<string, RObj> = {};
    for (let i = 1; i <= 205; i++) chain[i] = ['LNODE', String(i), i < 205 ? R(i + 1) : 'None'];
    expect(buildSteps(trace([key(2, [frame(1, 'Solution.f', { head: R(1) })], chain)]), '').truncated).toBe(true);
  });

  it('reuses each unchanged card from the previous step, including one sent again with equal content', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { nums: R(1), x: '1' })], { 1: ['LIST', '2', '7'] }),
      step(3, { fd: [{ fid: 1, set: { x: '2' } }] }),
      step(4, { dh: { 1: ['LIST', '2', '7'] } }),
      step(5, { dh: { 1: ['LIST', '9', '7'] } }),
    ]);
    const [s0, s1, s2, s3] = buildSteps(raw, '').steps.map((s) => s.board.structs);
    expect(s1['t:nums']).toBe(s0['t:nums']);
    expect(s1['t:x']).not.toBe(s0['t:x']);
    expect(s2['t:nums']).toBe(s0['t:nums']);
    expect(s3['t:nums']).not.toBe(s0['t:nums']);
    expect((s3['t:nums'] as ArrayS).items).toEqual(['9', '7']);
  });

  it('reuses the whole previous board when nothing on it changed, and not when a card goes away', () => {
    const raw = trace([key(2, [frame(1, 'Solution.f', { x: '1' })]), step(3), step(4, { fd: [{ fid: 1, del: ['x'] }] })]);
    const [a, b, c] = buildSteps(raw, '').steps.map((s) => s.board);
    expect(b).toBe(a);
    expect(c).not.toBe(b);
    expect(c.structs).toEqual({});
  });

  // Review Focus 1
  it('builds no steps for a step-less trace and still converts its end', () => {
    const syntax: REnd = { kind: 'syntax', msg: 'invalid syntax', line: 4, col: 9 };
    expect(buildSteps(trace([], { end: syntax }), 'x = (')).toEqual({ steps: [], end: syntax, truncated: false, code: 'x = (' });
    expect(buildSteps(trace([], { end: { kind: 'return', value: R(1) } }), '').end).toEqual({ kind: 'return', value: '…' });
  });
});
