import { useEffect, useState } from 'preact/hooks';
import {
  BINDABLES,
  DEFAULT_SETTINGS,
  keyLabel,
  keyName,
  KEY_SLOTS,
  MAX_SCALE_CHOICE,
  rebind,
  RESERVED_KEYS,
  type Bindable,
  type Settings,
  type Volumes,
} from '../settings';
import type { UiBridge } from './bridge';

type Tab = 'video' | 'audio' | 'controls';

const VOLUMES: readonly { key: keyof Volumes; label: string }[] = [
  { key: 'master', label: 'Master' },
  { key: 'music', label: 'Music' },
  { key: 'ambience', label: 'Ambience' },
  { key: 'sfx', label: 'Effects' },
];

const PERCENT = 100;
const SLOTS = Array.from({ length: KEY_SLOTS }, (_, i) => i);

/**
 * Settings (plan 5, M13): quality, display scale, volumes and key bindings. Every change is sent
 * as a `changeSettings` command (saved and applied at once; quality from the next world).
 */
export function SettingsPanel({ bridge, onClose }: { bridge: UiBridge; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('video');
  const [settings, setSettings] = useState<Settings>(bridge.state.settings);
  /** Waiting for a key for this control and slot. */
  const [listening, setListening] = useState<{ what: Bindable; slot: number } | null>(null);
  const change = (next: Settings) => {
    setSettings(next);
    bridge.commands.emit('changeSettings', { settings: next });
  };

  useEffect(() => {
    bridge.commands.emit('pointerOverUi', { over: true });
    return () => bridge.commands.emit('pointerOverUi', { over: false });
  }, [bridge]);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const name = keyName(e.code, e.key);
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      if (!name || RESERVED_KEYS.includes(name)) return;
      change({ ...settings, keys: rebind(settings.keys, listening.what, listening.slot, name) });
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, settings]);

  return (
    <div class="screen-backdrop dim interactive">
      <div class="settings-panel">
        <div class="panel-header">
          <span class="panel-title">Settings</span>
          <button class="panel-button" onClick={onClose}>
            Back
          </button>
        </div>
        <div class="settings-tabs">
          {(['video', 'audio', 'controls'] as const).map((t) => (
            <button
              key={t}
              aria-pressed={tab === t}
              class={`guide-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'video' ? 'Video' : t === 'audio' ? 'Audio' : 'Controls'}
            </button>
          ))}
        </div>
        <div class="settings-body">
          {tab === 'video' && (
            <>
              <div class="settings-row">
                <span>Quality</span>
                <div class="settings-choices">
                  {(['low', 'medium', 'high'] as const).map((q) => (
                    <button
                      key={q}
                      aria-pressed={settings.quality === q}
                      class={`menu-button small${settings.quality === q ? ' primary' : ''}`}
                      onClick={() => change({ ...settings, quality: q })}
                    >
                      {q.charAt(0).toUpperCase() + q.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div class="panel-hint">
                Low turns off glow, mist, reflections and camera filters, and thins the particles.
                Takes effect the next time you enter a world.
              </div>
              <div class="settings-row">
                <span>Display scale</span>
                <div class="settings-choices">
                  {(
                    ['auto', ...Array.from({ length: MAX_SCALE_CHOICE }, (_, i) => i + 1)] as const
                  ).map((s) => (
                    <button
                      key={String(s)}
                      aria-pressed={settings.scale === s}
                      class={`menu-button small${settings.scale === s ? ' primary' : ''}`}
                      onClick={() => change({ ...settings, scale: s })}
                    >
                      {s === 'auto' ? 'Auto' : `×${s}`}
                    </button>
                  ))}
                </div>
              </div>
              <div class="panel-hint">
                Pixels are always scaled by whole numbers (screen pixels, so ×2 looks smaller on a
                high-DPI screen). Auto picks the largest that fits the window.
              </div>
            </>
          )}
          {tab === 'audio' &&
            VOLUMES.map(({ key, label }) => (
              <label key={key} class="settings-row">
                <span>{label}</span>
                <input
                  type="range"
                  min={0}
                  max={PERCENT}
                  value={Math.round(settings.volume[key] * PERCENT)}
                  onInput={(e) =>
                    change({
                      ...settings,
                      volume: {
                        ...settings.volume,
                        [key]: Number(e.currentTarget.value) / PERCENT,
                      },
                    })
                  }
                />
                <span class="settings-value">{Math.round(settings.volume[key] * PERCENT)}%</span>
              </label>
            ))}
          {tab === 'controls' && (
            <>
              <table class="guide-keys settings-keys">
                <tbody>
                  {BINDABLES.map(({ key, label }) => (
                    <tr key={key}>
                      <td>{label}</td>
                      {SLOTS.map((slot) => {
                        const bound = settings.keys[key][slot];
                        const waiting = listening?.what === key && listening.slot === slot;
                        return (
                          <td key={slot}>
                            <button
                              class={`key-button${waiting ? ' listening' : ''}`}
                              aria-label={`${label}, key ${slot + 1}: ${bound ? keyLabel(bound) : 'none'}`}
                              onClick={() => setListening({ what: key, slot })}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                change({
                                  ...settings,
                                  keys: rebind(settings.keys, key, slot, null),
                                });
                              }}
                            >
                              {waiting ? 'Press a key…' : bound ? keyLabel(bound) : '—'}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div class="panel-hint">
                Click a key, then press the new one (Esc cancels). Right-click to clear. Mouse
                buttons, the hotbar keys (1–0) and Esc stay as they are.
              </div>
              <button
                class="menu-button small"
                onClick={() => change({ ...settings, keys: DEFAULT_SETTINGS.keys })}
              >
                Reset keys
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
