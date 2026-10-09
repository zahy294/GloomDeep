import { FLORA_FX, TILE_SIZE } from '../../config';
import { TILES, tileId } from '../../data/tiles';
import type { Player } from '../entities/Player';
import type { EventBus, SimEvents } from '../events';
import { decorSupported } from '../world/decor';
import { AIR, type World } from '../world/World';
import type { TileRect } from './GloamSystem';

const OPENS_TO = Int32Array.from(TILES, (t) => (t.opensTo ? tileId(t.opensTo) : -1));
const CLOSES_TO = Int32Array.from(TILES, (t) => (t.closesTo ? tileId(t.closesTo) : -1));
const GLOWMOSS = tileId('glowmoss_tuft');
const FAIRY = tileId('fairy_mushroom');

const buffPayload = { seconds: 0 };

/**
 * Living flora (plan 1.5, M10): Lumen blooms open in light and close in the dark (harvest them
 * open), glowmoss slowly spreads across dark floors, and standing inside a fairy ring at night
 * grants the fae buff (faster, higher, a gentler lantern). Runs a few times a second over the
 * region where the light grid is current (rule 7: it reads the light).
 */
export class FloraSystem {
  private timer = 0;

  constructor(
    private readonly world: World,
    private readonly events: EventBus<SimEvents>,
    private readonly random: () => number,
  ) {}

  update(dt: number, region: TileRect | null, player: Player, night: boolean): void {
    player.fae = Math.max(0, player.fae - dt);
    this.timer += dt;
    const step = 1 / FLORA_FX.tickHz;
    if (this.timer < step || !region) return;
    this.timer = 0;
    this.blooms(region);
    this.glowmoss(region, step);
    if (night) this.fairyRing(player);
  }

  private light(i: number): number {
    const w = this.world;
    return Math.max(w.lightR[i] ?? 0, w.lightG[i] ?? 0, w.lightB[i] ?? 0);
  }

  private blooms(region: TileRect): void {
    const w = this.world;
    for (let y = region.y0; y < region.y0 + region.height; y++) {
      for (let x = region.x0; x < region.x0 + region.width; x++) {
        const i = y * w.width + x;
        const id = w.fg[i] ?? AIR;
        const open = OPENS_TO[id] ?? -1;
        const close = CLOSES_TO[id] ?? -1;
        if (open >= 0 && this.light(i) >= FLORA_FX.bloomOpenLight) w.set(x, y, open);
        else if (close >= 0 && this.light(i) <= FLORA_FX.bloomCloseLight) w.set(x, y, close);
      }
    }
  }

  /** A few random cells per tick: glowmoss creeps onto a neighbouring dark floor. */
  private glowmoss(region: TileRect, step: number): void {
    const w = this.world;
    const picks = Math.round(region.width * region.height * FLORA_FX.mossPicksPerCell * step);
    for (let k = 0; k < picks; k++) {
      const x = region.x0 + Math.floor(this.random() * region.width);
      const y = region.y0 + Math.floor(this.random() * region.height);
      if (w.get(x, y) !== GLOWMOSS || this.random() >= FLORA_FX.mossSpreadChance) continue;
      const nx = x + (this.random() < 0.5 ? -1 : 1);
      const ny = y + Math.floor(this.random() * 3) - 1;
      if (!w.inBounds(nx, ny) || w.get(nx, ny) !== AIR) continue;
      if (this.light(w.index(nx, ny)) > FLORA_FX.mossDarkLight) continue;
      if ((w.liquid[w.index(nx, ny)] ?? 0) > 0 || !decorSupported(w, nx, ny, GLOWMOSS)) continue;
      w.set(nx, ny, GLOWMOSS);
    }
  }

  /** At night, standing among enough fairy mushrooms grants (or refreshes) the fae buff. */
  private fairyRing(player: Player): void {
    const w = this.world;
    const b = player.body;
    const cx = Math.floor((b.x + b.width / 2) / TILE_SIZE);
    const cy = Math.floor((b.y + b.height - 1) / TILE_SIZE);
    const r = FLORA_FX.ringRadius;
    let count = 0;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) if (w.get(x, y) === FAIRY) count++;
    }
    if (count < FLORA_FX.ringMushrooms) return;
    const fresh = player.fae <= 0;
    player.fae = FLORA_FX.faeSeconds;
    if (fresh) {
      buffPayload.seconds = FLORA_FX.faeSeconds;
      this.events.emit('faeBuff', buffPayload);
    }
  }
}
