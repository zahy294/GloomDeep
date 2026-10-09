import { useEffect, useRef, useState } from 'preact/hooks';
import type { UiBridge, UiState } from './bridge';
import { DebugOverlay } from './DebugOverlay';
import { Hud } from './Hud';
import { Hotbar, InventoryPanel } from './Inventory';

function useUiState(bridge: UiBridge): UiState {
  const [state, setState] = useState(bridge.state);
  useEffect(() => bridge.subscribe(setState), [bridge]);
  return state;
}

function TitleScreen({ bridge }: { bridge: UiBridge }) {
  const start = () => bridge.commands.emit('startGame', {});
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
  const { screen, showUi, debug, inventory, inventoryOpen, hud } = useUiState(bridge);
  if (!showUi) return null;

  switch (screen) {
    case 'title':
      return <TitleScreen bridge={bridge} />;
    case 'game':
      return (
        <>
          {debug ? (
            <DebugOverlay info={debug} />
          ) : (
            <div class="game-hint">F3: debug · E: inventory</div>
          )}
          {hud && <Hud hud={hud} />}
          {inventory && <Hotbar bridge={bridge} view={inventory} />}
          {inventory && inventoryOpen && <InventoryPanel bridge={bridge} view={inventory} />}
        </>
      );
    default:
      return null;
  }
}
