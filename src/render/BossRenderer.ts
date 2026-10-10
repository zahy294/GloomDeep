import * as Phaser from 'phaser';
import { BOSS, BOSS_VIEW } from '../config';
import { BOSSES } from '../data/bosses';
import { ENEMIES } from '../data/enemies';
import { PALETTE } from '../data/palette';
import { PARTICLE_FRAME } from '../data/spriteAssets';
import type { Simulation } from '../sim/Simulation';
import type { ShotKind } from '../sim/systems/bosses/types';
import { Depth } from './depth';
import { TextureKey } from './scenes/keys';
import { spriteFrame } from './spriteFrames';

const SHEET = 'bosses';
const PARTICLES = 'particles';
const SHOT_FRAME: Record<ShotKind, number> = {
  dust: PARTICLE_FRAME.dust,
  bolt: PARTICLE_FRAME.bolt,
  wave: PARTICLE_FRAME.bolt,
  slam: PARTICLE_FRAME.slam,
  shard: PARTICLE_FRAME.shard,
  orb: PARTICLE_FRAME.orb,
};
const SHOT_TINT: Record<ShotKind, number> = {
  dust: PALETTE.rose[3],
  bolt: PALETTE.tealShadow[3],
  wave: PALETTE.mint[2],
  slam: PALETTE.stone[3],
  shard: PALETTE.cyan[3],
  orb: PALETTE.rose[2],
};
/** Each boss's halo colour in the glow scene (so it reads in its dark arena). */
const HALO: Record<string, number> = {
  moth: PALETTE.rose[3],
  mire: PALETTE.mint[2],
  warden: PALETTE.cyan[3],
  heart: PALETTE.rose[1],
};
const BOSS_BODIES = new Set(BOSSES.map((b) => b.enemy));

/** Is this creature (index into ENEMIES) a boss's body, drawn here and not by CombatRenderer? */
export function isBossBody(type: number): boolean {
  return BOSS_BODIES.has(ENEMIES[type]?.key ?? '');
}

/**
 * Draws a boss fight (M12): the boss from the `bosses` sheet (two poses, a white flash when hit,
 * a halo in the Glow scene so it reads in the dark, the Matriarch tumbling when stunned, the
 * Sovereign dim under the water, the Warden's cracks, the Heart's pulse), the hostile shots, and
 * the Warden's lantern beam as it bounces off the prisms. During the intro it asks the camera to
 * look at the boss and zoom in (`focus`, `zoom`).
 */
export class BossRenderer {
  private readonly body: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  private readonly shots: Phaser.GameObjects.Image[] = [];
  private readonly beam: Phaser.GameObjects.Graphics;
  private flash = 0;
  private readonly offs: (() => void)[];

  constructor(
    scene: Phaser.Scene,
    private readonly glowScene: Phaser.Scene,
    private readonly sim: Simulation,
    shake: (amplitude: number, seconds: number) => void,
  ) {
    this.body = scene.add
      .image(0, 0, TextureKey.sprites, spriteFrame(SHEET, 0))
      .setOrigin(0.5, 1)
      .setDepth(Depth.entities)
      .setVisible(false);
    this.halo = glowScene.add
      .image(0, 0, TextureKey.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.beam = glowScene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const { events } = sim;
    this.offs = [
      events.on('enemyHit', ({ id, source }) => {
        if (source !== 'light' && sim.bosses.active?.boss?.id === id)
          this.flash = BOSS_VIEW.flashSeconds;
      }),
      events.on('bossAction', ({ kind }) => {
        if (kind === 'slam') shake(BOSS_VIEW.slamShake, BOSS_VIEW.shakeSeconds);
        else if (kind === 'stunned' || kind === 'cracked')
          shake(BOSS_VIEW.hitShake, BOSS_VIEW.shakeSeconds);
      }),
      events.on('bossPhase', () => shake(BOSS_VIEW.phaseShake, BOSS_VIEW.phaseShakeSeconds)),
      events.on('bossDefeated', () => shake(BOSS_VIEW.phaseShake, BOSS_VIEW.phaseShakeSeconds)),
    ];
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.body.destroy();
    this.halo.destroy();
    this.beam.destroy();
    for (const s of this.shots) s.destroy();
  }

  /** During the intro: where the camera should look (pixels), else null. */
  focus(): { x: number; y: number } | null {
    const a = this.sim.bosses.active;
    const b = a?.boss?.body;
    if (!a || !b || a.state !== 'intro') return null;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** Camera zoom wanted now: in during the intro, back out as it ends. */
  zoom(): number {
    const a = this.sim.bosses.active;
    if (!a || a.state !== 'intro') return 1;
    const t = a.timer / BOSS.introSeconds;
    const ease = BOSS_VIEW.introEase;
    // In over the first `ease` of the intro, held, out over the last `ease`.
    const k = t < ease ? t / ease : t > 1 - ease ? (1 - t) / ease : 1;
    return 1 + (BOSS_VIEW.introZoom - 1) * Math.max(0, Math.min(1, k));
  }

  update(alpha: number, dt: number, time: number): void {
    this.flash = Math.max(0, this.flash - dt);
    this.drawBoss(alpha, time);
    this.drawShots();
    this.drawBeam();
  }

  private drawBoss(alpha: number, time: number): void {
    const a = this.sim.bosses.active;
    const boss = a?.boss;
    const def = boss ? ENEMIES[boss.type] : undefined;
    const run = a ? this.sim.bosses.run(a) : undefined;
    if (!a || !boss || !def || !run) {
      this.body.setVisible(false);
      this.halo.setVisible(false);
      return;
    }
    const b = boss.body;
    const x = Math.round(boss.prevX + (b.x - boss.prevX) * alpha + b.width / 2);
    const y = Math.round(boss.prevY + (b.y - boss.prevY) * alpha + b.height);
    const view = run.view;
    let pose: number;
    let angle = 0;
    let scale = 1;
    let alphaBody = 1;
    if (view.script === 'moth') {
      pose = Math.floor(time * BOSS_VIEW.flapRate) % 2;
      if (view.mode === 'stunned') {
        pose = 1;
        angle = Math.sin(time * BOSS_VIEW.tumbleRate) * BOSS_VIEW.tumbleAngle;
      }
    } else if (view.script === 'mire') {
      if (view.submerged) alphaBody = BOSS_VIEW.submergedAlpha;
      pose = view.submerged ? 0 : 1;
    } else if (view.script === 'warden') {
      pose = view.cracked > 0 ? 1 : 0;
    } else {
      scale = 1 + Math.sin(time * BOSS_VIEW.pulseRate) * BOSS_VIEW.pulseScale;
      pose = Math.floor(time * BOSS_VIEW.poseRate) % 2;
    }
    this.body
      .setFrame(spriteFrame(SHEET, def.frame + pose))
      .setPosition(x, y)
      .setFlipX(boss.facing < 0)
      .setRotation(angle)
      .setScale(scale)
      .setAlpha(alphaBody)
      .setVisible(true);
    // Phaser 4: the fill is a tint mode.
    if (this.flash > 0) this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (view.script === 'warden' && view.cracked > 0)
      this.body.setTint(PALETTE.cyan[3]).setTintMode(Phaser.TintModes.MULTIPLY);
    else this.body.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    const size = Math.max(b.width, b.height) * BOSS_VIEW.haloScale;
    this.halo
      .setPosition(x, y - b.height / 2)
      .setTint(HALO[view.script] ?? 0xffffff)
      .setAlpha(BOSS_VIEW.haloAlpha * (a.state === 'intro' ? 1 : 0.7) * alphaBody)
      .setDisplaySize(size, size)
      .setVisible(true);
  }

  private drawShots(): void {
    const list = this.sim.bosses.shots;
    while (this.shots.length < list.length) {
      this.shots.push(
        this.glowScene.add
          .image(0, 0, TextureKey.sprites, spriteFrame(PARTICLES, PARTICLE_FRAME.dust))
          .setDepth(1),
      );
    }
    for (let i = 0; i < this.shots.length; i++) {
      const image = this.shots[i];
      const s = list[i];
      if (!image) continue;
      if (!s) {
        image.setVisible(false);
        continue;
      }
      const size = Math.max(BOSS_VIEW.shotMinPx, s.radius * 2 * BOSS_VIEW.shotScale);
      image
        .setFrame(spriteFrame(PARTICLES, SHOT_FRAME[s.kind]))
        .setTint(SHOT_TINT[s.kind])
        .setPosition(Math.round(s.x), Math.round(s.y))
        .setDisplaySize(size, size)
        .setRotation(s.kind === 'shard' ? Math.atan2(s.vy, s.vx) : 0)
        .setVisible(true);
    }
  }

  private drawBeam(): void {
    const g = this.beam;
    g.clear();
    const a = this.sim.bosses.active;
    const run = a ? this.sim.bosses.run(a) : undefined;
    const view = run?.view;
    if (!view || view.script !== 'warden' || view.beam.length < 4) return;
    const p = view.beam;
    for (const [width, color, alpha] of BOSS_VIEW.beamStrokes) {
      g.lineStyle(width, color, alpha * (view.hit ? 1 : BOSS_VIEW.beamIdleAlpha));
      g.beginPath();
      g.moveTo(p[0] ?? 0, p[1] ?? 0);
      for (let i = 2; i + 1 < p.length; i += 2) g.lineTo(p[i] ?? 0, p[i + 1] ?? 0);
      g.strokePath();
    }
  }
}
