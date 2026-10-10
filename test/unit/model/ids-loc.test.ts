import { describe, expect, it } from 'vitest';
import { byId, idNum, nextId } from '../../../src/panel/model/ids';
import { locKey, parseLoc, parseSel, readVal, selKey, type Loc, type Sel } from '../../../src/panel/model/loc';
import { arr, bag, board, calls, grid, list, map, tree, v } from '../../helpers/boards';

describe('ids', () => {
  it('reads the numeric suffix', () => {
    expect(idNum('s12')).toBe(12);
    expect(idNum('n3')).toBe(3);
    expect(idNum('x')).toBe(0);
  });

  it('orders by number, not by text', () => {
    expect(['n10', 'n2', 'n1'].sort(byId)).toEqual(['n1', 'n2', 'n10']);
  });

  it('numbers past the largest taken id', () => {
    expect(nextId('s', [])).toBe('s1');
    expect(nextId('n', ['n1', 'n9', 'n3'])).toBe('n10');
    expect(nextId('s', new Set(['s2']))).toBe('s3');
  });
});

describe('loc keys', () => {
  const locs: Loc[] = [
    { s: 's1', k: 'item', i: 3 },
    { s: 's1', k: 'cell', r: 0, c: 2 },
    { s: 's1', k: 'node', n: 'n4' },
    { s: 's1', k: 'key', i: 0 },
    { s: 's1', k: 'val', i: 1 },
    { s: 's1', k: 'var' },
    { s: 's1', k: 'fn', f: 2 },
    { s: 's1', k: 'local', f: 0, i: 1 },
    { s: 's1', k: 'lname', f: 0, i: 1 },
    { s: 's1', k: 'add' },
  ];

  it.each(locs)('round-trips %j', (l) => {
    expect(parseLoc(locKey(l))).toEqual(l);
  });

  it('is canonical whatever the property order', () => {
    expect(locKey({ i: 3, k: 'item', s: 's1' } as Loc)).toBe('["s1","item",3]');
  });

  it.each(['', 'x', '{}', '[]', '["s1","item"]', '["s1","item",-1]', '["s1","item",1.5]', '["s1","bogus",1]', '[1,"var"]'])(
    'rejects %j',
    (k) => {
      expect(parseLoc(k)).toBeNull();
    },
  );

  const sels: Sel[] = [
    { t: 'card', s: 's1' },
    { t: 'val', at: { s: 's1', k: 'item', i: 3 } },
    { t: 'ptr', s: 's1', name: 'i|"j"' },
    { t: 'link', s: 's3', n: 'n4', side: 'next' },
  ];

  it.each(sels)('round-trips selection %j', (s) => {
    expect(parseSel(selKey(s))).toEqual(s);
  });

  it('formats selection keys as documented', () => {
    expect(selKey({ t: 'val', at: { s: 's1', k: 'item', i: 3 } })).toBe('["val","s1","item",3]');
    expect(selKey({ t: 'ptr', s: 's1', name: 'i' })).toBe('["ptr","s1","i"]');
    expect(selKey({ t: 'card', s: 's1' })).toBe('["card","s1"]');
    expect(selKey({ t: 'link', s: 's3', n: 'n4', side: 'next' })).toBe('["link","s3","n4","next"]');
  });

  it.each(['["card"]', '["ptr","s1"]', '["link","s1","n1","up"]', '["val","s1","item"]', '["nope","s1"]'])(
    'rejects selection %j',
    (k) => {
      expect(parseSel(k)).toBeNull();
    },
  );
});

describe('readVal', () => {
  const b = board(
    arr('s1', ['1', '2']),
    grid('s2', [['"a"'], ['"b"', '"c"']]),
    list('s3', { n1: { val: '5', next: null } }),
    tree('s4', { n1: { val: '9', left: null, right: null } }),
    map('s5', [['"k"', '1']]),
    bag('s6', 'stack', ['7']),
    v('s7', '42'),
    calls('s8', [{ fn: 'dfs', locals: [['i', '0']] }]),
  );

  it('reads every kind of slot', () => {
    expect(readVal(b, { s: 's1', k: 'item', i: 1 })).toBe('2');
    expect(readVal(b, { s: 's2', k: 'cell', r: 1, c: 1 })).toBe('"c"');
    expect(readVal(b, { s: 's3', k: 'node', n: 'n1' })).toBe('5');
    expect(readVal(b, { s: 's4', k: 'node', n: 'n1' })).toBe('9');
    expect(readVal(b, { s: 's5', k: 'key', i: 0 })).toBe('"k"');
    expect(readVal(b, { s: 's5', k: 'val', i: 0 })).toBe('1');
    expect(readVal(b, { s: 's6', k: 'item', i: 0 })).toBe('7');
    expect(readVal(b, { s: 's7', k: 'var' })).toBe('42');
    expect(readVal(b, { s: 's8', k: 'fn', f: 0 })).toBe('dfs');
    expect(readVal(b, { s: 's8', k: 'lname', f: 0, i: 0 })).toBe('i');
    expect(readVal(b, { s: 's8', k: 'local', f: 0, i: 0 })).toBe('0');
  });

  it('returns undefined for missing slots, wrong kinds and add targets', () => {
    expect(readVal(b, { s: 's1', k: 'item', i: 5 })).toBeUndefined();
    expect(readVal(b, { s: 's9', k: 'var' })).toBeUndefined();
    expect(readVal(b, { s: 's1', k: 'var' })).toBeUndefined();
    expect(readVal(b, { s: 's2', k: 'cell', r: 0, c: 1 })).toBeUndefined();
    expect(readVal(b, { s: 's3', k: 'node', n: 'constructor' })).toBeUndefined();
    expect(readVal(b, { s: 's6', k: 'add' })).toBeUndefined();
  });
});
