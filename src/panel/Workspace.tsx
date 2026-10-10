import { Board } from './board/Board';
import { Toolbar } from './board/Toolbar';

export function Workspace() {
  return (
    <div class="lv-workspace">
      <Toolbar />
      <Board />
    </div>
  );
}
