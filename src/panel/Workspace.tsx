import { Banner } from './Banner';
import { Board } from './board/Board';
import { Toolbar } from './board/Toolbar';
import { Ghost } from './drag/Ghost';
import { Timeline } from './timeline/Timeline';
import { TraceEmpty } from './TraceEmpty';
import { mode, traceBoard } from './tracer';

export function Workspace() {
  const trace = mode.value === 'trace';
  return (
    <div class={trace ? 'lv-workspace lv-trace' : 'lv-workspace'}>
      <Toolbar />
      <Banner />
      {trace && !traceBoard.value ? <TraceEmpty /> : <Board />}
      {!trace && <Timeline />}
      <Ghost />
    </div>
  );
}
