import { describe, expect, it } from 'vitest';
import type { Meta } from '../../../src/shared/messages';
import { seedBoard } from '../../../src/panel/parse/seed';
import type { ArrayS, GridS, ListS, Structure, TreeS, VarS } from '../../../src/panel/model/types';

const meta = (...params: [string, string][]): Meta => ({
  name: 'f',
  params: params.map(([name, type]) => ({ name, type })),
});
const structs = (m: Meta | null, inputs: string[]): Structure[] => Object.values(seedBoard(m, inputs).structs);

describe('seedBoard: scalar types become variables', () => {
  it.each([
    ['integer', '9'],
    ['long', '-9223372036854775808'],
    ['double', '2.50000'],
    ['boolean', 'true'],
    ['character', '"a"'],
  ])('%s', (type, input) => {
    expect(structs(meta(['x', type]), [input])).toEqual([{ id: 's1', name: 'x', kind: 'var', value: input }]);
  });
});

describe('seedBoard: strings and arrays', () => {
  it('maps string to a chars array', () => {
    expect(structs(meta(['s', 'string']), ['"abc"'])).toEqual([
      { id: 's1', name: 's', kind: 'array', items: ['"a"', '"b"', '"c"'], ptrs: [], chars: true },
    ]);
  });

  it('maps an empty string to an empty chars array', () => {
    expect((structs(meta(['s', 'string']), ['""'])[0] as ArrayS).items).toEqual([]);
  });

  it.each(['integer[]', 'string[]', 'list<integer>', 'list<String>', 'character[]'])('maps %s to an array', (type) => {
    expect(structs(meta(['a', type]), ['[1,"x",-2]'])).toEqual([
      { id: 's1', name: 'a', kind: 'array', items: ['1', '"x"', '-2'], ptrs: [] },
    ]);
  });

  it.each(['integer[][]', 'character[][]', 'list<list<integer>>', 'list<list<string>>'])('maps %s to a grid', (type) => {
    expect(structs(meta(['g', type]), ['[[1,2],[3],[]]'])).toEqual([
      { id: 's1', name: 'g', kind: 'grid', rows: [['1', '2'], ['3'], []], marked: [], ptrs: [] },
    ]);
  });

  it('keeps 64-bit integers in a grid exact', () => {
    const [g] = structs(meta(['g', 'long[][]']), ['[[1000000000000000000,-9223372036854775808]]']) as GridS[];
    expect(g.rows).toEqual([['1000000000000000000', '-9223372036854775808']]);
  });
});

describe('seedBoard: linked lists', () => {
  it('builds one pool with a head pointer per input', () => {
    const [l] = structs(meta(['list1', 'ListNode'], ['list2', 'ListNode']), ['[1,2]', '[3]']) as ListS[];
    expect(l).toEqual({
      id: 's1',
      name: 'list1, list2',
      kind: 'list',
      nodes: { n1: { val: '1', next: 'n2' }, n2: { val: '2', next: null }, n3: { val: '3', next: null } },
      ptrs: [{ name: 'list1', at: 'n1' }, { name: 'list2', at: 'n3' }],
    });
  });

  it('gives ListNode[] one pointer per chain and shares the pool with other list inputs', () => {
    const out = structs(meta(['lists', 'ListNode[]'], ['k', 'integer'], ['extra', 'ListNode']), ['[[1],[],[2,3]]', '2', '[9]']);
    expect(out.map((s) => s.kind)).toEqual(['list', 'var']);
    const l = out[0] as ListS;
    expect(l.name).toBe('lists, extra');
    expect(l.ptrs).toEqual([
      { name: 'lists[0]', at: 'n1' },
      { name: 'lists[1]', at: null },
      { name: 'lists[2]', at: 'n2' },
      { name: 'extra', at: 'n4' },
    ]);
  });

  it('handles empty and single-node lists', () => {
    expect((structs(meta(['head', 'ListNode']), ['[]'])[0] as ListS)).toMatchObject({ nodes: {}, ptrs: [{ name: 'head', at: null }] });
    expect((structs(meta(['head', 'ListNode']), ['[5]'])[0] as ListS).nodes).toEqual({ n1: { val: '5', next: null } });
  });

  it('seeds Linked List Cycle as a list plus a pos variable', () => {
    const out = structs(meta(['head', 'ListNode'], ['pos', 'integer']), ['[3,2,0,-4]', '1']);
    expect(out.map((s) => [s.kind, s.name])).toEqual([['list', 'head'], ['var', 'pos']]);
  });
});

describe('seedBoard: binary trees', () => {
  const tree = (input: string) => structs(meta(['root', 'TreeNode']), [input])[0] as TreeS;

  it('[] is an empty pool with a null root', () => {
    expect(tree('[]')).toEqual({ id: 's1', name: 'root', kind: 'tree', nodes: {}, ptrs: [{ name: 'root', at: null }] });
  });

  it('[1] is one node', () => {
    expect(tree('[1]').nodes).toEqual({ n1: { val: '1', left: null, right: null } });
  });

  it('[1,null,2] skips the missing left child', () => {
    expect(tree('[1,null,2]').nodes).toEqual({
      n1: { val: '1', left: null, right: 'n2' },
      n2: { val: '2', left: null, right: null },
    });
  });

  it('builds a skewed 127-node tree', () => {
    const vals = ['0'];
    for (let i = 1; i < 127; i++) vals.push(String(i), 'null');
    const t = tree(`[${vals.join(',')}]`);
    expect(Object.keys(t.nodes)).toHaveLength(127);
    let depth = 0;
    for (let n: string | null = 'n1'; n; n = t.nodes[n].left) depth++;
    expect(depth).toBe(127);
  });

  it('shares one pool across TreeNode inputs', () => {
    const [t] = structs(meta(['p', 'TreeNode'], ['q', 'TreeNode']), ['[1,2]', '[1,null,2]']) as TreeS[];
    expect(t.name).toBe('p, q');
    expect(t.ptrs).toEqual([{ name: 'p', at: 'n1' }, { name: 'q', at: 'n3' }]);
    expect(Object.keys(t.nodes)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });
});

describe('seedBoard: design problems', () => {
  const lru: Meta = {
    classname: 'LRUCache',
    params: [{ name: 'inputs', type: 'integer[]' }, { name: 'inputs', type: 'integer[]' }],
  };

  it('builds a methods array and an args grid', () => {
    const out = structs(lru, ['["LRUCache","put","get"]', '[[2],[1,1],[1]]']);
    expect(out).toEqual([
      { id: 's1', name: 'methods', kind: 'array', items: ['"LRUCache"', '"put"', '"get"'], ptrs: [] },
      { id: 's2', name: 'args', kind: 'grid', rows: [['2'], ['1', '1'], ['1']], marked: [], ptrs: [] },
    ]);
  });

  it('keeps [null] argument rows and nested arguments fall back to raw text', () => {
    const out = structs(lru, ['["A","b"]', '[[],[null]]']);
    expect((out[1] as GridS).rows).toEqual([[], ['null']]);
    expect(structs(lru, ['["A"]', '[[[1,2]]]'])[1]).toEqual({ id: 's2', name: 'args', kind: 'var', value: '[[[1,2]]]' });
  });
});

describe('seedBoard: without types', () => {
  it('infers string, array, grid and variable from the literal', () => {
    expect(structs(null, ['"ab"', '[1,2]', '[[1],[2,3]]', '7', '[]', '[[]]']).map((s) => [s.name, s.kind])).toEqual([
      ['arg1', 'array'],
      ['arg2', 'array'],
      ['arg3', 'grid'],
      ['arg4', 'var'],
      ['arg5', 'array'],
      ['arg6', 'grid'],
    ]);
    expect((structs(null, ['"ab"'])[0] as ArrayS).chars).toBe(true);
  });

  it('names extra inputs past the typed params by position', () => {
    expect(structs(meta(['a', 'integer']), ['1', '2']).map((s) => s.name)).toEqual(['a', 'arg2']);
  });
});

describe('seedBoard: failures stay local', () => {
  it('turns an unknown type into a raw-text variable', () => {
    expect(structs(meta(['root', 'Node']), ['[[2,4],[1,3]]'])).toEqual([
      { id: 's1', name: 'root', kind: 'var', value: '[[2,4],[1,3]]' },
    ]);
  });

  it('turns a shape mismatch into a raw-text variable', () => {
    expect((structs(meta(['n', 'integer']), ['[1]'])[0] as VarS).value).toBe('[1]');
    expect((structs(meta(['s', 'string']), ['abc'])[0] as VarS).kind).toBe('var');
  });

  it('keeps the other parameters when one does not parse', () => {
    const out = structs(meta(['nums', 'integer[]'], ['target', 'integer']), ['[2,7,', '9']);
    expect(out).toEqual([
      { id: 's1', name: 'nums', kind: 'var', value: '[2,7,' },
      { id: 's2', name: 'target', kind: 'var', value: '9' },
    ]);
  });

  it('strips \\r and surrounding whitespace before parsing', () => {
    expect(structs(meta(['a', 'integer[]']), [' [1,\r\n2]\r\n'])[0]).toMatchObject({ kind: 'array', items: ['1', '2'] });
    expect(structs(meta(['a', 'Node']), ['x\r'])[0]).toMatchObject({ kind: 'var', value: 'x' });
  });

  it('survives pathologically deep nesting as a raw-text variable', () => {
    const deep = '['.repeat(100000) + ']'.repeat(100000);
    expect(structs(null, [deep, '1']).map((s) => s.kind)).toEqual(['var', 'var']);
  });

  it('returns an empty board for no inputs', () => {
    expect(seedBoard(null, [])).toEqual({ structs: {} });
  });
});
