// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setMode, setTraceLayout, stepTo, traced, traceLayout, traceSizes } from '../../../src/panel/tracer';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, fakeSize, fireResize, stubLayout, vr } from '../../helpers/panel';
import { result, startTrace } from '../../helpers/trace';

// A card is 40 px of header and padding plus 20 px per value slot, so a card's largest version is its tallest.
beforeAll(() => {
  stubLayout();
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      const el = this as HTMLElement;
      if (el.dataset.card) return 40 + 20 * el.querySelectorAll('.lv-slot').length;
      return el.dataset.testid === 'board' ? fakeSize.board.h : 0;
    },
  });
});
afterEach(() => {
  cleanup();
  fakeSize.board = { w: 800, h: 600 };
});

const STEPS = [
  board(arr('t:nums', 'nums', ['2'])),
  board(arr('t:nums', 'nums', ['2', '7', '11']), vr('t:i', 'i', '0')),
  board(vr('t:i', 'i', '1'), vr('t:#return', 'return', '[0, 1]')),
];
const ALL = ['t:nums', 't:i', 't:#return'];

describe('trace card places', () => {
  it("reserves every card's place from its largest version, stacked in order of first appearance, then drops the copies", async () => {
    await startTrace(result(STEPS));
    render(<Workspace />);
    await waitFor(() => expect(Object.keys(traceLayout.value)).toEqual(ALL));
    // nums is 100 px tall at its largest (3 slots), though step 0 draws 1 slot
    expect(traceLayout.value).toEqual({ 't:nums': { x: 16, y: 16 }, 't:i': { x: 16, y: 132 }, 't:#return': { x: 16, y: 208 } });
    expect(traceSizes.value).toEqual({ 't:nums': { w: 100, h: 100 }, 't:i': { w: 100, h: 60 }, 't:#return': { w: 100, h: 60 } });
    await waitFor(() => expect(document.querySelector('.lv-sizer')).toBeNull());
    expect(document.querySelectorAll('[data-card]')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('[data-card="t:nums"]')!.style.visibility).toBe('visible');
  });

  it('never moves a card while scrubbing', async () => {
    await startTrace(result(STEPS));
    render(<Workspace />);
    await waitFor(() => expect(Object.keys(traceLayout.value)).toEqual(ALL));
    const before = traceLayout.value;
    stepTo(1);
    await waitFor(() => expect(document.querySelector('[data-card="t:i"]')).not.toBeNull());
    stepTo(2);
    await waitFor(() => expect(document.querySelector('[data-card="t:#return"]')).not.toBeNull());
    expect(traceLayout.value).toBe(before);
  });

  it('keeps the place of a card with the same name when tracing again and places new cards around it', async () => {
    await startTrace(null);
    setTraceLayout({ 't:nums': { x: 300, y: 40 } });
    traced.value = { t: 'trace', result: result(STEPS) };
    render(<Workspace />);
    await waitFor(() => expect(Object.keys(traceLayout.value)).toHaveLength(3));
    expect(traceLayout.value).toEqual({ 't:nums': { x: 300, y: 40 }, 't:i': { x: 16, y: 16 }, 't:#return': { x: 16, y: 92 } });
  });

  // Review Focus 4
  it('waits for a hidden board before reserving places', async () => {
    fakeSize.board = { w: 0, h: 0 };
    await startTrace(result(STEPS));
    render(<Workspace />);
    await new Promise((r) => setTimeout(r, 0));
    expect(traceLayout.value).toEqual({});
    fakeSize.board = { w: 800, h: 600 };
    fireResize();
    await waitFor(() => expect(Object.keys(traceLayout.value)).toEqual(ALL));
    expect(traceSizes.value['t:nums']).toEqual({ w: 100, h: 100 });
  });

  it('pushes the cards below down when a card outgrows its reserved place', async () => {
    await startTrace(result(STEPS));
    render(<Workspace />);
    await waitFor(() => expect(Object.keys(traceLayout.value)).toEqual(ALL));
    // As if nums had been reserved shorter than the steps draw it, with i right under that.
    setTraceLayout({ 't:i': { x: 16, y: 72 } }, { 't:nums': { w: 100, h: 40 } });
    await waitFor(() => expect(traceLayout.value['t:i']).toEqual({ x: 16, y: 92 }));
    stepTo(1);
    await waitFor(() => expect(traceLayout.value['t:i']).toEqual({ x: 16, y: 132 }));
    expect(traceSizes.value['t:nums']).toEqual({ w: 100, h: 100 });
    expect(traceLayout.value['t:nums']).toEqual({ x: 16, y: 16 });
    expect(traceLayout.value['t:#return']).toEqual({ x: 16, y: 208 });
  });

  it('keeps the places the user set across a Canvas to Trace switch', async () => {
    await startTrace(result(STEPS));
    render(<Workspace />);
    await waitFor(() => expect(Object.keys(traceLayout.value)).toEqual(ALL));
    // Free space under step 0's one-slot nums, but inside its 100 px reservation.
    setTraceLayout({ 't:i': { x: 16, y: 70 } });
    const [lay, sizes] = [traceLayout.value, traceSizes.value];
    setMode('canvas');
    await waitFor(() => expect(document.querySelector('.lv-trace')).toBeNull());
    setMode('trace');
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector('.lv-sizer')).toBeNull();
    expect(traceLayout.value).toEqual(lay);
    expect(traceSizes.value).toEqual(sizes);
  });
});
