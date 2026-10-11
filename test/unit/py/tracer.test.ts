import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { heapAt, loadHarness, traceSteps } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
}, 60_000);

const TWO_SUM = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
`;

describe('steps', () => {
  it('records each call, line and return of the user frame, with source line numbers and a keyframe first', () => {
    const t = traceSteps(py, TWO_SUM, 'Solution().twoSum([2, 7, 11, 15], 9)');
    expect(t.end).toBe('return');
    expect(t.steps.map((s) => [s.line, s.ev])).toEqual([
      [2, 'call'], [3, 'line'], [4, 'line'], [5, 'line'], [7, 'line'], [4, 'line'], [5, 'line'], [6, 'line'], [6, 'return'],
    ]);
    expect(t.steps[0]).toEqual({
      line: 2, ev: 'call', depth: 1, k: 1,
      stack: [{ fid: 1, fn: 'Solution.twoSum', names: ['self', 'nums', 'target', 'seen', 'i', 'n'], locals: { self: ['R', 1], nums: ['R', 2], target: '9' } }],
      heap: { 1: ['OBJ', 'Solution', []], 2: ['LIST', '2', '7', '11', '15'] },
    });
    expect(t.steps[2]).toEqual({ line: 4, ev: 'line', depth: 1, fd: [{ fid: 1, set: { seen: ['R', 3] } }], dh: { 3: ['DICT'] } });
    expect(t.steps[3].fd).toEqual([{ fid: 1, set: { i: '0', n: '2' } }]);
    expect(t.steps[5].dh).toEqual({ 3: ['DICT', ['2', '0']] });
    expect(t.steps[8]).toEqual({ line: 6, ev: 'return', depth: 1, pop: 1, ret: ['R', 4], dh: { 4: ['LIST', '0', '1'] } });
  });

  it('records only <solution> frames: library and harness code is skipped, the user\'s lambdas are not', () => {
    const t = traceSteps(
      py,
      `class Solution:
    def f(self, xs):
        ys = sorted(xs, key=lambda x: -x)
        return heapq.nsmallest(1, ys)
`,
      'Solution().f([1, 2])',
    );
    expect(t.steps.map((s) => s.push?.fn ?? s.stack?.[0].fn).filter(Boolean)).toEqual(['Solution.f', 'Solution.f.<locals>.<lambda>', 'Solution.f.<locals>.<lambda>']);
    expect(Math.max(...t.steps.map((s) => s.depth))).toBe(2);
  });

  it('pushes a called frame with its arguments, and pops it after its return step', () => {
    const t = traceSteps(py, 'def g(k):\n    return k + 1\ndef f(n):\n    a = g(n)\n    return a\n', 'f(1)');
    const push = t.steps.find((s) => s.push)!;
    expect(push).toMatchObject({ line: 1, ev: 'call', depth: 2, push: { fid: 2, fn: 'g', names: ['k'], locals: { k: '1' } } });
    const ret = t.steps.find((s) => s.ev === 'return' && s.depth === 2)!;
    expect(ret).toMatchObject({ pop: 1, ret: '2' });
    const after = t.steps[t.steps.indexOf(ret) + 1];
    // Back in f, the assignment on line 4 finishes and the next line event is line 5.
    expect(after).toMatchObject({ line: 5, ev: 'line', depth: 1, fd: [{ fid: 1, set: { a: '2' } }] });
  });

  it('records caught exceptions as steps and keeps going', () => {
    const t = traceSteps(py, 'def f():\n    try:\n        {}[1]\n    except KeyError:\n        pass\n    return 0\n', 'f()');
    expect(t.steps.find((s) => s.ev === 'exception')).toMatchObject({ line: 3, exc: ['KeyError', '1'] });
    expect(t.end).toBe('return');
  });

  it("finds an uncaught exception's raise step, and drops the unwinding after it", () => {
    const t = traceSteps(py, 'def g():\n    return [][0]\ndef f():\n    x = 1\n    return g()\n', 'f()');
    expect(t.end).toBe('IndexError');
    expect(t.line).toBe(2);
    expect(t.steps.at(-1)).toMatchObject({ line: 2, ev: 'exception', depth: 2, exc: ['IndexError', 'list index out of range'] });
  });

  it('sends deleted locals as del, and leaves functions, classes and modules out of the locals', () => {
    const t = traceSteps(py, 'def f():\n    x = 1\n    del x\n    def inner():\n        pass\n    m = math\n    k = int\n    return 0\n', 'f()');
    expect(t.steps.flatMap((s) => s.fd ?? [])).toEqual([{ fid: 1, set: { x: '1' } }, { fid: 1, del: ['x'] }]);
  });

  it('includes the free variables a nested function closes over', () => {
    const t = traceSteps(py, 'def f(grid):\n    def dfs(r):\n        return grid[r]\n    return dfs(0)\n', 'f([[1]])');
    const push = t.steps.find((s) => s.push?.fn === 'f.<locals>.dfs')!.push!;
    expect(push.names).toEqual(['r', 'grid']);
    expect(Object.keys(push.locals)).toEqual(['r', 'grid']);
  });

  it("captures nonlocal writes into a suspended frame's cell", () => {
    const t = traceSteps(py, 'def f():\n    total = 0\n    def add(k):\n        nonlocal total\n        total += k\n    add(5)\n    return total\n', 'f()');
    const write = t.steps.find((s) => s.depth === 2 && s.fd?.some((d) => d.fid === 1))!;
    expect(write.fd).toEqual([{ fid: 2, set: { total: '5' } }, { fid: 1, set: { total: '5' } }]);
  });
});

describe('the heap', () => {
  it('sends a mutated input again, and keeps an alias on the same id', () => {
    const t = traceSteps(py, 'def f(nums):\n    alias = nums\n    nums.sort()\n    return alias\n', 'f([3, 1, 2])');
    const locals = t.steps[0].stack![0].locals;
    expect(locals.nums).toEqual(['R', 1]);
    expect(t.steps.find((s) => s.fd)!.fd).toEqual([{ fid: 1, set: { alias: ['R', 1] } }]);
    expect(t.steps.find((s) => s.dh)!.dh).toEqual({ 1: ['LIST', '1', '2', '3'] });
  });

  it('gives each short-lived object its own id even though Python would reuse id()', () => {
    const t = traceSteps(py, 'def f():\n    for i in range(5):\n        x = [i]\n    return 0\n', 'f()');
    const ids = t.steps.flatMap((s) => s.fd ?? []).flatMap((d) => { const x = d.set?.x; return Array.isArray(x) ? [x[1]] : []; });
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it('walks a cyclic list once', () => {
    const t = traceSteps(py, 'def f():\n    a = ListNode(1, ListNode(2))\n    a.next.next = a\n    return 0\n', 'f()');
    const heap = heapAt(t.steps);
    expect(Object.values(heap).filter((e) => e[0] === 'LNODE')).toEqual([
      ['LNODE', '1', ['R', 2]],
      ['LNODE', '2', ['R', 1]],
    ]);
  });

  it('writes a keyframe every KEY_EVERY steps holding the whole stack and heap, then deltas again', () => {
    py.runPython('import lv_trace\nlv_trace.KEY_EVERY = 3');
    try {
      const t = traceSteps(py, TWO_SUM, 'Solution().twoSum([2, 7, 11, 15], 9)');
      expect(t.steps.map((s) => s.k === 1)).toEqual([true, false, false, true, false, false, true, false, false]);
      expect(t.steps[3]).toMatchObject({ stack: [{ locals: { seen: ['R', 3], i: '0', n: '2' } }], heap: { 3: ['DICT'] } });
      expect(t.steps[3].fd).toBeUndefined();
      expect(t.steps[6].heap).toEqual({ 1: ['OBJ', 'Solution', []], 2: ['LIST', '2', '7', '11', '15'], 3: ['DICT', ['2', '0']] });
    } finally {
      py.runPython('lv_trace.KEY_EVERY = 1000');
    }
  });
});

describe('caps', () => {
  const LOOP = 'def f():\n    i = 0\n    while True:\n        i += 1\n';

  it('stops at 10,000 steps', () => {
    const t = traceSteps(py, LOOP, 'f()');
    expect(t.end).toBe('cap:steps');
    expect(t.steps).toHaveLength(10_000);
  });

  it('stops after caps.ms of tracing', () => {
    const t = traceSteps(py, LOOP, 'f()', { steps: 1e9, ms: 200 });
    expect(t.end).toBe('cap:time');
    expect(t.steps.length).toBeGreaterThan(100);
  });

  it('stops before the step that would pass caps.bytes characters', () => {
    const t = traceSteps(py, LOOP, 'f()', { steps: 1e9, bytes: 20_000 });
    expect(t.end).toBe('cap:size');
    expect(t.steps.map((s) => JSON.stringify(s).length + 1).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(20_000);
  });

  it('still ends with the cap when user code swallows CapStop with a bare except', () => {
    expect(traceSteps(py, 'def f():\n    for i in range(1000):\n        try:\n            x = i\n        except:\n            pass\n    return 0\n', 'f()', { steps: 21 }).end).toBe('cap:steps');
  });

  it('lets the cap win over an exception raised after the swallowed cap', () => {
    expect(traceSteps(py, 'def f():\n    for i in range(1000):\n        try:\n            x = i\n        except:\n            pass\n    raise ValueError\n', 'f()', { steps: 21 }).end).toBe('cap:steps');
  });

  it('marks the trace truncated when a container was cut', () => {
    expect(traceSteps(py, 'def f():\n    a = list(range(300))\n    return 0\n', 'f()').truncated).toBe(true);
    expect(traceSteps(py, TWO_SUM, 'Solution().twoSum([2, 7], 9)').truncated).toBe(false);
  });
});
