import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadHarness, pyJson } from '../../helpers/py';

let py: PyodideAPI;
beforeAll(async () => {
  py = await loadHarness();
  // describe(v): a JSON picture of a built value, exact for big ints and floats.
  py.runPython(`
import json, lv_args, lv_nodes
def describe(v):
    if isinstance(v, bool): return v
    if isinstance(v, int): return {'int': str(v)}
    if isinstance(v, float): return {'float': repr(v)}
    if isinstance(v, lv_nodes.ListNode): return {'list': [n.val for n in lv_nodes.chain(v)]}
    if isinstance(v, lv_nodes.TreeNode):
        out, q = [], [v]
        while q:
            n = q.pop(0)
            out.append(None if n is None else n.val)
            if n is not None: q += [n.left, n.right]
        while out[-1] is None: out.pop()
        return {'tree': out}
    if isinstance(v, lv_nodes.NestedInteger): return {'nested': repr(v)}
    if isinstance(v, list): return [describe(x) for x in v]
    return v
def built(t, text):
    try:
        return describe(lv_args.build(t, lv_args.parse(text, 'p'), 'p'))
    except lv_args.InputError as e:
        return {'error': e.param}
`);
}, 60_000);

const built = (type: string, text: string) => pyJson(py, `json.dumps(built(${JSON.stringify(type)}, ${JSON.stringify(text)}))`);

// The 31 metaData type strings of index Decision 2, each with an input and the value the user's code receives.
const TYPES: [string, string, unknown][] = [
  ['integer', '-7', { int: '-7' }],
  ['integer[]', '[1,-2,3]', [{ int: '1' }, { int: '-2' }, { int: '3' }]],
  ['integer[][]', '[[1,2],[]]', [[{ int: '1' }, { int: '2' }], []]],
  ['long', '-9223372036854775808', { int: '-9223372036854775808' }],
  ['long[]', '[9223372036854775807,1000000000000000000]', [{ int: '9223372036854775807' }, { int: '1000000000000000000' }]],
  ['long[][]', '[[1]]', [[{ int: '1' }]]],
  ['double', '2', { float: '2.0' }],
  ['double[]', '[1,2.5]', [{ float: '1.0' }, { float: '2.5' }]],
  ['double[][]', '[[0.5]]', [[{ float: '0.5' }]]],
  ['boolean', 'true', true],
  ['boolean[]', '[true,false]', [true, false]],
  ['boolean[][]', '[[false]]', [[false]]],
  ['string', '"héllo 😀"', 'héllo 😀'],
  ['string[]', '["a","b"]', ['a', 'b']],
  ['string[][]', '[["a"],[]]', [['a'], []]],
  ['character', '"x"', 'x'],
  ['character[]', '["a","b"]', ['a', 'b']],
  ['character[][]', '[["1","0"],["0","1"]]', [['1', '0'], ['0', '1']]],
  ['list<integer>', '[1,2]', [{ int: '1' }, { int: '2' }]],
  ['list<list<integer>>', '[[1],[]]', [[{ int: '1' }], []]],
  ['list<string>', '["x"]', ['x']],
  ['list<list<string>>', '[["x","y"]]', [['x', 'y']]],
  ['list<boolean>', '[false]', [false]],
  ['list<double>', '[3]', [{ float: '3.0' }]],
  ['ListNode', '[1,2,3]', { list: [1, 2, 3] }],
  ['ListNode[]', '[[1,4],[2]]', [{ list: [1, 4] }, { list: [2] }]],
  ['list<ListNode>', '[[5],[]]', [{ list: [5] }, null]],
  ['TreeNode', '[1,null,2,3]', { tree: [1, null, 2, 3] }],
  ['TreeNode[]', '[[1],[]]', [{ tree: [1] }, null]],
  ['list<TreeNode>', '[[2,1]]', [{ tree: [2, 1] }]],
  ['list<NestedInteger>', '[1,[2,[3]],[]]', [{ nested: '1' }, { nested: '[2, [3]]' }, { nested: '[]' }]],
];

describe('build', () => {
  it('covers 31 type strings', () => {
    expect(TYPES).toHaveLength(31);
  });

  it.each(TYPES)('builds %s from %s', (type, text, want) => {
    expect(built(type, text)).toEqual(want);
  });

  it('builds an empty list and an empty tree as None', () => {
    expect([built('ListNode', '[]'), built('TreeNode', '[]'), built('integer[]', '[]')]).toEqual([null, null, []]);
  });

  it('passes an unknown type, or no type, through unchanged', () => {
    expect([built('Node', '[[2,4],[1]]'), built('', '{"a":1}')]).toEqual([[[{ int: '2' }, { int: '4' }], [{ int: '1' }]], { a: 1 }]);
  });

  it.each([
    ['integer', 'true'],
    ['integer', '1.5'],
    ['integer[]', '5'],
    ['double', '"x"'],
    ['boolean', '1'],
    ['string', '5'],
    ['ListNode', '5'],
    ['TreeNode', '{"a":1}'],
    ['list<NestedInteger>', '["x"]'],
  ])('refuses %s given %s with the parameter name', (type, text) => {
    expect(built(type, text)).toEqual({ error: 'p' });
  });

  it('refuses malformed JSON and strips \\r first', () => {
    expect(built('integer[]', '[2,7')).toEqual({ error: 'p' });
    expect(built('integer[]', '[1,\r\n2]\r\n')).toEqual([{ int: '1' }, { int: '2' }]);
  });
});

describe('shape', () => {
  it('counts [] and list<> wrappers around a base', () => {
    const out = pyJson(py, `json.dumps([lv_args.shape(t) for t in ['integer', 'integer[][]', 'list<list<integer>>', ' List<string> ', 'list<ListNode>[]']])`);
    expect(out).toEqual([['integer', 0], ['integer', 2], ['integer', 2], ['string', 1], ['ListNode', 2]]);
  });
});

describe('hint_type', () => {
  it.each([
    ['int', 'integer'],
    ['float', 'double'],
    ['bool', 'boolean'],
    ['str', 'string'],
    ['List[int]', 'integer[]'],
    ['list[int]', 'integer[]'],
    ['List[List[str]]', 'string[][]'],
    ['typing.List[int]', 'integer[]'],
    ['Optional[ListNode]', 'ListNode'],
    ['ListNode | None', 'ListNode'],
    ['None | TreeNode', 'TreeNode'],
    ["'Optional[TreeNode]'", 'TreeNode'],
    ['Optional[List[ListNode]]', 'ListNode[]'],
    ['NestedInteger', 'NestedInteger'],
    ['Node', null],
    ['Dict[int, int]', null],
    ['list', null],
    ['int | str', null],
  ])('reads %s as %s', (hint, want) => {
    expect(pyJson(py, `import ast\njson.dumps(lv_args.hint_type(ast.parse(${JSON.stringify(hint)}, mode='eval').body))`)).toBe(want);
  });

  it('reads no annotation as None and only "-> None" as void', () => {
    const out = pyJson(py, `
import ast
f = ast.parse('def f(a, b: int) -> None: pass\\ndef g() -> int: pass\\ndef h(): pass').body
json.dumps([lv_args.hint_type(f[0].args.args[0].annotation), lv_args.is_void(f[0].returns), lv_args.is_void(f[1].returns), lv_args.is_void(f[2].returns)])
`);
    expect(out).toEqual([null, true, false, false]);
  });
});
