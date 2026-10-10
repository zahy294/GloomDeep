import { useEffect } from 'preact/hooks';
import { PHOTO } from '../config';
import type { PhotoView, UiBridge } from './bridge';
import { pointerGuard } from './ItemIcon';

const MINUTES = 24 * 60;

/** "18:05" for a day fraction. */
function clock(fraction: number): string {
  const m = Math.floor(fraction * MINUTES) % MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Photo mode's panel (M13): time of day, filter preset, hide, save PNG, leave. Tab hides it for
 * a clean view; the saved picture is the canvas only, never this panel.
 */
export function PhotoPanel({ bridge, photo }: { bridge: UiBridge; photo: PhotoView }) {
  useEffect(() => () => bridge.commands.emit('pointerOverUi', { over: false }), [bridge]);
  if (photo.panelHidden) return null;
  return (
    <div class="photo-panel interactive" {...pointerGuard(bridge)}>
      <div class="panel-header">
        <span class="panel-title">Photo mode</span>
        <button class="panel-button" onClick={() => bridge.commands.emit('photoExit', {})}>
          Leave
        </button>
      </div>
      <label class="settings-row">
        <span>Time {clock(photo.dayFraction)}</span>
        <input
          type="range"
          min={0}
          max={MINUTES - 1}
          value={Math.round(photo.dayFraction * MINUTES)}
          onInput={(e) =>
            bridge.commands.emit('photoTime', {
              dayFraction: Number(e.currentTarget.value) / MINUTES,
            })
          }
        />
      </label>
      <div class="settings-choices">
        {Object.entries(PHOTO.presets).map(([key, p]) => (
          <button
            key={key}
            aria-pressed={photo.preset === key}
            class={`menu-button small${photo.preset === key ? ' primary' : ''}`}
            onClick={() => bridge.commands.emit('photoPreset', { preset: key })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div class="settings-choices">
        <button
          class="menu-button small primary"
          onClick={() => bridge.commands.emit('photoSave', {})}
        >
          Save PNG
        </button>
        <button
          class="menu-button small"
          onClick={() => bridge.commands.emit('photoPanel', { hidden: true })}
        >
          Hide (Tab)
        </button>
      </div>
      <div class="panel-hint">WASD / arrows or drag to move · Shift: faster · P or Esc: leave</div>
    </div>
  );
}
