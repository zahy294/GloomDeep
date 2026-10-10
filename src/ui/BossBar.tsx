import { useState } from 'preact/hooks';
import { Credits } from './Credits';
import type { BossBarView, EndingView, TitleCardView, UiBridge } from './bridge';
import { pointerGuard } from './ItemIcon';

export type PipState = 'done' | 'current' | 'todo';

/** One state per phase: earlier phases are done, the current one lit, later ones dark. */
export function phasePips(phase: number, phases: number): PipState[] {
  const count = Math.max(0, Math.floor(phases));
  const pips: PipState[] = [];
  for (let i = 0; i < count; i++) pips.push(i < phase ? 'done' : i === phase ? 'current' : 'todo');
  return pips;
}

export const bossHealthPercent = (health: number): number =>
  Math.round(Math.min(1, Math.max(0, health)) * 100);

/** Wide bar at the top centre: name, health (with a trailing damage fill), phase pips, hint. */
export function BossBar({ boss }: { boss: BossBarView }) {
  const pct = bossHealthPercent(boss.health);
  return (
    <div class={`boss-bar${boss.intro ? ' intro' : ''}`} role="group" aria-label={boss.name}>
      <div class="boss-name">
        {boss.name}
        {boss.epithet && <span class="boss-epithet">{boss.epithet}</span>}
      </div>
      <div
        class="boss-health"
        role="meter"
        aria-label="Boss health"
        aria-valuenow={pct}
        aria-valuemax={100}
      >
        <span class="boss-trail" style={{ width: `${pct}%` }} />
        <span class="boss-fill" style={{ width: `${pct}%` }} />
      </div>
      <div class="boss-pips" aria-label={`Phase ${boss.phase + 1} of ${boss.phases}`}>
        {phasePips(boss.phase, boss.phases).map((s, i) => (
          <span key={i} class={`boss-pip ${s}`} />
        ))}
      </div>
      {boss.status && <div class="boss-status">{boss.status}</div>}
    </div>
  );
}

/** Big, letter-spaced boss name; render with `key={card.id}` so it fades anew each time. */
export function TitleCard({ card }: { card: TitleCardView }) {
  return (
    <div class="title-card" role="status">
      <div class="title-card-name">{card.title}</div>
      {card.sub && <div class="title-card-sub">{card.sub}</div>}
    </div>
  );
}

/** The ending: shown once the final boss falls; "Keep playing" closes it. */
export function EndingCard({ bridge, ending }: { bridge: UiBridge; ending: EndingView }) {
  const [credits, setCredits] = useState(false);
  if (credits) return <Credits onClose={() => setCredits(false)} />;
  return (
    <div class="ending-card interactive" {...pointerGuard(bridge)}>
      <div class="ending-title">{ending.title}</div>
      {ending.lines.map((line, i) => (
        <p key={i} class="ending-line">
          {line}
        </p>
      ))}
      <div class="title-buttons">
        <button class="panel-button" onClick={() => setCredits(true)}>
          Credits
        </button>
        <button class="panel-button" onClick={() => bridge.commands.emit('closeEnding', {})}>
          Keep playing
        </button>
      </div>
    </div>
  );
}
