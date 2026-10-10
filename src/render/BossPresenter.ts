import { ENEMIES } from '../data/enemies';
import type { Simulation } from '../sim/Simulation';
import { storyObjectives } from '../sim/systems/StorySystem';
import type { BossBarView, DimmingView, JournalView, UiBridge } from '../ui/bridge';

/** HUD refreshes per health percent: the bar is rounded to this. */
const HEALTH_STEPS = 200;

const ENDING_LINES = [
  'The Gloam Heart is gone, and the World Tree’s light runs up its roots again.',
  'No more Dimming nights. The Gloam cannot grow; what is left, your light will burn away.',
  'The forest of Vael remembers itself. Thank you for playing.',
];

/**
 * M12 on the UI side: the boss bar and title card during a fight, banners and notices for boss
 * and Dimming events, the Dimming badge on the HUD, the story part of the journal and the ending
 * card. It only reads the simulation (CLAUDE.md rule 3).
 */
export class BossPresenter {
  private cardId = 0;
  private lastBar = '';
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly sim: Simulation,
    private readonly bridge: UiBridge,
    private readonly notify: (text: string) => void,
    private readonly banner: (title: string, sub: string) => void,
  ) {
    const { events } = sim;
    this.offs.push(
      events.on('bossIntro', ({ name, epithet }) =>
        this.bridge.set({ titleCard: { title: name, sub: epithet, id: ++this.cardId } }),
      ),
      events.on('bossDefeated', ({ key, name, reward }) => {
        this.banner(`${name} has fallen`, reward);
        if (key === 'gloam_heart') {
          this.bridge.set({ ending: { title: 'The Heartlight burns again', lines: ENDING_LINES } });
        }
      }),
      events.on('bossReset', () =>
        this.notify('The light left you. The fight is lost; it will wait for you.'),
      ),
      events.on('bossPhase', ({ phase }) =>
        this.notify(phase === 1 ? 'It is growing desperate…' : 'One last fury!'),
      ),
      events.on('bossAction', ({ kind }) => {
        if (kind === 'stunned') this.notify('The lure burst! She is stunned');
        else if (kind === 'cracked') this.notify('The reflected light cracks its shell!');
        else if (kind === 'nodeChoked') this.notify('A tendril chokes a root-lamp');
      }),
      events.on('dimmingWarning', () =>
        this.notify('The sun feels thin today. Tonight will be a Dimming night'),
      ),
      events.on('dimmingStarted', () =>
        this.banner('A Dimming night', 'Stay in the light until the dawn'),
      ),
      events.on('dimmingEnded', ({ survived }) =>
        this.banner(
          'The dawn',
          `You saw out ${survived === 1 ? 'a Dimming night' : `${survived} Dimming nights`}. The dawn leaves Lumen at your feet`,
        ),
      ),
      events.on('shadeWave', ({ count }) => this.notify(`A wave of shades rises (${count})!`)),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  /** A few times a second: the boss bar. */
  update(): void {
    const a = this.sim.bosses.active;
    const boss = a?.boss;
    let bar: BossBarView | null = null;
    if (a && boss) {
      const max = ENEMIES[boss.type]?.maxHealth ?? 1;
      bar = {
        name: a.def.name,
        epithet: a.def.epithet,
        health: Math.round((boss.health / max) * HEALTH_STEPS) / HEALTH_STEPS,
        phase: a.phase,
        phases: a.def.phases.length,
        status: a.state === 'fight' ? (this.sim.bosses.run(a)?.status() ?? '') : '',
        intro: a.state === 'intro',
      };
    }
    const key = JSON.stringify(bar);
    if (key === this.lastBar) return;
    this.lastBar = key;
    this.bridge.set({ boss: bar });
  }

  /** The HUD's Dimming badge. */
  dimming(): DimmingView | null {
    const d = this.sim.dimming;
    if (d.strength > 0) return { text: 'Dimming night', on: true };
    const next = d.nextDimmingDay();
    if (next < 0) return null;
    const days = next - d.day;
    if (days === 0) return { text: 'Dimming night tonight', on: false };
    return { text: `Dimming night in ${days} day${days === 1 ? '' : 's'}`, on: false };
  }

  /** The journal's story section. */
  story(): JournalView['story'] {
    return storyObjectives(this.sim.bosses, this.sim.player, (f) =>
      this.sim.progression.has(f),
    ).map((o) => ({
      key: o.key,
      title: o.title,
      text: o.text,
      done: o.done,
      where: o.done ? '' : direction(o.dx, o.dy),
    }));
  }

  closeEnding(): void {
    this.bridge.set({ ending: null });
  }
}

/** "212 tiles east, 140 down" (or "right here"). */
export function direction(dx: number, dy: number): string {
  const parts: string[] = [];
  if (Math.abs(dx) >= 1) parts.push(`${Math.abs(dx)} tiles ${dx > 0 ? 'east' : 'west'}`);
  if (Math.abs(dy) >= 1) parts.push(`${Math.abs(dy)} ${dy > 0 ? 'down' : 'up'}`);
  return parts.length > 0 ? parts.join(', ') : 'right here';
}
