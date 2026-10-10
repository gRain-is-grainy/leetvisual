// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, canvas, pendingLine, step, view, viewing } from '../../../src/panel/state';
import { Timeline } from '../../../src/panel/timeline/Timeline';
import { arr, board, draft, startSession } from '../../helpers/panel';

beforeEach(() => {
  startSession(board(arr('s1', 'nums', ['2', '7'])));
  render(<Timeline />);
});
afterEach(cleanup);

const label = () => screen.getByTestId('frame-label').textContent;
const scrub = () => screen.getByTestId('scrubber') as HTMLInputElement;
const btn = (id: string) => screen.getByTestId(id) as HTMLButtonElement;
const setFirst = (v: string) => act({ t: 'set', at: { s: 's1', k: 'item', i: 0 }, val: v });

describe('Timeline', () => {
  it('starts on the draft with no frames after the seed', () => {
    expect(label()).toBe('Draft');
    expect(scrub().max).toBe('1');
    expect(scrub().value).toBe('1');
    expect(btn('next-frame').disabled).toBe(true);
    expect(btn('undo').disabled).toBe(true);
    expect(btn('redo').disabled).toBe(true);
  });

  it('makes a frame with Next step', async () => {
    fireEvent.click(btn('next-step'));
    expect(canvas.value!.frames).toHaveLength(2);
    await waitFor(() => expect(scrub().max).toBe('2'));
    expect(label()).toBe('Draft');
  });

  it('walks frames with the buttons and labels them Start, Step k and Draft', async () => {
    step();
    step();
    fireEvent.click(btn('prev-frame'));
    await waitFor(() => expect(label()).toBe('Step 2'));
    fireEvent.click(btn('prev-frame'));
    fireEvent.click(btn('prev-frame'));
    await waitFor(() => expect(label()).toBe('Start'));
    expect(btn('prev-frame').disabled).toBe(true);
    fireEvent.click(btn('next-frame'));
    await waitFor(() => expect(label()).toBe('Step 1'));
  });

  it('jumps with the scrubber', async () => {
    step();
    await waitFor(() => expect(scrub().max).toBe('2'));
    fireEvent.input(scrub(), { target: { value: '0' } });
    expect(viewing.value).toBe(0);
    await waitFor(() => expect(label()).toBe('Start'));
    fireEvent.input(scrub(), { target: { value: '2' } });
    expect(viewing.value).toBeNull();
  });

  it('offers Continue from here instead of Next step on an earlier frame', async () => {
    setFirst('5');
    step();
    setFirst('6');
    step();
    view(1);
    await waitFor(() => expect(screen.queryByTestId('next-step')).toBeNull());
    fireEvent.click(btn('continue'));
    expect(canvas.value!.frames).toHaveLength(2);
    expect(viewing.value).toBeNull();
    expect(draft().structs.s1).toMatchObject({ items: ['5', '7'] });
  });

  it('tags the next frame from the draft and an existing frame when viewed', async () => {
    const tag = () => screen.getByTestId('line-tag') as HTMLInputElement;
    fireEvent.change(tag(), { target: { value: '4' } });
    expect(pendingLine.value).toBe(4);
    step();
    expect(canvas.value!.frames[1].line).toBe(4);
    view(1);
    await waitFor(() => expect(tag().value).toBe('4'));
    fireEvent.change(tag(), { target: { value: '7' } });
    expect(canvas.value!.frames[1].line).toBe(7);
    fireEvent.change(tag(), { target: { value: '' } });
    expect(canvas.value!.frames[1].line).toBeUndefined();
  });

  it('ignores a line tag that is not a positive whole number and shows the kept one', () => {
    const tag = screen.getByTestId('line-tag') as HTMLInputElement;
    fireEvent.change(tag, { target: { value: '-3' } });
    fireEvent.change(tag, { target: { value: '2.5' } });
    expect(pendingLine.value).toBeUndefined();
    expect(tag.value).toBe('');
  });

  it('undoes and redoes with the buttons', async () => {
    setFirst('5');
    await waitFor(() => expect(btn('undo').disabled).toBe(false));
    fireEvent.click(btn('undo'));
    expect(draft().structs.s1).toMatchObject({ items: ['2', '7'] });
    await waitFor(() => expect(btn('redo').disabled).toBe(false));
    fireEvent.click(btn('redo'));
    expect(draft().structs.s1).toMatchObject({ items: ['5', '7'] });
  });
});
