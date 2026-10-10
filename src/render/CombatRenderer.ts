import * as Phaser from 'phaser';
import { COMBAT_VIEW } from '../config';
import { ENEMIES } from '../data/enemies';
import { itemId } from '../data/items';
import { PALETTE } from '../data/palette';
import type { Enemy } from '../sim/entities/Enemy';
import type { Projectile } from '../sim/entities/Projectile';
import type { EventBus, SimEvents } from '../sim/events';
import { Depth } from './depth';
import { itemIcon } from './itemIcons';
import { TextureKey } from './scenes/keys';
import { spriteFrame } from './spriteFrames';
import { isBossBody } from './BossRenderer';

const SHEET = 'enemies';
const ARROW_ICON = itemIcon(itemId('wooden_arrow'));
const ENEMY_COLOR = ENEMIES.map((e) => PALETTE[e.ramp][2]);
const SHADE_TYPES = new Set(ENEMIES.flatMap((e, i) => (e.ai === 'shade' ? [i] : [])));
const BEAM_COLOR = PALETTE.cyan[3];

interface FloatingText {
  text: Phaser.GameObjects.Text;
  age: number;
}

interface Wisp {
  image: Phaser.GameObjects.Image;
  age: number;
  life: number;
  vx: number;
  vy: number;
}

/**
 * Draws combat (plan 2.8 "Hit", "Shade dying"): creatures from the `enemies` sheet (two-frame
 * animation, a squash on landing hops, a white flash when hit, glowing eyes that show in the
 * dark), arrows and Lumen beams, floating damage numbers, and the wisps a dying creature
 * dissolves into. Eyes, beams, numbers and wisps live in the Glow scene so darkness can't hide
 * them. Images are pooled; nothing is created per frame except on events.
 */
export class CombatRenderer {
  private readonly bodies: Phaser.GameObjects.Image[] = [];
  private readonly eyes: Phaser.GameObjects.Image[] = [];
  private readonly shots: Phaser.GameObjects.Image[] = [];
  private readonly numbers: FloatingText[] = [];
  /** Hidden Text objects ready to show the next number (each Text owns a canvas texture). */
  private readonly spareTexts: Phaser.GameObjects.Text[] = [];
  private readonly wisps: Wisp[] = [];
  /** Creature id → seconds of hit flash left. */
  private readonly flash = new Map<number, number>();
  private readonly unsubscribe: (() => void)[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly glowScene: Phaser.Scene,
    events: EventBus<SimEvents>,
    private readonly enemies: readonly Enemy[],
    private readonly projectiles: readonly Projectile[],
  ) {
    this.unsubscribe = [
      events.on('enemyHit', ({ id, x, y, amount, source }) => {
        if (source !== 'light') this.flash.set(id, COMBAT_VIEW.flashSeconds);
        this.number(
          x,
          y,
          amount,
          source === 'light' ? COMBAT_VIEW.burnColor : COMBAT_VIEW.hitColor,
        );
      }),
      events.on('playerHurt', ({ x, y, amount }) =>
        this.number(x, y, amount, COMBAT_VIEW.hurtColor),
      ),
      events.on('enemyDied', ({ type, x, y }) => {
        const shade = SHADE_TYPES.has(type);
        const color = shade ? PALETTE.gloam[3] : (ENEMY_COLOR[type] ?? 0xffffff);
        this.dissolve(x, y, color, shade ? COMBAT_VIEW.shadeWisps : COMBAT_VIEW.deathWisps);
      }),
    ];
  }

  update(alpha: number, dt: number, time: number): void {
    this.drawEnemies(alpha, dt, time);
    this.drawShots(alpha);
    this.updateNumbers(dt);
    this.updateWisps(dt);
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    for (const n of this.numbers) n.text.destroy();
    for (const t of this.spareTexts) t.destroy();
    this.spareTexts.length = 0;
    for (const w of this.wisps) w.image.destroy();
    for (const list of [this.bodies, this.eyes, this.shots]) for (const i of list) i.destroy();
    this.numbers.length = 0;
    this.wisps.length = 0;
  }

  private drawEnemies(alpha: number, dt: number, time: number): void {
    for (const [id, left] of this.flash) {
      if (left <= dt) this.flash.delete(id);
      else this.flash.set(id, left - dt);
    }
    while (this.bodies.length < this.enemies.length) {
      this.bodies.push(
        this.scene.add.image(0, 0, TextureKey.sprites, spriteFrame(SHEET, 0)).setOrigin(0.5, 1),
      );
      this.eyes.push(
        this.glowScene.add
          .image(0, 0, TextureKey.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDisplaySize(COMBAT_VIEW.eyeGlowPx, COMBAT_VIEW.eyeGlowPx),
      );
    }
    for (let i = 0; i < this.bodies.length; i++) {
      const image = this.bodies[i];
      const eye = this.eyes[i];
      const enemy = this.enemies[i];
      if (!image || !eye) continue;
      const def = enemy ? ENEMIES[enemy.type] : undefined;
      // Bosses are drawn by the BossRenderer (their own sheet).
      if (!enemy || !def || isBossBody(enemy.type)) {
        image.setVisible(false);
        eye.setVisible(false);
        continue;
      }
      const b = enemy.body;
      const x = Math.round(enemy.prevX + (b.x - enemy.prevX) * alpha + b.width / 2);
      const y = Math.round(enemy.prevY + (b.y - enemy.prevY) * alpha + b.height);
      const rate = def.ai === 'flyer' ? COMBAT_VIEW.flapRate : COMBAT_VIEW.walkRate;
      const frame = def.frame + (Math.floor(time * rate + enemy.id * COMBAT_VIEW.animPhase) % 2);
      // Hoppers squash on the ground, stretch in the air.
      const squash =
        def.ai === 'hopper' ? (enemy.onGround ? COMBAT_VIEW.squash : 1 / COMBAT_VIEW.squash) : 1;
      const tunnelling = def.ai === 'burrower' && enemy.state === 'tunnel';
      image
        .setFrame(spriteFrame(SHEET, frame))
        .setPosition(x, y)
        .setFlipX(enemy.facing < 0)
        .setScale(1 / squash, squash)
        .setDepth(tunnelling ? Depth.backgroundWalls + 0.5 : Depth.entities)
        .setAlpha(def.ai === 'shade' ? COMBAT_VIEW.shadeAlpha : 1)
        .setVisible(true);
      // Phaser 4: the fill is a tint mode (setTintFill is the removed v3 call).
      if (this.flash.has(enemy.id)) image.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else image.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      // Eyes: a faint glow so creatures read in the dark (shades' eyes are the brightest part).
      const shade = def.ai === 'shade';
      eye
        .setPosition(
          x + enemy.facing * b.width * COMBAT_VIEW.eyeForward,
          y - b.height * COMBAT_VIEW.eyeHeight,
        )
        .setTint(shade ? PALETTE.moonSilver[3] : PALETTE.honey[2])
        .setAlpha(shade ? COMBAT_VIEW.shadeEyeAlpha : COMBAT_VIEW.eyeAlpha)
        .setDisplaySize(
          shade ? COMBAT_VIEW.shadeGlowPx : COMBAT_VIEW.eyeGlowPx,
          shade ? COMBAT_VIEW.shadeGlowPx : COMBAT_VIEW.eyeGlowPx,
        )
        .setVisible(!tunnelling);
    }
  }

  private drawShots(alpha: number): void {
    while (this.shots.length < this.projectiles.length) {
      this.shots.push(this.glowScene.add.image(0, 0, TextureKey.glow));
    }
    for (let i = 0; i < this.shots.length; i++) {
      const image = this.shots[i];
      const p = this.projectiles[i];
      if (!image) continue;
      if (!p) {
        image.setVisible(false);
        continue;
      }
      const b = p.body;
      const x = p.prevX + (b.x - p.prevX) * alpha + b.width / 2;
      const y = p.prevY + (b.y - p.prevY) * alpha + b.height / 2;
      const angle = Math.atan2(b.vy, b.vx);
      if (p.kind === 'arrow' && ARROW_ICON) {
        // The arrow icon points up-right (−45°); turn it along its flight.
        image
          .setTexture(ARROW_ICON.texture, ARROW_ICON.frame)
          .setBlendMode(Phaser.BlendModes.NORMAL)
          .clearTint()
          .setAlpha(1)
          .setDisplaySize(COMBAT_VIEW.arrowPx, COMBAT_VIEW.arrowPx)
          .setRotation(angle + Math.PI / 4);
      } else {
        image
          .setTexture(TextureKey.glow)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(BEAM_COLOR)
          .setAlpha(1)
          .setDisplaySize(COMBAT_VIEW.beamLength, COMBAT_VIEW.beamWidth)
          .setRotation(angle);
      }
      image.setPosition(Math.round(x), Math.round(y)).setVisible(true);
    }
  }

  private number(x: number, y: number, amount: number, color: string): void {
    if (amount <= 0) return;
    const text =
      this.spareTexts.pop() ??
      this.glowScene.add
        .text(0, 0, '', {
          fontFamily: 'monospace',
          fontSize: `${COMBAT_VIEW.numberFontPx}px`,
          stroke: COMBAT_VIEW.numberStroke,
          strokeThickness: COMBAT_VIEW.numberStrokePx,
        })
        .setOrigin(0.5, 1);
    text
      .setText(String(amount))
      .setColor(color)
      .setPosition(Math.round(x), Math.round(y))
      .setAlpha(1)
      .setVisible(true);
    this.numbers.push({ text, age: 0 });
  }

  private updateNumbers(dt: number): void {
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      if (!n) continue;
      n.age += dt;
      if (n.age >= COMBAT_VIEW.numberSeconds) {
        this.numbers.splice(i, 1);
        if (this.spareTexts.length < COMBAT_VIEW.numberPool)
          this.spareTexts.push(n.text.setVisible(false));
        else n.text.destroy();
        continue;
      }
      n.text.y -= COMBAT_VIEW.numberRise * dt;
      n.text.setAlpha(1 - n.age / COMBAT_VIEW.numberSeconds);
    }
  }

  private dissolve(x: number, y: number, color: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const image = this.glowScene.add
        .image(x, y, TextureKey.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setDisplaySize(COMBAT_VIEW.wispPx, COMBAT_VIEW.wispPx);
      this.wisps.push({
        image,
        age: 0,
        // Spread round the body, rising, each fading at a slightly different time.
        life: COMBAT_VIEW.wispSeconds * (1 - COMBAT_VIEW.wispLifeJitter * ((k % 3) / 2)),
        vx: Math.cos(a) * COMBAT_VIEW.wispSpread,
        vy: -COMBAT_VIEW.wispRise * (1 - COMBAT_VIEW.wispLifeJitter * Math.abs(Math.cos(a))),
      });
    }
  }

  private updateWisps(dt: number): void {
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i];
      if (!w) continue;
      w.age += dt;
      if (w.age >= w.life) {
        w.image.destroy();
        this.wisps.splice(i, 1);
        continue;
      }
      w.image.x += w.vx * dt;
      w.image.y += w.vy * dt;
      w.vx *= 1 - COMBAT_VIEW.wispDrag * dt;
      w.image.setAlpha(1 - w.age / w.life);
    }
  }
}
