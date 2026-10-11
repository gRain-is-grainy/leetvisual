import { describe, expect, it } from 'vitest';
import type { ArrayS, Board } from '../../../src/panel/model/types';
import { boardAt, facts, frame, key, one, R, step, trace } from '../../helpers/raw';

const localIds = (b: Board) => Object.keys(b.structs).filter((id) => !id.startsWith('t:#'));

describe('mapBoard: locals of the current frame', () => {
  it('maps primitives to var cards in the order of the frame names', () => {
    const b = boardAt(trace([key(2, [frame(1, 'Solution.f', { b: 'True', a: '-7', d: 'None', c: '1.5' }, ['a', 'b', 'c', 'd'])])]));
    expect(localIds(b)).toEqual(['t:a', 't:b', 't:c', 't:d']);
    expect(b.structs['t:a']).toEqual({ id: 't:a', name: 'a', kind: 'var', value: '-7' });
    expect(b.structs['t:b']).toEqual({ id: 't:b', name: 'b', kind: 'var', value: 'True' });
  });

  it('puts names missing from the frame names last, in the order they were bound', () => {
    const b = boardAt(trace([key(2, [frame(1, 'Solution.f', { z: '1', y: '2', a: '3' }, ['a'])])]));
    expect(localIds(b)).toEqual(['t:a', 't:z', 't:y']);
  });

  it('draws a string the function subscripts as a character array and any other string as a var', () => {
    const b = boardAt(one({ s: '"abc"', t: '"xy"' }, {}, { facts: facts({ strs: ['s'] }) })).structs;
    expect(b['t:s']).toEqual({ id: 't:s', name: 's', kind: 'array', items: ['"a"', '"b"', '"c"'], ptrs: [], chars: true });
    expect(b['t:t']).toEqual({ id: 't:t', name: 't', kind: 'var', value: '"xy"' });
  });

  // Review Focus 4
  it('splits subscripted strings by code point and keeps escaped quotes', () => {
    const b = boardAt(one({ s: '"héllo 😀"', q: '"a\\"b"' }, {}, { facts: facts({ strs: ['s', 'q'] }) })).structs;
    expect((b['t:s'] as ArrayS).items).toEqual(['"h"', '"é"', '"l"', '"l"', '"o"', '" "', '"😀"']);
    expect((b['t:q'] as ArrayS).items).toEqual(['"a"', '"\\""', '"b"']);
  });

  it('maps a non-empty list of lists to a grid with ragged rows and cells as text', () => {
    const b = boardAt(
      one({ g: R(1) }, { 1: ['LIST', R(2), R(3)], 2: ['LIST', '"1"', '"0"'], 3: ['LIST', R(4)], 4: ['LIST', '0', '0'] }),
    ).structs;
    expect(b['t:g']).toEqual({ id: 't:g', name: 'g', kind: 'grid', rows: [['"1"', '"0"'], ['[0, 0]']], marked: [], ptrs: [] });
  });

  it('maps other lists, empty and mixed ones included, to arrays with nested values as text', () => {
    const b = boardAt(one({ e: R(1), m: R(2) }, { 1: ['LIST'], 2: ['LIST', '1', R(3), '(1, 2)'], 3: ['LIST', '5'] })).structs;
    expect(b['t:e']).toEqual({ id: 't:e', name: 'e', kind: 'array', items: [], ptrs: [] });
    expect(b['t:m']).toEqual({ id: 't:m', name: 'm', kind: 'array', items: ['1', '[5]', '(1, 2)'], ptrs: [] });
  });

  it('maps dicts, sets and deques to map, set and queue cards', () => {
    const b = boardAt(
      one(
        { d: R(1), s: R(2), q: R(3) },
        {
          1: ['DICT', ['"a"', '1'], ['2', R(4)]],
          2: ['SET', '1', '2'],
          3: ['DEQUE', R(5), '7'],
          4: ['LIST', '1'],
          5: ['TNODE', '3', 'None', 'None'],
        },
      ),
    ).structs;
    expect(b['t:d']).toEqual({ id: 't:d', name: 'd', kind: 'map', entries: [['"a"', '1'], ['2', '[1]']] });
    expect(b['t:s']).toEqual({ id: 't:s', name: 's', kind: 'set', items: ['1', '2'] });
    expect(b['t:q']).toEqual({ id: 't:q', name: 'q', kind: 'queue', items: ['TreeNode(3)', '7'] });
  });

  it('maps tuples and other objects to var cards with their text', () => {
    const b = boardAt(
      one({ p: R(1), node: R(2) }, { 1: ['TUPLE', '1', '2'], 2: ['OBJ', 'Node', [['val', '1'], ['neighbors', R(3)]]], 3: ['LIST', '2'] }),
    ).structs;
    expect(b['t:p']).toEqual({ id: 't:p', name: 'p', kind: 'var', value: '(1, 2)' });
    expect(b['t:node']).toEqual({ id: 't:node', name: 'node', kind: 'var', value: 'Node(val=1, neighbors=[…])' });
  });

  // Review Focus 2
  it('shows a reference with no entry as …', () => {
    expect(boardAt(one({ x: R(9) })).structs['t:x']).toEqual({ id: 't:x', name: 'x', kind: 'var', value: '…' });
  });

  it('replaces self holding an object with one card per field, in its place', () => {
    const raw = trace([
      key(2, [frame(1, 'LRUCache.get', { self: R(1), key: '3' })], {
        1: ['OBJ', 'LRUCache', [['cap', '2'], ['cache', R(2)]]],
        2: ['DICT', ['1', '1']],
      }),
    ]);
    const b = boardAt(raw);
    expect(localIds(b)).toEqual(['t:self.cap', 't:self.cache', 't:key']);
    expect(b.structs['t:self.cap']).toEqual({ id: 't:self.cap', name: 'self.cap', kind: 'var', value: '2' });
    expect(b.structs['t:self.cache']).toEqual({ id: 't:self.cache', name: 'self.cache', kind: 'map', entries: [['1', '1']] });
  });

  it('keeps a self that is not an object as an ordinary card', () => {
    expect(boardAt(one({ self: '1' })).structs['t:self']).toEqual({ id: 't:self', name: 'self', kind: 'var', value: '1' });
  });

  it('draws a subscripted string field of self as a character array', () => {
    const raw = one({ self: R(1) }, { 1: ['OBJ', 'WordDictionary', [['word', '"ab"']]] }, { facts: facts({ strs: ['self.word'] }) });
    expect(boardAt(raw).structs['t:self.word']).toMatchObject({ kind: 'array', items: ['"a"', '"b"'], chars: true });
  });

  it('keeps the card id when the variable changes type, and changes its kind', () => {
    const raw = trace([
      key(2, [frame(1, 'Solution.f', { x: 'None' })]),
      step(3, { fd: [{ fid: 1, set: { x: R(1) } }], dh: { 1: ['LIST', '1'] } }),
      step(4, { fd: [{ fid: 1, set: { x: '"s"' } }] }),
    ]);
    expect(boardAt(raw, 0).structs['t:x']).toMatchObject({ kind: 'var', value: 'None' });
    expect(boardAt(raw, 1).structs['t:x']).toMatchObject({ kind: 'array', items: ['1'] });
    expect(boardAt(raw, 2).structs['t:x']).toMatchObject({ kind: 'var', value: '"s"' });
  });

  it('shows only the locals of the top frame, using the facts of the top function', () => {
    const raw = trace([key(5, [frame(1, 'Solution.f', { a: '1', s: '"ab"' }), frame(2, 'Solution.f.<locals>.g', { s: '"cd"' })])], {
      facts: { ...facts({}), ...facts({ strs: ['s'] }, 'Solution.f.<locals>.g') },
    });
    const b = boardAt(raw);
    expect(localIds(b)).toEqual(['t:s']);
    expect((b.structs['t:s'] as ArrayS).items).toEqual(['"c"', '"d"']);
  });

  it('uses the enclosing function facts for a genexpr frame with none of its own', () => {
    const raw = trace([key(5, [frame(1, 'Solution.f', {}), frame(2, 'Solution.f.<locals>.<genexpr>', { s: '"ab"' })])], { facts: facts({ strs: ['s'] }) });
    expect((boardAt(raw).structs['t:s'] as ArrayS).items).toEqual(['"a"', '"b"']);
  });
});
