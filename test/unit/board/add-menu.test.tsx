// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AddMenu } from '../../../src/panel/board/AddMenu';
import type { VarS } from '../../../src/panel/model/types';
import { placeCards, step, view } from '../../../src/panel/state';
import { board, draft, startSession } from '../../helpers/panel';

const x: VarS = { id: 's1', name: 'x', kind: 'var', value: '0' };
const menuOpen = () => screen.queryByRole('menu') !== null;

beforeEach(() => startSession(board(x)));
afterEach(cleanup);

describe('AddMenu', () => {
  it('mouse: opens the menu and adds a stack with a fresh id and name', () => {
    render(<AddMenu />);
    fireEvent.click(screen.getByTestId('add-menu'));
    expect(screen.getAllByRole('menuitem').map((e) => e.textContent)).toEqual([
      'Variable', 'Array', 'Grid', 'Map', 'Set', 'Stack', 'Queue', 'Linked list', 'Binary tree', 'Call stack',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stack' }));
    expect(draft().structs.s2).toEqual({ id: 's2', name: 'stack', kind: 'stack', items: [] });
    expect(menuOpen()).toBe(false);
  });

  it('focuses the first item when opened and returns focus to the button on Esc', () => {
    render(<AddMenu />);
    const button = screen.getByTestId('add-menu');
    fireEvent.click(button);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Variable' }));
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Map' }), { key: 'Escape' });
    expect(menuOpen()).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('keyboard: the array form focuses Length and submits length and fill', () => {
    render(<AddMenu />);
    fireEvent.click(screen.getByTestId('add-menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Array' }));
    const length = screen.getByLabelText('Length') as HTMLInputElement;
    expect(document.activeElement).toBe(length);
    fireEvent.input(length, { target: { value: '4' } });
    fireEvent.input(screen.getByLabelText('Fill'), { target: { value: '"."' } });
    fireEvent.submit(length.form!);
    expect(draft().structs.s2).toEqual({ id: 's2', name: 'arr', kind: 'array', items: ['"."', '"."', '"."', '"."'], ptrs: [] });
    expect(menuOpen()).toBe(false);
  });

  it('caps the array form at the render limit and the grid form at 30 × 30', () => {
    render(<AddMenu />);
    fireEvent.click(screen.getByTestId('add-menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Array' }));
    const length = screen.getByLabelText('Length') as HTMLInputElement;
    fireEvent.input(length, { target: { value: '500' } });
    fireEvent.submit(length.form!);
    expect((draft().structs.s2 as { items: string[] }).items).toHaveLength(200);
    fireEvent.click(screen.getByTestId('add-menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Grid' }));
    fireEvent.input(screen.getByLabelText('Rows'), { target: { value: '40' } });
    fireEvent.input(screen.getByLabelText('Columns'), { target: { value: '2' } });
    fireEvent.submit((screen.getByLabelText('Rows') as HTMLInputElement).form!);
    const g = draft().structs.s3 as { name: string; rows: string[][] };
    expect(g.name).toBe('grid');
    expect(g.rows).toHaveLength(30);
    expect(g.rows[0]).toEqual(['0', '0']);
  });

  it('never reuses an id that the layout or an earlier frame used', () => {
    placeCards({ s5: { x: 0, y: 0 } });
    render(<AddMenu />);
    fireEvent.click(screen.getByTestId('add-menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Variable' }));
    expect(draft().structs.s6).toEqual({ id: 's6', name: 'x2', kind: 'var', value: '' });
  });

  it('closes when the pointer goes down outside it', () => {
    render(<AddMenu />);
    fireEvent.click(screen.getByTestId('add-menu'));
    fireEvent.pointerDown(document.body);
    expect(menuOpen()).toBe(false);
  });

  it('is disabled while viewing an earlier frame', () => {
    step();
    view(0);
    render(<AddMenu />);
    expect((screen.getByTestId('add-menu') as HTMLButtonElement).disabled).toBe(true);
  });
});
