import * as Phaser from 'phaser';
import { LIFE_VIEW, LIGHT_FX, TILE_SIZE, TOWN_VIEW } from '../config';
import { CRITTERS } from '../data/critters';
import { DRYAD, folkFrame, npcDef } from '../data/npcs';
import { lightByKey } from '../data/lights';
import { tileId } from '../data/tiles';
import type { Npc } from '../sim/entities/Npc';
import type { Player } from '../sim/entities/Player';
import type { EventBus, SimEvents } from '../sim/events';
import type { Critter } from '../sim/systems/CritterSystem';
import type { WispSystem } from '../sim/systems/WispSystem';
import { Depth } from './depth';
import { frameBase } from '../sim/world/autotile';
import { TextureKey } from './scenes/keys';
import { spriteFrame } from './spriteFrames';

const FOLK_SHEET = 'folk';
const CRITTER_SHEET = 'critters';
const LIFT_BASKET_FRAME = frameBase(tileId('lift_post'));
const WISP_COLOR = rgb(lightByKey('wisp').color);

function rgb(c: readonly number[]): number {
  return ((c[0] ?? 0) << 16) | ((c[1] ?? 0) << 8) | (c[2] ?? 0);
}

interface Ring {
  image: Phaser.GameObjects.Image;
  age: number;
}

/**
 * Draws M10's living things: villagers and the Old Dryad from the `folk` sheet (a step frame
 * while walking, their name over their head when you're close), critters from the `critters`
 * sheet (fireflies and glowfish with a pulsing halo in the Glow scene), and the wisp — a bright
 * mote with a fading trail that bursts into a ring when it reaches its secret. Pooled images;
 * nothing is created per frame except on events.
 */
export class LifeRenderer {
  private readonly folk: Phaser.GameObjects.Image[] = [];
  private readonly tags: Phaser.GameObjects.Text[] = [];
  private readonly markers: Phaser.GameObjects.Text[] = [];
  private readonly baskets: Phaser.GameObjects.Image[] = [];
  /** Cached quest marker per NPC and the time it is next re-evaluated. */
  private readonly markerValue: ('' | '!' | '?')[] = [];
  private readonly markerDue: number[] = [];
  private readonly critterImages: Phaser.GameObjects.Image[] = [];
  private readonly halos: Phaser.GameObjects.Image[] = [];
  private readonly trail: Phaser.GameObjects.Image[] = [];
  private readonly trailX = new Float32Array(LIFE_VIEW.wispTrail);
  private readonly trailY = new Float32Array(LIFE_VIEW.wispTrail);
  private trailHead = 0;
  private trailTimer = 0;
  private hadWisp = false;
  private readonly rings: Ring[] = [];
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly glowScene: Phaser.Scene,
    events: EventBus<SimEvents>,
    private readonly npcs: readonly Npc[],
    private readonly critters: readonly Critter[],
    private readonly wisps: WispSystem,
    private readonly player: Player,
    /** Quest marker over someone's head (M11): '!' an offer, '?' ready to hand in. */
    readonly marker: (npc: Npc) => '' | '!' | '?' = () => '',
  ) {
    for (let i = 0; i < LIFE_VIEW.wispTrail; i++) {
      this.trail.push(
        glowScene.add
          .image(0, 0, TextureKey.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(WISP_COLOR)
          .setVisible(false),
      );
    }
    this.unsubscribe = [
      events.on('wispArrived', ({ x, y }) => this.ring(x, y)),
      events.on('wispAppeared', ({ x, y }) => this.ring(x, y)),
    ];
  }

  update(alpha: number, dt: number, time: number): void {
    this.drawFolk(alpha, time);
    this.drawCritters(alpha, time);
    this.drawWisp(dt, time);
    this.updateRings(dt);
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    for (const list of [this.folk, this.critterImages, this.halos, this.trail])
      for (const image of list) image.destroy();
    for (const tag of this.tags) tag.destroy();
    for (const m of this.markers) m.destroy();
    for (const basket of this.baskets) basket.destroy();
    for (const ring of this.rings) ring.image.destroy();
    this.rings.length = 0;
  }

  private drawFolk(alpha: number, time: number): void {
    while (this.folk.length < this.npcs.length) {
      this.folk.push(
        this.scene.add
          .image(0, 0, TextureKey.sprites, spriteFrame(FOLK_SHEET, 0))
          .setOrigin(0.5, 1)
          .setDepth(Depth.entities),
      );
      this.tags.push(
        this.glowScene.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: `${LIFE_VIEW.tagFontPx}px`,
            color: LIFE_VIEW.tagColor,
            stroke: LIFE_VIEW.tagStroke,
            strokeThickness: LIFE_VIEW.tagStrokePx,
          })
          .setOrigin(0.5, 1)
          .setVisible(false),
      );
      this.markers.push(
        this.glowScene.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontStyle: 'bold',
            fontSize: `${TOWN_VIEW.markerFontPx}px`,
            stroke: TOWN_VIEW.markerStroke,
            strokeThickness: TOWN_VIEW.markerStrokePx,
          })
          .setOrigin(0.5, 1)
          .setVisible(false),
      );
      this.baskets.push(
        this.scene.add
          .image(0, 0, TextureKey.tiles, LIFT_BASKET_FRAME)
          .setOrigin(0.5, 0)
          .setDepth(Depth.entities - 0.1)
          .setVisible(false),
      );
      this.markerValue.push('');
      this.markerDue.push(0);
    }
    const pb = this.player.body;
    const px = pb.x + pb.width / 2;
    const py = pb.y + pb.height / 2;
    for (let i = 0; i < this.folk.length; i++) {
      const image = this.folk[i];
      const tag = this.tags[i];
      const mark = this.markers[i];
      const basket = this.baskets[i];
      const npc = this.npcs[i];
      if (!image || !tag || !mark || !basket) continue;
      if (!npc) {
        image.setVisible(false);
        tag.setVisible(false);
        mark.setVisible(false);
        basket.setVisible(false);
        continue;
      }
      const b = npc.body;
      let x = Math.round(npc.prevX + (b.x - npc.prevX) * alpha + b.width / 2);
      const y = Math.round(npc.prevY + (b.y - npc.prevY) * alpha + b.height);
      const walking = Math.abs(b.vx) > 1;
      // Frightened folk shiver in place.
      if (npc.scared && !walking)
        x += Math.sin(time * TOWN_VIEW.shiverRate) >= 0 ? TOWN_VIEW.shiverPx : -TOWN_VIEW.shiverPx;
      const step = walking ? Math.floor(time * LIFE_VIEW.walkRate + npc.id) % 2 : 0;
      // The Dryad sways slowly in place instead of stepping.
      const sway = npc.key === DRYAD.key;
      const frame = folkFrame(npc.key) + (sway ? Math.floor(time * LIFE_VIEW.swayRate) % 2 : step);
      image
        .setFrame(spriteFrame(FOLK_SHEET, frame))
        .setPosition(x, y)
        .setFlipX(npc.facing < 0)
        .setVisible(true);
      const riding = npc.nav?.riding === true;
      basket.setVisible(riding);
      if (riding) basket.setPosition(x, y + TOWN_VIEW.basketDropPx);
      if (time >= (this.markerDue[i] ?? 0)) {
        this.markerValue[i] = this.marker(npc);
        this.markerDue[i] = time + 1 / TOWN_VIEW.markerChecksPerSecond;
      }
      const flag = this.markerValue[i] ?? '';
      const headY = y - b.height;
      if (flag === '') mark.setVisible(false);
      else {
        if (mark.text !== flag) {
          mark.setText(flag);
          mark.setColor(flag === '!' ? TOWN_VIEW.markerGold : TOWN_VIEW.markerMint);
        }
        const bob = Math.sin(time * TOWN_VIEW.markerBobRate + npc.id) * TOWN_VIEW.markerBobPx;
        mark.setPosition(x, headY - TOWN_VIEW.markerGap + bob).setVisible(true);
      }
      const near = Math.hypot(x - px, y - b.height / 2 - py) < LIFE_VIEW.tagTiles * TILE_SIZE;
      if (near) {
        const name = npcDef(npc.key)?.name ?? '';
        if (tag.text !== name) tag.setText(name);
        tag.setPosition(x, headY - LIFE_VIEW.tagGap - (flag === '' ? 0 : TOWN_VIEW.tagLiftPx));
      }
      tag.setVisible(near);
    }
  }

  private drawCritters(alpha: number, time: number): void {
    while (this.critterImages.length < this.critters.length) {
      this.critterImages.push(
        this.scene.add
          .image(0, 0, TextureKey.sprites, spriteFrame(CRITTER_SHEET, 0))
          .setDepth(Depth.entities),
      );
      this.halos.push(
        this.glowScene.add
          .image(0, 0, TextureKey.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setVisible(false),
      );
    }
    for (let i = 0; i < this.critterImages.length; i++) {
      const image = this.critterImages[i];
      const halo = this.halos[i];
      const c = this.critters[i];
      const def = c ? CRITTERS[c.type] : undefined;
      if (!image || !halo) continue;
      if (!c || !def) {
        image.setVisible(false);
        halo.setVisible(false);
        continue;
      }
      const b = c.body;
      const cx = c.prevX + (b.x - c.prevX) * alpha + b.width / 2;
      const top = c.prevY + (b.y - c.prevY) * alpha;
      // Frames: fliers and swimmers centred, bats hang from the top, the rest stand on the bottom.
      const centred = def.move === 'flutter' || def.move === 'swim';
      const hanging = def.perch === 'ceiling' && c.state !== 'flying';
      const originY = centred || (def.perch === 'ceiling' && !hanging) ? 0.5 : hanging ? 0 : 1;
      const y = hanging
        ? top
        : centred || def.perch === 'ceiling'
          ? top + b.height / 2
          : top + b.height;
      // Perching critters sit still (frame 0) until they take flight, then flap.
      const moving = def.move === 'perch' ? c.state === 'flying' : true;
      const rate =
        def.move === 'flutter' || def.move === 'perch' ? LIFE_VIEW.flapRate : LIFE_VIEW.walkRate;
      const frame =
        def.frame + (moving ? Math.floor(time * rate + c.id * LIFE_VIEW.animPhase) % 2 : 0);
      image
        .setFrame(spriteFrame(CRITTER_SHEET, frame))
        .setOrigin(0.5, originY)
        .setPosition(Math.round(cx), Math.round(y))
        .setFlipX(c.facing < 0)
        .setVisible(true);
      if (def.glow !== undefined) {
        const pulse = 0.5 + 0.5 * Math.sin(time * LIFE_VIEW.glowPulse + c.id);
        halo
          .setTint(def.glow)
          .setPosition(cx, top + b.height / 2)
          .setDisplaySize(LIFE_VIEW.haloPx, LIFE_VIEW.haloPx)
          .setAlpha(LIFE_VIEW.haloMin + (1 - LIFE_VIEW.haloMin) * pulse)
          .setVisible(true);
      } else if (def.eyes !== undefined) {
        // Two dim glints near the top of the body (hanging bats: near the bottom).
        const ey = hanging
          ? top + b.height * LIFE_VIEW.eyeHangingAt
          : top + b.height * LIFE_VIEW.eyeAt;
        halo
          .setTint(def.eyes)
          .setPosition(cx + c.facing * LIFE_VIEW.eyeForward, ey)
          .setDisplaySize(LIFE_VIEW.eyePx * 2, LIFE_VIEW.eyePx)
          .setAlpha(LIFE_VIEW.eyeAlpha)
          .setVisible(true);
      } else halo.setVisible(false);
    }
  }

  private drawWisp(dt: number, time: number): void {
    const w = this.wisps.wisp;
    const n = LIFE_VIEW.wispTrail;
    if (!w) {
      this.hadWisp = false;
      for (const image of this.trail) image.setVisible(false);
      return;
    }
    if (!this.hadWisp) {
      this.trailX.fill(w.x);
      this.trailY.fill(w.y);
      this.hadWisp = true;
    }
    this.trailTimer += dt;
    if (this.trailTimer >= LIFE_VIEW.wispTrailStep) {
      this.trailTimer = 0;
      this.trailHead = (this.trailHead + 1) % n;
      this.trailX[this.trailHead] = w.x;
      this.trailY[this.trailHead] = w.y;
    }
    // Index 0 is the wisp itself (brightest, flickering); the rest trail behind and fade.
    const flicker = 1 + LIFE_VIEW.wispFlicker * Math.sin(time * LIFE_VIEW.wispFlickerRate);
    for (let k = 0; k < n; k++) {
      const image = this.trail[k];
      if (!image) continue;
      const slot = (this.trailHead - k + n) % n;
      const x = k === 0 ? w.x : (this.trailX[slot] ?? w.x);
      const y = k === 0 ? w.y : (this.trailY[slot] ?? w.y);
      const fade = 1 - k / n;
      const size = (k === 0 ? LIFE_VIEW.wispPx * flicker : LIFE_VIEW.wispTrailPx) * fade;
      image.setPosition(x, y).setDisplaySize(size, size).setAlpha(fade).setVisible(true);
    }
  }

  private ring(x: number, y: number): void {
    const image = this.glowScene.add
      .image(x, y, TextureKey.ring)
      .setTint(WISP_COLOR)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0);
    this.rings.push({ image, age: 0 });
  }

  private updateRings(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      if (!ring) continue;
      ring.age += dt;
      const t = ring.age / LIFE_VIEW.ringSeconds;
      if (t >= 1) {
        ring.image.destroy();
        this.rings.splice(i, 1);
        continue;
      }
      const eased = 1 - (1 - t) * (1 - t);
      ring.image
        .setScale((LIFE_VIEW.ringRadius * 2 * eased) / LIGHT_FX.ringTexturePx)
        .setAlpha(1 - t);
    }
  }
}
