// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"navigation":{"disableChildFrameNavigation":true}}}
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrame, floatBox, positionFrame, showFrame } from '../../../src/content/frame';

const SRC = 'chrome-extension://abc/panel.html';

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

describe('createFrame', () => {
  it('mounts one hidden, fixed iframe on <body>, outside the page tree', () => {
    const frame = createFrame(document, SRC);
    expect(frame.parentElement).toBe(document.body);
    expect(frame.hasAttribute('data-leetvisual-frame')).toBe(true);
    expect(frame.getAttribute('src')).toBe(SRC);
    expect(frame.title).toBe('LeetVisual canvas');
    expect(frame.style.position).toBe('fixed');
    expect(frame.style.display).toBe('none');
    expect(frame.style.zIndex).toBe('30');
    expect(frame.hasAttribute('allow')).toBe(false);
  });
});

describe('positionFrame', () => {
  it('copies a rect into pixel styles', () => {
    const frame = createFrame(document, SRC);
    positionFrame(frame, { left: 469.5, top: 899, width: 450, height: 0 });
    expect([frame.style.left, frame.style.top, frame.style.width, frame.style.height]).toEqual(['469.5px', '899px', '450px', '0px']);
  });
});

describe('floatBox', () => {
  it('sits at the bottom right, capped at 560 x 420', () => {
    expect(floatBox({ innerWidth: 1280, innerHeight: 720 })).toEqual({ left: 704, top: 284, width: 560, height: 420 });
  });

  it('shrinks to 90vw x 60vh on small windows', () => {
    expect(floatBox({ innerWidth: 400, innerHeight: 300 })).toEqual({ left: 24, top: 104, width: 360, height: 180 });
  });
});

describe('showFrame', () => {
  it('shows and focuses, then hides without unloading', () => {
    const frame = createFrame(document, SRC);
    const focus = vi.spyOn(frame, 'focus');
    showFrame(frame, true);
    expect(frame.style.display).toBe('block');
    expect(focus).toHaveBeenCalledTimes(1);
    showFrame(frame, false);
    expect(frame.style.display).toBe('none');
    expect(frame.isConnected).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
