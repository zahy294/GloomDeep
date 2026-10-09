import type { HudView, Notice } from './bridge';

/**
 * Plan 5 HUD: health, the lantern-shaped Lumen gauge (its glass fills with light), the active lens
 * gem and the clock. Drawn in whole game pixels until UI art arrives.
 */
export function Hud({ hud }: { hud: HudView }) {
  const lumen = hud.lumenMax > 0 ? hud.lumen / hud.lumenMax : 0;
  const health = hud.healthMax > 0 ? hud.health / hud.healthMax : 0;
  return (
    <div class="hud">
      <div
        class={`lantern${hud.lanternOn ? '' : ' off'}`}
        role="meter"
        aria-label="Lumen"
        aria-valuenow={hud.lumen}
        aria-valuemax={hud.lumenMax}
        title={`Lumen ${hud.lumen}/${hud.lumenMax}${hud.lanternOn ? '' : ' (lantern off)'}`}
      >
        <span class="lantern-ring" />
        <span class="lantern-cap" />
        <span class="lantern-glass">
          <span class="lantern-fill" style={{ height: `${lumen * 100}%` }} />
        </span>
        <span class="lantern-base" />
      </div>
      <div class="hud-bars">
        <div class="hud-row">
          <span
            class="health-bar"
            role="meter"
            aria-label="Health"
            aria-valuenow={hud.health}
            aria-valuemax={hud.healthMax}
          >
            <span class="health-fill" style={{ width: `${health * 100}%` }} />
          </span>
          <span class="hud-value">
            {hud.health}/{hud.healthMax}
          </span>
        </div>
        <div class="hud-row">
          <span class="lens-gem" style={{ background: hud.lensColor }} />
          <span>{hud.lensName}</span>
          <span class="hud-dim">{hud.lanternOn ? `${hud.lumen} Lumen` : 'lantern off'}</span>
        </div>
        <div class="hud-row hud-dim">{hud.clock} · F: lantern</div>
      </div>
    </div>
  );
}

/** A short message above the hotbar; render it with `key={notice.id}` so each one fades anew. */
export function NoticeView({ notice }: { notice: Notice }) {
  return <div class="notice">{notice.text}</div>;
}
