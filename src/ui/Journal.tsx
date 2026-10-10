import type { JournalView, UiBridge } from './bridge';
import { pointerGuard } from './ItemIcon';

/** M11 quest journal (J): active quests first, then finished ones. */
export function Journal({ bridge, journal }: { bridge: UiBridge; journal: JournalView }) {
  // Array.prototype.sort is stable, so each group keeps its order.
  const quests = [...journal.quests].sort((a, b) => Number(a.done) - Number(b.done));
  return (
    <div class="journal-panel interactive" {...pointerGuard(bridge)}>
      <div class="panel-header">
        <span class="panel-title">Journal</span>
        <button class="panel-button" onClick={() => bridge.commands.emit('closePanel', {})}>
          Close
        </button>
      </div>
      {quests.length === 0 && (
        <div class="panel-hint">
          No quests yet. Folk with a ! over their heads have work for you.
        </div>
      )}
      {quests.map((q) => (
        <div key={q.key} class={`journal-quest${q.done ? ' done' : ''}`}>
          <div class="journal-title">
            {q.title}
            {q.done && <span class="journal-done">Done</span>}
          </div>
          <div class="journal-summary">{q.summary}</div>
        </div>
      ))}
      <div class="panel-hint">J or Esc to close</div>
    </div>
  );
}
