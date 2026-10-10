import { useEffect, useRef, useState } from 'preact/hooks';
import type { UiBridge, WorldListEntry, WorldSizeKey } from './bridge';
import {
  defaultWorldName,
  formatPlayTime,
  formatRelativeTime,
  parseSeed,
} from './worldSelectHelpers';

const SIZES: readonly { key: WorldSizeKey; label: string }[] = [
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
];

function WorldRow({ bridge, world }: { bridge: UiBridge; world: WorldListEntry }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li class="world-row">
      <div class="world-info">
        <div class="world-name">{world.name}</div>
        <div class="world-meta">
          seed {world.seed} · {world.sizeKey} · last played{' '}
          {formatRelativeTime(world.lastPlayed, Date.now())} · {formatPlayTime(world.playTime)}
        </div>
      </div>
      <button
        class="menu-button"
        onClick={() => bridge.commands.emit('playWorld', { id: world.id })}
      >
        Play
      </button>
      <button
        class={confirming ? 'menu-button danger' : 'menu-button'}
        onClick={() =>
          confirming ? bridge.commands.emit('deleteWorld', { id: world.id }) : setConfirming(true)
        }
        onBlur={() => setConfirming(false)}
      >
        {confirming ? 'Confirm delete?' : 'Delete'}
      </button>
    </li>
  );
}

function NewWorldForm({ bridge, worlds }: { bridge: UiBridge; worlds: WorldListEntry[] }) {
  const [name, setName] = useState(() => defaultWorldName(worlds));
  const [seed, setSeed] = useState('');
  const [size, setSize] = useState<WorldSizeKey>('medium');
  const [starterKit, setStarterKit] = useState(true);
  const submit = (e: Event) => {
    e.preventDefault();
    bridge.commands.emit('createWorld', {
      name: name.trim() || defaultWorldName(worlds),
      seed: parseSeed(seed),
      size,
      starterKit,
    });
  };
  return (
    <form class="new-world" onSubmit={submit}>
      <div class="panel-title">New world</div>
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          maxLength={32}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      <label class="field">
        <span>Seed</span>
        <input
          type="text"
          value={seed}
          placeholder="random"
          onInput={(e) => setSeed(e.currentTarget.value)}
        />
      </label>
      <fieldset class="field sizes">
        <legend>Size</legend>
        {SIZES.map((s) => (
          <label key={s.key}>
            <input
              type="radio"
              name="world-size"
              checked={size === s.key}
              onChange={() => setSize(s.key)}
            />
            {s.label}
          </label>
        ))}
      </fieldset>
      <label class="field checkbox">
        <input
          type="checkbox"
          checked={starterKit}
          onChange={(e) => setStarterKit(e.currentTarget.checked)}
        />
        <span>Starter kit (wooden sword, torches, planks)</span>
      </label>
      <button type="submit" class="menu-button primary">
        Create
      </button>
    </form>
  );
}

export function WorldSelect({
  bridge,
  worlds,
  error,
}: {
  bridge: UiBridge;
  worlds: WorldListEntry[];
  error: string | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => root.current?.focus(), []);
  return (
    <div class="screen-backdrop interactive" ref={root} tabIndex={-1}>
      <div class="menu-panel wide">
        <h2 class="menu-title">Worlds</h2>
        {error && (
          <div class="menu-error" role="alert">
            {error}
          </div>
        )}
        {worlds.length === 0 ? (
          <div class="menu-empty">No worlds yet. Plant the first seed below.</div>
        ) : (
          <ul class="world-list">
            {worlds.map((w) => (
              <WorldRow key={w.id} bridge={bridge} world={w} />
            ))}
          </ul>
        )}
        <NewWorldForm bridge={bridge} worlds={worlds} />
        <button class="menu-button" onClick={() => bridge.commands.emit('backToTitle', {})}>
          Back
        </button>
      </div>
    </div>
  );
}
