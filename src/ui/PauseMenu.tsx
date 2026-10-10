import { useEffect, useRef } from 'preact/hooks';
import type { UiBridge } from './bridge';

export function PauseMenu({ bridge, error }: { bridge: UiBridge; error: string | null }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    bridge.commands.emit('pointerOverUi', { over: true });
    first.current?.focus();
    // Unmounting under the cursor fires no mouseleave; release the pointer guard explicitly.
    return () => bridge.commands.emit('pointerOverUi', { over: false });
  }, [bridge]);
  return (
    <div class="screen-backdrop dim interactive">
      <div class="menu-panel">
        <h2 class="menu-title">Paused</h2>
        {error && (
          <div class="menu-error" role="alert">
            {error}
          </div>
        )}
        <button
          ref={first}
          class="menu-button primary"
          onClick={() => bridge.commands.emit('resume', {})}
        >
          Resume
        </button>
        <button class="menu-button" onClick={() => bridge.commands.emit('toggleGuide', {})}>
          Guide
        </button>
        <button class="menu-button" onClick={() => bridge.commands.emit('saveAndQuit', {})}>
          Save &amp; quit
        </button>
      </div>
    </div>
  );
}
