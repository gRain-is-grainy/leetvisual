import { Notice } from './Notice';
import { Shell } from './Shell';
import { session } from './state';

export function App() {
  return (
    <div class="lv-app">
      <Notice />
      {session.value ? <Shell /> : <p class="lv-waiting" data-testid="waiting">Waiting for LeetCode…</p>}
    </div>
  );
}
