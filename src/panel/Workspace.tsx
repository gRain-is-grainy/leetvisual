import { Board } from './board/Board';
import { Toolbar } from './board/Toolbar';
import { Ghost } from './drag/Ghost';
import { Timeline } from './timeline/Timeline';

export function Workspace() {
  return (
    <div class="lv-workspace">
      <Toolbar />
      <Board />
      <Timeline />
      <Ghost />
    </div>
  );
}
