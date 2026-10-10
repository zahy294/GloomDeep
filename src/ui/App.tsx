import { useEffect, useRef, useState } from 'preact/hooks';
import type { UiBridge, UiState } from './bridge';
import { BossBar, EndingCard, TitleCard } from './BossBar';
import { DebugOverlay } from './DebugOverlay';
import { BannerOverlay, Hud, NoticeView } from './Hud';
import { Journal } from './Journal';
import { Guide } from './Guide';
import { Shop } from './Shop';
import { Generating } from './Generating';
import { Hotbar, InventoryScreen } from './Inventory';
import { PauseMenu } from './PauseMenu';
import { DialogueBox, TravelMenu } from './Village';
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
    dialogue,
    travel,
    shop,
    journal,
    banner,
    boss,
    titleCard,
    ending,
    respawnIn,
    worlds,
    generation,
    paused,
    guide,
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
            <div class="game-hint">H: guide · E: inventory · J: journal · F3: debug</div>
          )}
          {hud && <Hud hud={hud} />}
          {notice && <NoticeView key={notice.id} notice={notice} />}
          {dialogue && !inventoryOpen && <DialogueBox bridge={bridge} dialogue={dialogue} />}
          {shop && !inventoryOpen && <Shop bridge={bridge} shop={shop} icons={icons} />}
          {journal && !inventoryOpen && <Journal bridge={bridge} journal={journal} />}
          {banner && <BannerOverlay key={banner.id} banner={banner} />}
          {boss && <BossBar boss={boss} />}
          {titleCard && <TitleCard key={titleCard.id} card={titleCard} />}
          {travel && !inventoryOpen && <TravelMenu bridge={bridge} travel={travel} />}
          {inventory && <Hotbar bridge={bridge} view={inventory} icons={icons} />}
          {inventory && inventoryOpen && (
            <InventoryScreen bridge={bridge} view={inventory} icons={icons} />
          )}
          {respawnIn !== null && (
            <div class="death-overlay">
              <div class="death-title">The light left you</div>
              <div class="death-sub">Rekindling in {respawnIn}…</div>
            </div>
          )}
          {ending && <EndingCard bridge={bridge} ending={ending} />}
          {paused && <PauseMenu bridge={bridge} error={error} />}
          {guide && <Guide bridge={bridge} />}
        </>
      );
    default:
      return null;
  }
}
