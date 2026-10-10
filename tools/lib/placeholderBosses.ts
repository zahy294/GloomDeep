/**
 * Placeholder boss sprites (M12): the `bosses` sheet, two 80×80 frames per boss (frame = the boss
 * enemy's `frame` in src/data/enemies.ts, +1 for the alternate pose). Each body is centred
 * horizontally and stands on the bottom edge, roughly filling its ENEMIES width×height box (wings,
 * crowns and horns may overhang). Same ShapeSprite rules as the small creatures: palette ramps,
 * outlined in the darkest shade of their own ramp (plan 2.9.1).
 */
import { BOSSES } from '../../src/data/bosses';
import { ENEMIES } from '../../src/data/enemies';
import { spriteAsset } from '../../src/data/spriteAssets';
import type { RampName } from '../../src/data/palette';
import { createImage, type RgbaImage } from './image';
import { ShapeSprite as Sprite, type Shade } from './placeholderShapes';

const SIZE = 80;
const CX = SIZE / 2;

type Pose = 0 | 1;

/** A thick straight line of pixels. */
function stroke(
  s: Sprite,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ramp: RampName,
  shade: Shade,
  thick = 1,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    s.rect(x, y, thick, thick, ramp, shade);
  }
}

/** True when a body pixel is already drawn there (so veins and roots stay on the body). */
function filled(s: Sprite, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.width && y < s.height && s.ramp[y * s.width + x] !== null;
}

function mothMatriarch(s: Sprite, pose: Pose): void {
  const wingY = pose ? 66 : 56;
  const wingRy = pose ? 13 : 18;
  for (const side of [-1, 1]) {
    const wx = CX + side * 19;
    s.blob(wx, wingY, 19, wingRy, 'rose');
    // Lower hindwing tip, and a honey inner patch with an eye spot.
    s.blob(wx + side * 2, wingY + (pose ? 4 : 9), 13, 7, 'rose');
    s.blob(wx - side * 3, wingY - 1, 9, wingRy - 5, 'honey');
    s.blob(wx + side * 2, wingY, 5, 5, 'ember');
    s.blob(wx + side * 2, wingY, 3, 3, 'rose');
  }
  // Fuzzy body, head, antennae.
  s.blob(CX, 68, 7, 12, 'honey').blob(CX, 55, 5, 5, 'honey');
  for (let y = 60; y < 78; y += 3) {
    s.set(CX - 8, y, 'honey', 3).set(CX + 8, y, 'honey', 3);
  }
  for (const side of [-1, 1]) {
    stroke(s, CX + side * 3, 51, CX + side * 8, 42, 'honey', 2);
    stroke(s, CX + side * 8, 42, CX + side * 11, 38, 'honey', 3);
    s.set(CX + side * 12, 39, 'honey', 3).set(CX + side * 13, 40, 'honey', 3);
  }
  s.outline();
  for (const side of [-1, 1]) {
    s.set(CX + side * 21, wingY, 'moonSilver', 3, true);
    s.eye(CX + side * 3, 55, 'rose');
  }
}

function mireSovereign(s: Sprite, pose: Pose): void {
  // Reed crown behind the head.
  const reeds = [-9, -6, -3, 0, 3, 6, 9];
  reeds.forEach((dx, i) => {
    const top = 26 + (i % 3) * 3 + Math.abs(dx) / 3;
    stroke(s, CX + dx, 41, CX + dx + Math.sign(dx), Math.round(top), 'moss', 2);
    s.set(CX + dx + Math.sign(dx), Math.round(top) - 1, 'mud', 3);
  });
  // Hulking body, arms, mossy shoulders, head.
  s.blob(CX, 62, 21, 18, 'mud');
  s.rect(16, 52, 8, 28, 'mud', 2).rect(56, 52, 8, 28, 'mud', 2);
  s.blob(19, 78, 6, 3, 'mud').blob(61, 78, 6, 3, 'mud');
  s.blob(25, 49, 10, 6, 'moss').blob(55, 49, 10, 6, 'moss');
  s.blob(CX, 47, 11, 9, 'mud');
  // Willow strands hang from the shoulders.
  for (const x of [17, 21, 25, 29, 51, 55, 59, 63]) {
    s.rect(x, 53, 1, 8 + ((x * 7) % 9), 'moss', 1);
  }
  // Mud streaks on the belly.
  for (let i = 0; i < 6; i++) s.rect(30 + i * 4, 62 + (i % 2) * 6, 3, 1, 'mud', 3);
  s.outline();
  s.eye(35, 44, 'mint').eye(36, 44, 'mint').eye(44, 44, 'mint').eye(45, 44, 'mint');
  // Mouth: a dark line, or open with teeth.
  const mouthH = pose ? 6 : 1;
  s.rect(34, 50, 12, mouthH, 'mud', 0);
  if (pose) {
    for (const x of [35, 38, 41, 44]) s.set(x, 50, 'moonSilver', 3, true);
    s.rect(36, 55, 8, 1, 'rose', 1);
  }
}

function hollowWarden(s: Sprite, pose: Pose): void {
  // Legs, torso, helm.
  s.rect(28, 64, 9, 16, 'moonSilver', 1).rect(43, 64, 9, 16, 'moonSilver', 1);
  s.rect(26, 77, 12, 3, 'moonSilver', 2).rect(42, 77, 12, 3, 'moonSilver', 2);
  s.blob(CX, 53, 16, 14, 'moonSilver');
  s.rect(32, 60, 16, 8, 'moonSilver', 1);
  s.blob(CX, 38, 10, 9, 'moonSilver');
  s.rect(CX - 1, 24, 3, 9, 'cyan', 3);
  // Facets: cyan planes cut across the shell.
  for (let i = 0; i < 12; i++) {
    s.set(CX - 12 + i, 45 + i, 'cyan', 2);
    s.set(CX + 12 - i, 45 + i, 'cyan', 2);
  }
  for (let i = 0; i < 8; i++)
    s.set(CX - 8 + i, 31 + i, 'cyan', 2).set(CX + 8 - i, 31 + i, 'cyan', 2);
  // Pauldrons and arms: down, or raised overhead in pose 1.
  s.blob(24, 46, 7, 6, 'cyan').blob(56, 46, 7, 6, 'cyan');
  if (pose) {
    stroke(s, 22, 46, 16, 28, 'moonSilver', 2, 5);
    stroke(s, 58, 46, 64, 28, 'moonSilver', 2, 5);
    s.blob(18, 26, 5, 5, 'cyan').blob(63, 26, 5, 5, 'cyan');
  } else {
    s.rect(20, 48, 6, 22, 'moonSilver', 2).rect(54, 48, 6, 22, 'moonSilver', 2);
    s.blob(23, 72, 5, 5, 'cyan').blob(57, 72, 5, 5, 'cyan');
  }
  s.outline();
  // A cold eye slit.
  s.rect(CX - 6, 38, 12, 2, 'cyan', 3);
  for (let x = CX - 6; x < CX + 6; x++) s.eye(x, 38, 'cyan');
  s.eye(CX - 2, 39, 'moonSilver').eye(CX + 1, 39, 'moonSilver');
}

function gloamHeart(s: Sprite, pose: Pose): void {
  const k = pose ? 1.1 : 1;
  const lobeY = 44 - (pose ? 3 : 0);
  s.blob(CX - 14 * k, lobeY, 15 * k, 14 * k, 'gloam').blob(
    CX + 14 * k,
    lobeY,
    15 * k,
    14 * k,
    'gloam',
  );
  // The point narrows down to the bottom edge.
  for (let y = lobeY; y <= 79; y++) {
    const hw = Math.round(((79 - y) / (79 - lobeY)) * 28 * k);
    s.rect(CX - hw, y, hw * 2, 1, 'gloam', 2);
  }
  // Rose veins and a bright core.
  for (const a of [-16, -8, 8, 16]) {
    for (let y = 30; y < 76; y++) {
      const u = (y - 30) / 46;
      const x = Math.round(CX + a * k * (0.4 + 1.1 * Math.sin(u * Math.PI)) * (1 - u * 0.6));
      if (filled(s, x, y)) s.set(x, y, 'rose', (y + a) % 5 === 0 ? 3 : 1);
    }
  }
  s.blob(CX, 50, 8 * k, 8 * k, 'rose').blob(CX, 50, 4 * k, 4 * k, 'moonSilver');
  // Bark roots wrap the heart and spread at the base.
  for (const a of [-24, -11, 11, 24]) {
    for (let y = 24; y < 79; y++) {
      const u = (y - 24) / 55;
      const x = Math.round(CX + a * k * Math.sin(u * Math.PI * 1.5 + 0.4) * (0.5 + u * 0.5));
      if (filled(s, x, y)) s.rect(x, y, 2, 1, 'bark', (y >> 2) % 2 ? 1 : 2);
    }
  }
  for (const side of [-1, 1]) {
    stroke(s, CX + side * 14, 76, CX + side * 30, 78, 'bark', 2, 2);
    stroke(s, CX + side * 28, 77, CX + side * 36, 72, 'bark', 1, 2);
  }
  s.outline();
  s.blob(CX, 50, 4 * k, 4 * k, 'moonSilver');
  s.blob(CX, 50, 2 * k, 2 * k, 'honey');
}

const DRAW: Record<string, (s: Sprite, pose: Pose) => void> = {
  moth_matriarch: mothMatriarch,
  mire_sovereign: mireSovereign,
  hollow_warden: hollowWarden,
  gloam_heart: gloamHeart,
};

/** The `bosses` placeholder sheet: one row of 80×80 frames, two per boss. */
export function buildBosses(): RgbaImage {
  const def = spriteAsset('bosses');
  if (!def) throw new Error('bosses is missing from SPRITE_ASSETS');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  for (const boss of BOSSES) {
    const enemy = ENEMIES.find((e) => e.key === boss.enemy);
    const draw = DRAW[boss.enemy];
    if (!enemy || !draw) throw new Error(`No placeholder drawing for boss ${boss.enemy}`);
    for (const pose of [0, 1] as const) {
      const s = new Sprite(SIZE);
      draw(s, pose);
      s.draw(out, (enemy.frame + pose) * def.frameWidth);
    }
  }
  return out;
}
