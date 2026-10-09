import { useEffect, useRef, useState } from 'preact/hooks';
import type { UiBridge, UiState } from './bridge';
import { DebugOverlay } from './DebugOverlay';
import { Hud, NoticeView } from './Hud';
import { Generating } from './Generating';
import { Hotbar, InventoryScreen } from './Inventory';
import { PauseMenu } from './PauseMenu';
import { WorldSelect } from './WorldSelect';

function useUiState(bridge: UiBridge): UiState {
  const [state, setState] = useState(bridge.state);
  useEffect(() => bridge.subscribe(setState), [bridge]);
  return state;
}

function TitleScreen({ bridge }: { bridge: UiBridge }) {
  const start = () => bridge.commands.emit('openWorlds', {});
  const root = useRef<HTMLDivElement>(null);
  // Focus so Enter/Space start the game without having to Tab in first.
  useEffect(() => root.current?.focus(), []);
  return (
    <div
      ref={root}
      class="title-screen interactive"
      role="button"
      tabIndex={0}
      onClick={start}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && start()}
    >
      <h1>GLOAMDEEP</h1>
      <div class="tagline">The Heartlight is fading.</div>
      <div class="prompt">Click to begin</div>
    </div>
  );
}

export function App({ bridge }: { bridge: UiBridge }) {
  const {
    screen,
    showUi,
    debug,
    inventory,
    inventoryOpen,
    hud,
    icons,
    notice,
    worlds,
    generation,
    paused,
    error,
  } = useUiState(bridge);
  if (!showUi) return null;

  switch (screen) {
    case 'title':
      return <TitleScreen bridge={bridge} />;
    case 'worlds':
      return <WorldSelect bridge={bridge} worlds={worlds} error={error} />;
    case 'generating':
      return <Generating stage={generation?.stage ?? ''} progress={generation?.progress ?? 0} />;
    case 'game':
      return (
        <>
          {debug ? (
            <DebugOverlay info={debug} />
          ) : (
            <div class="game-hint">F3: debug · E: inventory</div>
          )}
          {hud && <Hud hud={hud} />}
          {notice && <NoticeView key={notice.id} notice={notice} />}
          {inventory && <Hotbar bridge={bridge} view={inventory} icons={icons} />}
          {inventory && inventoryOpen && (
            <InventoryScreen bridge={bridge} view={inventory} icons={icons} />
          )}
          {paused && <PauseMenu bridge={bridge} error={error} />}
        </>
      );
    default:
      return null;
  }
}
