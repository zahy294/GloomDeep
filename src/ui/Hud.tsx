import type { HudView } from './bridge';

/** Lumen gauge, active lens and clock (plan 5 HUD). The lantern-shaped gauge comes with UI art. */
export function Hud({ hud }: { hud: HudView }) {
  const fill = hud.lumenMax > 0 ? hud.lumen / hud.lumenMax : 0;
  return (
    <div class="hud">
      <div class="hud-row">
        <span class="hud-label">Lumen</span>
        <span class="lumen-bar" role="meter" aria-valuenow={hud.lumen} aria-valuemax={hud.lumenMax}>
          <span
            class={`lumen-fill${hud.lanternOn ? '' : ' off'}`}
            style={{ width: `${fill * 100}%` }}
          />
        </span>
        <span class="hud-value">{hud.lanternOn ? hud.lumen : 'off'}</span>
      </div>
      <div class="hud-row hud-dim">
        {hud.lensName} · {hud.clock} · F: lantern
      </div>
    </div>
  );
}
