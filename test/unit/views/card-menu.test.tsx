// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from '../../../src/panel/board/Card';
import type { ArrayS, ListS, TreeS, VarS } from '../../../src/panel/model/types';
import { act } from '../../../src/panel/state';
import { cardMenu } from '../../../src/panel/views/index';
import { board, draft, startSession } from '../../helpers/panel';

const nums: ArrayS = { id: 's1', name: 'nums', kind: 'array', items: ['1', '2', '3'], ptrs: [] };
const x: VarS = { id: 's2', name: 'x', kind: 'var', value: '0' };

afterEach(cleanup);

describe('cardMenu', () => {
  it('offers Build as list and Build as tree on array cards only', () => {
    expect(cardMenu(nums)).toEqual([
      { label: 'Build as list', op: { t: 'rebuild', s: 's1', as: 'list' } },
      { label: 'Build as tree', op: { t: 'rebuild', s: 's1', as: 'tree' } },
    ]);
    expect(cardMenu(x)).toEqual([]);
  });

  it('Build as list turns the card into a list pool with a head pointer named after it', () => {
    startSession(board(nums, x));
    act(cardMenu(nums)[0].op);
    const l = draft().structs.s1 as ListS;
    expect(l.kind).toBe('list');
    expect(l.name).toBe('nums');
    expect(Object.values(l.nodes).map((n) => n.val)).toEqual(['1', '2', '3']);
    expect(l.ptrs).toEqual([{ name: 'nums', at: Object.keys(l.nodes)[0] }]);
    expect(draft().structs.s2).toBe(x);
  });

  it('Build as tree builds level order with null gaps', () => {
    startSession(board({ ...nums, items: ['1', 'null', '2'] }));
    act(cardMenu(nums)[1].op);
    const t = draft().structs.s1 as TreeS;
    expect(t.kind).toBe('tree');
    expect(Object.keys(t.nodes)).toHaveLength(2);
  });

  // Plan 3's CardMenu never rendered before this task (cardMenu returned []), so this is its first test.
  it('the card ⋯ menu lists both items and Build as list rebuilds the card', () => {
    startSession(board(nums, x));
    render(<Card s={nums} isNew={false} pos={{ x: 0, y: 0 }} ro={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'nums menu' }));
    expect(screen.getAllByRole('menuitem').map((e) => e.textContent)).toEqual(['Build as list', 'Build as tree']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Build as list' }));
    expect(draft().structs.s1.kind).toBe('list');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
