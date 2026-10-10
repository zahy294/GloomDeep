import type { BannerView, HudView, Notice } from './bridge';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

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
          {hud.lenses.map((l) => (
            <span
              key={l.name}
              class={`lens-gem${l.active ? ' active' : ''}`}
              style={{ background: l.color }}
              title={l.name}
            />
          ))}
          <span>{hud.lensName}</span>
          {hud.lenses.length > 1 && <span class="hud-dim">Q</span>}
          <span class="hud-dim">{hud.lanternOn ? `${hud.lumen} Lumen` : 'lantern off'}</span>
        </div>
        <div class="hud-row">
          <span class="coin" aria-hidden="true" />
          <span class="glimmer">{hud.glimmer}</span>
          <span class="hud-dim">glimmer</span>
        </div>
        {hud.town && (
          <div class="hud-row town-plate" title={hud.town.status}>
            <span>{hud.town.name}</span>
            <span
              class={`town-bar${hud.town.light >= 0.5 ? '' : ' dim'}`}
              role="meter"
              aria-label="Lamp light"
              aria-valuenow={Math.round(hud.town.light * 100)}
              aria-valuemax={100}
            >
              <span class="town-fill" style={{ width: `${clamp01(hud.town.light) * 100}%` }} />
            </span>
            <span class="hud-dim">{hud.town.status}</span>
          </div>
        )}
        {hud.escort && (
          <div class="hud-row">
            <span>{hud.escort.name}&apos;s courage</span>
            <span
              class={`courage-bar${hud.escort.courage < 0.35 ? ' low' : ''}`}
              role="meter"
              aria-label="Courage"
              aria-valuenow={Math.round(hud.escort.courage * 100)}
              aria-valuemax={100}
            >
              <span
                class="courage-fill"
                style={{ width: `${clamp01(hud.escort.courage) * 100}%` }}
              />
            </span>
          </div>
        )}
        <div class="hud-row hud-dim">{hud.clock} · F: lantern</div>
        {hud.fae > 0 && (
          <div class="hud-row fae" title="Fairy ring: faster, higher jumps, a gentler lantern">
            ✦ Fae-touched {hud.fae}s
          </div>
        )}
      </div>
    </div>
  );
}

/** A short message above the hotbar; render it with `key={notice.id}` so each one fades anew. */
export function NoticeView({ notice }: { notice: Notice }) {
  return <div class="notice">{notice.text}</div>;
}

/** A big centred title that fades in and out; render with `key={banner.id}`. */
export function BannerOverlay({ banner }: { banner: BannerView }) {
  return (
    <div class="banner" role="status">
      <div class="banner-title">{banner.title}</div>
      {banner.sub && <div class="banner-sub">{banner.sub}</div>}
    </div>
  );
}
