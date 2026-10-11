import { Notice } from './Notice';
import { Workspace } from './Workspace';
import { session } from './state';

export function App() {
  return (
    <div class="lv-app">
      <Notice />
      {session.value ? <Workspace /> : <p class="lv-waiting" data-testid="waiting">Waiting for LeetCode…</p>}
    </div>
  );
}
