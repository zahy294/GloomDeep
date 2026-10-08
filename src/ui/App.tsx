import { useEffect, useRef, useState } from 'preact/hooks';
import type { UiBridge, UiState } from './bridge';

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
  const { screen, showUi } = useUiState(bridge);
  if (!showUi) return null;

  switch (screen) {
    case 'title':
      return <TitleScreen bridge={bridge} />;
    case 'game':
      return <div class="game-hint">Gloamdeep · M0 · empty world</div>;
    default:
      return null;
  }
}
