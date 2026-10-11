// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { onKey } from '../../../src/panel/keys';
import { locKey, selKey } from '../../../src/panel/model/loc';
import type { BagS } from '../../../src/panel/model/types';
import { act, step, view } from '../../../src/panel/state';
import { editing } from '../../../src/panel/ui';
import { changedBag } from '../../../src/panel/views/diff';
import { MAX_ITEMS } from '../../../src/panel/views/limits';
import { board, draft, startSession } from '../../helpers/panel';
import { bySel, Live } from '../../helpers/views';

const bag = (kind: BagS['kind'], items: string[]): BagS => ({ id: 's1', name: kind, kind, items });
const item = (i: number) => ({ t: 'val' as const, at: { s: 's1', k: 'item' as const, i } });
const items = () => (draft().structs.s1 as BagS).items;
const button = (r: ReturnType<typeof render>, name: string) => r.getByRole('button', { name }) as HTMLButtonElement;

beforeAll(() => window.addEventListener('keydown', onKey));
afterAll(() => window.removeEventListener('keydown', onKey));
afterEach(cleanup);

describe('BagView', () => {
  it('a stack shows the top first with a "top" label', () => {
    startSession(board(bag('stack', ['1', '2', '3'])));
    const { container } = render(<Live id="s1" />);
    const slots = container.querySelectorAll('.lv-bag-items .lv-slot');
    expect([...slots].map((e) => e.textContent)).toEqual(['3', '2', '1']);
    expect(container.querySelector('.lv-bag-label')!.textContent).toBe('top');
  });

  it('a queue shows the front first with a "front" label', () => {
    startSession(board(bag('queue', ['1', '2', '3'])));
    const { container } = render(<Live id="s1" />);
    expect([...container.querySelectorAll('.lv-bag-items .lv-slot')].map((e) => e.textContent)).toEqual(['1', '2', '3']);
    expect(container.querySelector('.lv-bag-label')!.textContent).toBe('front');
  });

  it('the container is the drop target; items are not', () => {
    startSession(board(bag('set', ['1'])));
    const { container } = render(<Live id="s1" />);
    expect(container.querySelector('.lv-bag-items')!.getAttribute('data-drop')).toBe(locKey({ s: 's1', k: 'add' }));
    expect(bySel(container, item(0)).hasAttribute('data-drop')).toBe(false);
  });

  it('push adds an empty item on top and edits it; pop removes the top', () => {
    startSession(board(bag('stack', ['1'])));
    const r = render(<Live id="s1" />);
    fireEvent.click(button(r, 'Push'));
    expect(items()).toEqual(['1', '']);
    expect(editing.value).toBe(selKey(item(1)));
    fireEvent.click(button(r, 'Pop'));
    expect(items()).toEqual(['1']);
  });

  it('enqueue adds at the back; dequeue removes the front', () => {
    startSession(board(bag('queue', ['1', '2'])));
    const r = render(<Live id="s1" />);
    fireEvent.click(button(r, 'Enqueue'));
    expect(items()).toEqual(['1', '2', '']);
    fireEvent.click(button(r, 'Dequeue'));
    expect(items()).toEqual(['2', '']);
  });

  it('pop and dequeue are disabled on empty structures and do nothing', () => {
    startSession(board(bag('stack', [])));
    const a = render(<Live id="s1" />);
    expect(button(a, 'Pop').disabled).toBe(true);
    fireEvent.click(button(a, 'Pop'));
    expect(items()).toEqual([]);
    expect(a.container.querySelector('.lv-empty')!.textContent).toBe('empty');
    cleanup();
    startSession(board(bag('queue', [])));
    const b = render(<Live id="s1" />);
    expect(button(b, 'Dequeue').disabled).toBe(true);
    expect(button(b, 'Enqueue').disabled).toBe(false);
  });

  it('set + item twice edits the existing empty item instead of adding a duplicate', () => {
    startSession(board(bag('set', ['4'])));
    const r = render(<Live id="s1" />);
    fireEvent.click(button(r, 'Add item'));
    expect(items()).toEqual(['4', '']);
    editing.value = null;
    fireEvent.click(button(r, 'Add item'));
    expect(items()).toEqual(['4', '']);
    expect(editing.value).toBe(selKey(item(1)));
  });

  it('Delete removes a set item', () => {
    startSession(board(bag('set', ['1', '2', '3'])));
    const { container } = render(<Live id="s1" />);
    const el = bySel(container, item(1));
    el.focus();
    fireEvent.keyDown(el, { key: 'Delete' });
    expect(items()).toEqual(['1', '3']);
  });

  it('the × on a set item removes it with the mouse; stacks and queues have none', () => {
    startSession(board(bag('set', ['1', '2', '3'])));
    const r = render(<Live id="s1" />);
    const buttons = r.getAllByRole('button', { name: 'Remove item' });
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[1]);
    expect(items()).toEqual(['1', '3']);
    cleanup();
    startSession(board(bag('stack', ['1'])));
    expect(render(<Live id="s1" />).queryAllByRole('button', { name: 'Remove item' })).toHaveLength(0);
  });

  it('read-only frames disable every control and drop target', () => {
    startSession(board(bag('stack', ['1'])));
    step();
    view(0);
    const r = render(<Live id="s1" />);
    expect(button(r, 'Push').disabled).toBe(true);
    expect(button(r, 'Pop').disabled).toBe(true);
    expect(r.container.querySelector('.lv-bag-items')!.hasAttribute('data-drop')).toBe(false);
  });

  for (const [kind, label] of [['set', 'a set'], ['queue', 'a queue']] as const) {
    it(`read-only frames disable every control and drop target on ${label}`, () => {
      startSession(board(bag(kind, ['1', '2'])));
      step();
      view(0);
      const { container, getAllByRole } = render(<Live id="s1" />);
      expect(container.querySelector('[data-drop]')).toBeNull();
      expect(getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    });
  }

  it('renders at most 200 items, from the top of a stack', () => {
    startSession(board(bag('stack', Array.from({ length: 250 }, (_, i) => String(i)))));
    const { container } = render(<Live id="s1" />);
    const slots = container.querySelectorAll('.lv-bag-items .lv-slot');
    expect(slots).toHaveLength(MAX_ITEMS);
    expect(slots[0].textContent).toBe('249');
  });

  it('highlights a pushed item since the last frame', () => {
    startSession(board(bag('stack', ['1'])));
    step();
    act({ t: 'push', s: 's1', val: '2' });
    const { container } = render(<Live id="s1" />);
    expect(bySel(container, item(1)).classList.contains('lv-changed')).toBe(true);
    expect(bySel(container, item(0)).classList.contains('lv-changed')).toBe(false);
  });
});

describe('changedBag', () => {
  it('sets compare membership', () => {
    expect([...changedBag(bag('set', ['1', '2']), bag('set', ['2', '1', '3']))]).toEqual([2]);
  });

  it('queues skip the dequeued front, so a dequeue highlights nothing and an enqueue only the new back', () => {
    expect(changedBag(bag('queue', ['1', '2', '3']), bag('queue', ['2', '3'])).size).toBe(0);
    expect([...changedBag(bag('queue', ['1', '2']), bag('queue', ['2', '4']))]).toEqual([1]);
    expect([...changedBag(bag('queue', ['1']), bag('queue', ['1', '5']))]).toEqual([1]);
    expect([...changedBag(bag('queue', ['1', '2']), bag('queue', ['7']))]).toEqual([0]);
  });

  it('an edit in the middle of a queue highlights only that item', () => {
    expect([...changedBag(bag('queue', ['1', '2', '3']), bag('queue', ['1', '9', '3']))]).toEqual([1]);
  });

  it('stacks compare by index', () => {
    expect([...changedBag(bag('stack', ['1']), bag('stack', ['1', '2']))]).toEqual([1]);
  });
});
