import { describe, expect, it } from 'vitest';
import { addChain, addTree } from '../../../src/panel/model/build';
import type { ListNode, TreeNode } from '../../../src/panel/model/types';

describe('addChain', () => {
  it('builds a chain and returns its head', () => {
    const nodes: Record<string, ListNode> = {};
    expect(addChain(nodes, ['1', '2'])).toBe('n1');
    expect(nodes).toEqual({ n1: { val: '1', next: 'n2' }, n2: { val: '2', next: null } });
  });

  it('returns null for an empty input and continues numbering in a shared pool', () => {
    const nodes: Record<string, ListNode> = {};
    expect(addChain(nodes, [])).toBeNull();
    addChain(nodes, ['1']);
    expect(addChain(nodes, ['2', '3'])).toBe('n2');
    expect(Object.keys(nodes)).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('addTree', () => {
  const build = (vals: string[]) => {
    const nodes: Record<string, TreeNode> = {};
    return { root: addTree(nodes, vals), nodes };
  };

  it('handles [] and [null] as empty trees', () => {
    expect(build([])).toEqual({ root: null, nodes: {} });
    expect(build(['null'])).toEqual({ root: null, nodes: {} });
  });

  it('builds [1]', () => {
    expect(build(['1'])).toEqual({ root: 'n1', nodes: { n1: { val: '1', left: null, right: null } } });
  });

  it('skips the children of null in [1,null,2]', () => {
    expect(build(['1', 'null', '2']).nodes).toEqual({
      n1: { val: '1', left: null, right: 'n2' },
      n2: { val: '2', left: null, right: null },
    });
  });

  it('builds level order with gaps', () => {
    const { nodes } = build(['3', '9', '20', 'null', 'null', '15', '7']);
    expect(nodes.n1).toEqual({ val: '3', left: 'n2', right: 'n3' });
    expect(nodes.n3).toEqual({ val: '20', left: 'n4', right: 'n5' });
    expect(nodes.n4.val).toBe('15');
  });

  it('builds a 10,000-node right-skewed tree without recursion', () => {
    const vals = ['0'];
    for (let i = 1; i < 10000; i++) vals.push('null', String(i));
    const { nodes } = build(vals);
    expect(Object.keys(nodes)).toHaveLength(10000);
    expect(nodes.n10000).toEqual({ val: '9999', left: null, right: null });
  });
});
