import { TILE_SIZE } from '../../config';
import { DEPTH_LAYERS } from '../../data/biomes';
import { BOSSES, bossFlag } from '../../data/bosses';
import { TILES } from '../../data/tiles';
import { WARDS } from '../../data/wards';
import type { Player } from '../entities/Player';
import type { BossSystem } from './BossSystem';

/** One step of the way down, for the journal (M12). */
export interface StoryObjective {
  readonly key: string;
  readonly title: string;
  readonly text: string;
  readonly done: boolean;
  /** Tiles from the player to the arena's centre (east and down are positive); 0 when done. */
  readonly dx: number;
  readonly dy: number;
}

/** The flag that opens the way to a boss: the ward its layer lies under, if any. */
function opensAfter(layer: string | null): string | null {
  if (!layer) return null;
  // Wards seal the top of a layer; a boss in that layer or deeper needs every ward above it.
  const depth = (key: string) => DEPTH_LAYERS.findIndex((l) => l.key === key);
  const wards = WARDS.filter((w) => depth(w.layer) <= depth(layer));
  const last = wards[wards.length - 1];
  return last ? (TILES.find((t) => t.key === last.tile)?.sealedUntil ?? null) : null;
}

/**
 * The main story (plan 1.3 "bosses unlock depths"): every boss whose way is open (its wards
 * broken), with how to find it, and the ones already beaten. Bosses still behind a ward are left
 * out until it breaks.
 */
export function storyObjectives(
  bosses: BossSystem,
  player: Player,
  hasFlag: (flag: string) => boolean,
): StoryObjective[] {
  const out: StoryObjective[] = [];
  const b = player.body;
  const px = (b.x + b.width / 2) / TILE_SIZE;
  const py = (b.y + b.height / 2) / TILE_SIZE;
  for (const def of BOSSES) {
    const done = hasFlag(bossFlag(def.key));
    const layer = def.placement.kind === 'underground' ? def.placement.layer : null;
    const gate = opensAfter(layer);
    if (!done && gate && !hasFlag(gate)) continue;
    const arena = bosses.arenaOf(def.key);
    const ax = arena ? (arena.place.x0 + arena.place.x1) / 2 : px;
    const ay = arena ? (arena.place.y0 + arena.place.y1) / 2 : py;
    out.push({
      key: def.key,
      title: def.name,
      text: done ? def.reward : def.hint,
      done,
      dx: done ? 0 : Math.round(ax - px),
      dy: done ? 0 : Math.round(ay - py),
    });
  }
  return out;
}
