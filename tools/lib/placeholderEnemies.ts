/**
 * Placeholder enemy sprites (M8): two frames per creature in the `enemies` sheet (frame order =
 * `frame` in src/data/enemies.ts), 24×24 each, drawn from simple shapes in palette ramps and
 * outlined in the darkest shade of their own ramp (plan 2.9.1). Most motion comes from code
 * (squash, bob, flap); the second frame is a pose change.
 */
import { ENEMIES } from '../../src/data/enemies';
import { spriteAsset } from '../../src/data/spriteAssets';
import { createImage, type RgbaImage } from './image';
import { ShapeSprite as Sprite } from './placeholderShapes';

const SIZE = 24;

/** Creatures stand on the bottom edge, centred; frame 1 is the alternate pose. */
const DRAW: Record<string, (s: Sprite, f: 0 | 1) => void> = {
  moss_slime: (s, f) => {
    s.blob(12, f ? 19 : 18.5, f ? 8 : 7, f ? 4.5 : 5.5, 'moss').outline();
    s.eye(9, 17).eye(14, 17);
  },
  bramble_sprite: (s, f) => {
    s.rect(10, 8, 4, 11, 'bark', 2).blob(12, 8, 5, 4, 'leaf');
    s.rect(f ? 8 : 9, 19, 2, 5, 'bark', 1).rect(f ? 14 : 13, 19, 2, 5, 'bark', 1);
    s.rect(6, f ? 10 : 12, 4, 1, 'bark', 2)
      .rect(14, f ? 12 : 10, 4, 1, 'bark', 2)
      .outline();
    s.eye(10, 8, 'gold').eye(13, 8, 'gold');
  },
  dusk_bat: (s, f) => {
    s.blob(12, 12, 3, 3, 'tealShadow');
    if (f) s.rect(3, 9, 6, 2, 'tealShadow', 2).rect(15, 9, 6, 2, 'tealShadow', 2);
    else s.rect(4, 13, 5, 3, 'tealShadow', 2).rect(15, 13, 5, 3, 'tealShadow', 2);
    s.set(10, 9, 'tealShadow', 2).set(14, 9, 'tealShadow', 2).outline();
    s.eye(11, 12, 'rose').eye(13, 12, 'rose');
  },
  spore_crawler: (s, f) => {
    s.blob(12, 19, 8, 3.5, 'rose').blob(12, 15, 5, 3, 'mint');
    for (const x of [6, 10, 14, 18]) s.rect(x + (f ? 1 : 0), 22, 1, 2, 'rose', 1);
    s.outline().eye(15, 18, 'mint');
  },
  root_wyrm: (s, f) => {
    s.blob(12, 13, 6, 6, 'bark').blob(f ? 9 : 15, 19, 4, 3, 'bark');
    s.rect(9, 17, 6, 2, 'ember', 1).outline();
    s.eye(10, 11, 'gold').eye(14, 11, 'gold');
  },
  crystal_mite: (s, f) => {
    s.blob(12, 19, 6, 3, 'cyan').rect(10, 13, 3, 4, 'moonSilver', 3).rect(13, 14, 2, 3, 'cyan', 3);
    for (const x of [7, 11, 15]) s.rect(x + (f ? 1 : 0), 22, 1, 2, 'stone', 1);
    s.outline().eye(16, 18, 'rose');
  },
  ember_imp: (s, f) => {
    s.blob(12, 13, 5, 6, 'ember').rect(f ? 4 : 5, f ? 9 : 11, 4, 2, 'ember', 1);
    s.rect(f ? 16 : 15, f ? 9 : 11, 4, 2, 'ember', 1)
      .set(9, 6, 'ember', 1)
      .set(15, 6, 'ember', 1);
    s.outline().eye(10, 12, 'honey').eye(14, 12, 'honey');
  },
  gloam_hound: (s, f) => {
    s.blob(11, 16, 9, 4, 'gloam').blob(19, 13, 4, 3, 'gloam');
    s.rect(f ? 5 : 6, 19, 2, 5, 'gloam', 1).rect(f ? 15 : 14, 19, 2, 5, 'gloam', 1);
    s.outline().eye(20, 12, 'rose').eye(21, 12, 'rose');
  },
  shade: (s, f) => {
    // A hooded wisp of darkness, frayed at the bottom; only the eyes are bright.
    s.blob(12, 9, 5, 6, 'gloam').rect(7, 9, 10, 9, 'gloam', 1);
    for (let x = 7; x < 17; x += 2)
      s.rect(x, 18, 1, (x + (f ? 1 : 0)) % 4 === 1 ? 4 : 2, 'gloam', 1);
    s.outline().eye(10, 9, 'moonSilver').eye(14, 9, 'moonSilver');
  },
};

/** The `enemies` placeholder sheet: one row of 24×24 frames, two per creature. */
export function buildEnemies(): RgbaImage {
  const def = spriteAsset('enemies');
  if (!def) throw new Error('enemies is missing from SPRITE_ASSETS');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  for (const enemy of ENEMIES) {
    const draw = DRAW[enemy.key];
    if (!draw) throw new Error(`No placeholder drawing for enemy ${enemy.key}`);
    for (const f of [0, 1] as const) {
      const s = new Sprite(SIZE);
      draw(s, f);
      s.draw(out, (enemy.frame + f) * def.frameWidth);
    }
  }
  return out;
}
