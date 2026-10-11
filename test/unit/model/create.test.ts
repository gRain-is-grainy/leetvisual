import { describe, expect, it } from 'vitest';
import { createStruct, DEFAULT_NAMES, uniqueName } from '../../../src/panel/model/create';
import type { Board, Structure } from '../../../src/panel/model/types';

const board = (...names: string[]): Board => ({
  structs: Object.fromEntries(
    names.map((name, i): [string, Structure] => [`s${i + 1}`, { id: `s${i + 1}`, name, kind: 'var', value: '0' }]),
  ),
});

describe('createStruct', () => {
  it('creates an array of length copies of the fill', () => {
    expect(createStruct('array', { length: 3, fill: '-1' }, 's2', 'arr')).toEqual({
      id: 's2', name: 'arr', kind: 'array', items: ['-1', '-1', '-1'], ptrs: [],
    });
  });

  it('creates a rows × cols grid of the fill', () => {
    expect(createStruct('grid', { rows: 2, cols: 3, fill: '"."' }, 's1', 'grid')).toEqual({
      id: 's1', name: 'grid', kind: 'grid',
      rows: [['"."', '"."', '"."'], ['"."', '"."', '"."']], marked: [], ptrs: [],
    });
  });

  it('floors sizes, refuses negatives and defaults missing or non-finite numbers', () => {
    expect((createStruct('array', { length: 2.7 }, 's1', 'a') as { items: string[] }).items).toEqual(['0', '0']);
    expect((createStruct('array', { length: -3 }, 's1', 'a') as { items: string[] }).items).toEqual([]);
    expect((createStruct('array', { length: Number.NaN }, 's1', 'a') as { items: string[] }).items).toHaveLength(5);
    const g = createStruct('grid', { rows: 0, cols: Infinity }, 's1', 'g') as { rows: string[][] };
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0]).toHaveLength(3);
  });

  it('trims the fill and keeps it as literal text', () => {
    expect((createStruct('array', { length: 1, fill: '  "a b"  ' }, 's1', 'a') as { items: string[] }).items).toEqual(['"a b"']);
    expect((createStruct('array', { length: 1, fill: '1000000000000000001' }, 's1', 'a') as { items: string[] }).items).toEqual(['1000000000000000001']);
  });

  it('creates the other kinds empty, with null head/root pointers and one call frame', () => {
    expect(createStruct('var', {}, 's1', 'x')).toEqual({ id: 's1', name: 'x', kind: 'var', value: '' });
    expect(createStruct('map', {}, 's1', 'm')).toEqual({ id: 's1', name: 'm', kind: 'map', entries: [] });
    for (const kind of ['set', 'stack', 'queue'] as const) {
      expect(createStruct(kind, {}, 's1', kind)).toEqual({ id: 's1', name: kind, kind, items: [] });
    }
    expect(createStruct('list', {}, 's1', 'list')).toEqual({ id: 's1', name: 'list', kind: 'list', nodes: {}, ptrs: [{ name: 'head', at: null }] });
    expect(createStruct('tree', {}, 's1', 'tree')).toEqual({ id: 's1', name: 'tree', kind: 'tree', nodes: {}, ptrs: [{ name: 'root', at: null }] });
    expect(createStruct('calls', {}, 's1', 'calls')).toEqual({ id: 's1', name: 'calls', kind: 'calls', frames: [{ fn: 'f', locals: [] }] });
  });
});

describe('uniqueName', () => {
  it('returns the base when free, else the first free numbered name', () => {
    expect(uniqueName('arr', board('x'))).toBe('arr');
    expect(uniqueName('arr', board('arr', 'arr2'))).toBe('arr3');
  });

  it('has a default name for every kind', () => {
    expect(DEFAULT_NAMES).toEqual({
      var: 'x', array: 'arr', grid: 'grid', map: 'map', set: 'set',
      stack: 'stack', queue: 'queue', list: 'list', tree: 'tree', calls: 'calls',
    });
  });
});
