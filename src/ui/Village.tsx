import type { DialogueView, TravelView, UiBridge } from './bridge';

/**
 * M10 village UI: the speech box when you talk to someone (right-click them again for their next
 * line; it closes when you walk away or press Esc) and a beacon's travel list.
 */
export function DialogueBox({ dialogue }: { dialogue: DialogueView }) {
  return (
    <div class="dialogue" role="dialog" aria-label={dialogue.name}>
      <div class="dialogue-name">
        {dialogue.name} <span class="hud-dim">· {dialogue.role}</span>
      </div>
      <div class="dialogue-text" key={dialogue.id}>
        {dialogue.text}
      </div>
    </div>
  );
}

export function TravelMenu({ bridge, travel }: { bridge: UiBridge; travel: TravelView }) {
  const over = (value: boolean) => bridge.commands.emit('pointerOverUi', { over: value });
  return (
    <div
      class="travel-panel interactive"
      onMouseEnter={() => over(true)}
      onMouseLeave={() => over(false)}
    >
      <div class="panel-header">
        <span class="panel-title">Beacons</span>
        <button class="panel-button" onClick={() => bridge.commands.emit('closePanel', {})}>
          Close
        </button>
      </div>
      {travel.options.length === 0 && <div class="panel-hint">No other beacons yet.</div>}
      {travel.options.map((o) => (
        <button
          key={`${o.x},${o.y}`}
          class="panel-button travel-option"
          onClick={() => bridge.commands.emit('travelTo', { x: o.x, y: o.y })}
        >
          {o.label}
        </button>
      ))}
      <div class="panel-hint">Travel to another beacon · Esc to close</div>
    </div>
  );
}
