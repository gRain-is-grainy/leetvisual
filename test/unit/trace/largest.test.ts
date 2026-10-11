import { describe, expect, it } from 'vitest';
import type { ArrayS, BagS, CallsS, GridS, ListS, MapS, Structure } from '../../../src/panel/model/types';
import { largest } from '../../../src/panel/trace/largest';
import type { Step } from '../../../src/panel/trace/types';
import { arr, bag, board, calls, grid, list, map, v } from '../../helpers/boards';

const st = (...structs: Structure[]): Step => ({ board: board(...structs), line: 1, ev: 'line', depth: 1, fn: 'f' });

describe('largest', () => {
  it('keeps the largest version of each card, in order of first appearance', () => {
    const b = largest([st(arr('t:a', ['1']), v('t:b', '1')), st(v('t:c', 'x'), arr('t:a', ['1', '2', '3'])), st(arr('t:a', ['1']))]);
    expect(Object.keys(b.structs)).toEqual(['t:a', 't:b', 't:c']);
    expect(b.structs['t:a']).toEqual(arr('t:a', ['1', '2', '3']));
  });

  it('breaks ties by the longest value text', () => {
    expect(largest([st(v('t:x', '1')), st(v('t:x', '12345')), st(v('t:x', '12'))]).structs['t:x']).toEqual(v('t:x', '12345'));
    expect((largest([st(arr('t:a', ['1', '2'])), st(arr('t:a', ['10', '2']))]).structs['t:a'] as ArrayS).items).toEqual(['10', '2']);
  });

  it('compares sizes across kinds, so a container version beats a var version', () => {
    expect(largest([st(v('t:x', 'None')), st(arr('t:x', ['1']))]).structs['t:x'].kind).toBe('array');
  });

  it('sizes grids by cells, pools by nodes, maps by entries, bags by items and call stacks by frames', () => {
    const b = largest([
      st(
        grid('g', [['1', '2', '3']]),
        list('l', { n1: { val: '1', next: null } }),
        map('m', [['1', '2']]),
        bag('q', 'queue', ['1']),
        calls('c', [{ fn: 'f', locals: [] }]),
      ),
      st(
        grid('g', [['1'], ['2']]),
        list('l', { n1: { val: '1', next: 'n2' }, n2: { val: '2', next: null } }),
        map('m', []),
        bag('q', 'queue', ['1', '2']),
        calls('c', [
          { fn: 'f', locals: [] },
          { fn: 'g', locals: [] },
        ]),
      ),
    ]);
    expect((b.structs.g as GridS).rows).toEqual([['1', '2', '3']]);
    expect(Object.keys((b.structs.l as ListS).nodes)).toHaveLength(2);
    expect((b.structs.m as MapS).entries).toHaveLength(1);
    expect((b.structs.q as BagS).items).toHaveLength(2);
    expect((b.structs.c as CallsS).frames).toHaveLength(2);
  });

  // Review Focus 1
  it('is an empty board without steps', () => {
    expect(largest([])).toEqual({ structs: {} });
  });
});
