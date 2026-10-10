import { describe, expect, it } from 'vitest';
import {
  continueFrom,
  edit,
  initHist,
  MAX_FRAMES,
  newCanvas,
  nextStep,
  redo,
  setLayout,
  setLine,
  setView,
  structIds,
  undo,
  type Hist,
} from '../../../src/panel/model/history';
import type { Op } from '../../../src/panel/model/ops';
import type { VarS } from '../../../src/panel/model/types';
import { board, v } from '../../helpers/boards';

const setX = (val: string): Op => ({ t: 'set', at: { s: 's1', k: 'var' }, val });
const x = (h: Hist) => (h.canvas.draft.structs.s1 as VarS).value;
const start = () => initHist(newCanvas(board(v('s1', '0'), v('s2', 'a'))));
const step = (h: Hist) => nextStep(h)!;

describe('newCanvas', () => {
  it('seeds frame 0 and the draft with the same board', () => {
    const b = board(v('s1', '0'));
    const c = newCanvas(b);
    expect(c).toEqual({ v: 1, frames: [{ board: b }], draft: b, layout: {}, view: { x: 0, y: 0, zoom: 1 } });
    expect(c.draft).toBe(c.frames[0].board);
  });
});

describe('edit, undo and redo', () => {
  it('records edits and steps back through them', () => {
    let h = edit(edit(start(), setX('1')), setX('2'));
    expect(x(h)).toBe('2');
    h = undo(h);
    expect(x(h)).toBe('1');
    h = undo(h);
    expect(x(h)).toBe('0');
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(x(h)).toBe('2');
    expect(redo(h)).toBe(h);
  });

  it('does not record a no-op edit', () => {
    const h = start();
    expect(edit(h, setX('0'))).toBe(h);
  });

  it('clears the redo stack on a new edit', () => {
    const h = edit(undo(edit(start(), setX('1'))), setX('5'));
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
    expect(x(h)).toBe('5');
  });

  it('leaves earlier history objects untouched', () => {
    const h1 = edit(start(), setX('1'));
    const before = JSON.stringify(h1);
    edit(undo(h1), setX('2'));
    expect(JSON.stringify(h1)).toBe(before);
  });
});

describe('frames', () => {
  it('Next step pushes the draft and shares unchanged structures', () => {
    const h = step(edit(start(), setX('1')));
    const [f0, f1] = h.canvas.frames;
    expect(h.canvas.frames).toHaveLength(2);
    expect(f1.board).toBe(h.canvas.draft);
    expect(f1.board.structs.s2).toBe(f0.board.structs.s2);
    expect(f1.board.structs.s1).not.toBe(f0.board.structs.s1);
  });

  it('attaches a line tag to the new frame', () => {
    expect(nextStep(start(), 12)!.canvas.frames[1]).toEqual({ board: start().canvas.draft, line: 12 });
  });

  it('undoing past a frame boundary reopens that frame as the draft', () => {
    let h = step(edit(start(), setX('1')));
    h = edit(h, setX('2'));
    h = undo(h);
    expect(x(h)).toBe('1');
    expect(h.canvas.frames).toHaveLength(2);
    h = undo(h);
    expect(h.canvas.frames).toHaveLength(1);
    expect(x(h)).toBe('1');
    h = undo(h);
    expect(x(h)).toBe('0');
    h = redo(redo(h));
    expect(h.canvas.frames).toHaveLength(2);
  });

  it(`refuses frame ${MAX_FRAMES + 1}`, () => {
    let h = start();
    for (let i = 1; i < MAX_FRAMES; i++) h = step(h);
    expect(h.canvas.frames).toHaveLength(MAX_FRAMES);
    expect(nextStep(h)).toBeNull();
  });
});

describe('continueFrom', () => {
  const three = () => step(edit(step(edit(start(), setX('1'))), setX('2')));

  it('keeps frames 0..k and makes frame k the draft', () => {
    const h = continueFrom(edit(three(), setX('3')), 1);
    expect(h.canvas.frames).toHaveLength(2);
    expect(h.canvas.draft).toBe(h.canvas.frames[1].board);
    expect(x(h)).toBe('1');
  });

  it('can continue from frame 0 without dropping it', () => {
    const h = continueFrom(three(), 0);
    expect(h.canvas.frames).toHaveLength(1);
    expect(x(h)).toBe('0');
  });

  it('is undone in one step', () => {
    const before = edit(three(), setX('3'));
    const h = undo(continueFrom(before, 0));
    expect(h.canvas.frames).toBe(before.canvas.frames);
    expect(h.canvas.draft).toBe(before.canvas.draft);
  });

  it('is a no-op out of range or on the last frame with an unedited draft', () => {
    const h = three();
    expect(continueFrom(h, 3)).toBe(h);
    expect(continueFrom(h, -1)).toBe(h);
    expect(continueFrom(h, 2)).toBe(h);
  });
});

describe('setLine', () => {
  it('tags and untags a frame as an undoable action', () => {
    const h0 = step(start());
    const h1 = setLine(h0, 1, 7);
    expect(h1.canvas.frames[1].line).toBe(7);
    expect(h1.canvas.frames[0]).toBe(h0.canvas.frames[0]);
    const h2 = setLine(h1, 1, undefined);
    expect(h2.canvas.frames[1]).toEqual({ board: h0.canvas.draft });
    expect(undo(h2).canvas.frames[1].line).toBe(7);
  });

  it('is a no-op for the same value or a missing frame', () => {
    const h = setLine(step(start()), 1, 7);
    expect(setLine(h, 1, 7)).toBe(h);
    expect(setLine(h, 5, 1)).toBe(h);
  });
});

describe('layout and viewport', () => {
  it('are not undoable', () => {
    let h = edit(start(), setX('1'));
    h = setView(setLayout(h, { s1: { x: 16, y: 16 } }), { x: 5, y: 6, zoom: 0.5 });
    expect(h.past).toHaveLength(1);
    const u = undo(h);
    expect(u.canvas.layout).toEqual({ s1: { x: 16, y: 16 } });
    expect(u.canvas.view).toEqual({ x: 5, y: 6, zoom: 0.5 });
  });

  it('merge positions and skip unchanged updates', () => {
    let h = setLayout(start(), { s1: { x: 1, y: 2 } });
    h = setLayout(h, { s2: { x: 3, y: 4 } });
    expect(h.canvas.layout).toEqual({ s1: { x: 1, y: 2 }, s2: { x: 3, y: 4 } });
    expect(setLayout(h, { s1: { x: 1, y: 2 } })).toBe(h);
    expect(setView(h, { x: 0, y: 0, zoom: 1 })).toBe(h);
  });
});

describe('structIds', () => {
  it('collects ids from layout, draft and every frame', () => {
    let h = step(edit(start(), { t: 'add', struct: v('s3', '1') }));
    h = edit(h, { t: 'remove', s: 's3' });
    h = setLayout(h, { s7: { x: 0, y: 0 } });
    expect([...structIds(h.canvas)].sort()).toEqual(['s1', 's2', 's3', 's7']);
  });
});
