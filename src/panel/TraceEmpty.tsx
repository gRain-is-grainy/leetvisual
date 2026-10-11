import { traced } from './tracer';

// Spec §6.1: before the first trace, and for every outcome without steps, in place of the board.
export function TraceEmpty() {
  const t = traced.value;
  return (
    <p class="lv-trace-empty" role="status" data-testid="trace-empty">
      {t.t === 'msg' ? t.text : 'Press Trace to run your code on this test case.'}
    </p>
  );
}
