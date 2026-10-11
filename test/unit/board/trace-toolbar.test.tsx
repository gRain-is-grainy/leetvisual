// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mode, onCode, onCodeChanged, setMode } from '../../../src/panel/tracer';
import { Workspace } from '../../../src/panel/Workspace';
import { arr, board, stubLayout } from '../../helpers/panel';
import { CODE, result, startTrace } from '../../helpers/trace';

const B = [board(arr('t:nums', 'nums', ['2', '7']))];
const L = { 't:nums': { x: 16, y: 16 } };
const run = () => screen.getByTestId('trace-run');

beforeAll(() => stubLayout());
afterEach(cleanup);

describe('mode switch', () => {
  it('switches modes with two pressed-state buttons at the left of the toolbar', async () => {
    const d = await startTrace(null);
    setMode('canvas');
    render(<Workspace />);
    const toCanvas = screen.getByTestId('mode-canvas');
    const toTrace = screen.getByTestId('mode-trace');
    expect(toCanvas.tagName).toBe('BUTTON');
    expect(toCanvas.closest('.lv-toolbar-left')).not.toBeNull();
    expect([toCanvas.getAttribute('aria-pressed'), toTrace.getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    expect(screen.getByTestId('add-menu')).toBeTruthy();
    expect(screen.getByTestId('timeline')).toBeTruthy();
    fireEvent.click(toTrace);
    await waitFor(() => expect(toTrace.getAttribute('aria-pressed')).toBe('true'));
    expect(mode.value).toBe('trace');
    expect(d.runner.starts).toBe(2); // startTrace's switch, then this one
    expect(screen.queryByTestId('add-menu')).toBeNull();
    expect(screen.queryByTestId('timeline')).toBeNull();
    expect(run().textContent).toBe('Trace');
    fireEvent.click(toCanvas);
    await waitFor(() => expect(screen.getByTestId('add-menu')).toBeTruthy());
  });

  it('marks the workspace lv-trace in Trace mode only', async () => {
    await startTrace(result(B), L);
    const { container } = render(<Workspace />);
    expect(container.querySelector('.lv-workspace')!.classList.contains('lv-trace')).toBe(true);
    setMode('canvas');
    await waitFor(() => expect(container.querySelector('.lv-workspace')!.classList.contains('lv-trace')).toBe(false));
  });
});

describe('Trace controls', () => {
  it('shows the empty state in place of the board before the first trace', async () => {
    await startTrace(null);
    render(<Workspace />);
    expect(screen.getByTestId('trace-empty').textContent).toBe('Press Trace to run your code on this test case.');
    expect(screen.queryByTestId('board')).toBeNull();
    expect(screen.queryByTestId('trace-stale')).toBeNull();
  });

  it('reads Stop while tracing, stops with it, and shows the status line', async () => {
    const d = await startTrace(null);
    render(<Workspace />);
    fireEvent.click(run());
    await waitFor(() => expect(run().textContent).toBe('Stop'));
    expect(screen.getByTestId('trace-status').textContent).toBe('Tracing…');
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await waitFor(() => expect(d.runner.jobs).toHaveLength(1));
    fireEvent.click(run());
    await waitFor(() => expect(run().textContent).toBe('Trace'));
    expect(d.runner.stops).toBe(1);
    d.runner.status('restarting');
    await waitFor(() => expect(screen.getByTestId('trace-status').textContent).toBe('Restarting Python…'));
    d.runner.status('starting');
    await waitFor(() => expect(screen.getByTestId('trace-status').textContent).toBe('Starting Python…'));
    d.runner.status('ready');
    await waitFor(() => expect(screen.getByTestId('trace-status').textContent).toBe(''));
  });

  it('draws the first step after a trace and each step-less outcome as a message', async () => {
    const d = await startTrace(null);
    render(<Workspace />);
    fireEvent.click(run());
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await waitFor(() => expect(d.runner.jobs).toHaveLength(1));
    d.runner.finish(result(B));
    await waitFor(() => expect(document.querySelector('[data-card="t:nums"]')).not.toBeNull());
    expect(screen.queryByTestId('trace-empty')).toBeNull();
    expect(run().textContent).toBe('Trace');
    fireEvent.click(run());
    onCode({ type: 'code', code: CODE, lang: 'python3' });
    await waitFor(() => expect(d.runner.jobs).toHaveLength(2));
    d.runner.finish(result([], { kind: 'input', param: 'nums' }));
    await waitFor(() => expect(screen.getByTestId('trace-empty').textContent).toBe('Couldn\'t read input "nums".'));
    expect(screen.queryByTestId('board')).toBeNull();
  });

  it('shows the stale badge after an edit and re-traces from it', async () => {
    const d = await startTrace(result(B), L);
    render(<Workspace />);
    expect(screen.queryByTestId('trace-stale')).toBeNull();
    onCodeChanged();
    await waitFor(() => expect(screen.getByTestId('trace-stale').textContent).toBe('Stale, re-trace'));
    expect(screen.getByTestId('trace-stale').tagName).toBe('BUTTON');
    fireEvent.click(screen.getByTestId('trace-stale'));
    expect(d.sent.filter((m) => m.type === 'getCode')).toHaveLength(1);
    await waitFor(() => expect(run().textContent).toBe('Stop'));
  });
});

describe('Banner in Trace mode', () => {
  it('names the 200-item cut when the trace was truncated', async () => {
    await startTrace(result(B, undefined, { truncated: true }), L);
    render(<Workspace />);
    expect(screen.getByTestId('banner').textContent).toBe('Large input: each structure shows its first 200 items. Try a smaller custom test case.');
  });

  it('shows nothing for a trace that was not cut', async () => {
    await startTrace(result(B), L);
    render(<Workspace />);
    expect(screen.queryByTestId('banner')).toBeNull();
  });
});
