/**
 * Placeholder sprites for M10's living things: the `critters` sheet (16×16, two frames per
 * critter, frame order = `frame` in src/data/critters.ts) and the `folk` sheet (24×40, two frames
 * per villager and the Old Dryad, order = FOLK in src/data/npcs.ts).
 * Flying and swimming critters are drawn centred in their frame, bats hang from its top edge,
 * everything else stands on its bottom edge.
 */
import { CRITTERS } from '../../src/data/critters';
import { FOLK, type NpcDef } from '../../src/data/npcs';
import { spriteAsset } from '../../src/data/spriteAssets';
import { createImage, type RgbaImage } from './image';
import { ShapeSprite as Sprite } from './placeholderShapes';

const CRITTER_DRAW: Record<string, (s: Sprite, f: 0 | 1) => void> = {
  firefly: (s, f) => {
    s.blob(8, 8, 1.5, 1.5, 'leaf')
      .set(f ? 6 : 7, 6, 'moonSilver', 2)
      .set(f ? 10 : 9, 6, 'moonSilver', 2);
    s.eye(8, 9, 'honey');
  },
  moth: (s, f) => {
    s.rect(7, 6, 2, 5, 'bark', 2);
    if (f) s.rect(3, 5, 4, 3, 'moonSilver', 2).rect(9, 5, 4, 3, 'moonSilver', 2);
    else s.rect(4, 7, 3, 4, 'moonSilver', 2).rect(9, 7, 3, 4, 'moonSilver', 2);
    s.outline();
  },
  cave_bat: (s, f) => {
    if (f) {
      // In flight: wings out.
      s.blob(8, 5, 2, 2, 'tealShadow')
        .rect(2, 3, 4, 2, 'tealShadow', 2)
        .rect(10, 3, 4, 2, 'tealShadow', 2);
      s.outline().eye(7, 5, 'rose').eye(9, 5, 'rose');
    } else {
      // Hanging upside down, wings wrapped.
      s.rect(7, 0, 1, 1, 'tealShadow', 1).rect(9, 0, 1, 1, 'tealShadow', 1);
      s.blob(8, 3.5, 2.5, 3, 'tealShadow').outline().eye(7, 5, 'rose').eye(9, 5, 'rose');
    }
  },
  deer: (s, f) => {
    s.blob(8, 9, 6, 2.5, 'honey').blob(13, 5, 2, 2, 'honey');
    s.rect(f ? 3 : 4, 11, 1, 5, 'honey', 1).rect(f ? 12 : 11, 11, 1, 5, 'honey', 1);
    s.set(13, 2, 'bark', 2).set(14, 1, 'bark', 2).set(12, 1, 'bark', 2);
    s.outline().eye(14, 5, 'bark');
  },
  owl: (s, f) => {
    s.blob(8, 10, 3.5, 4.5, 'bark').blob(8, 7, 3, 2.5, 'bark');
    s.set(5, 4, 'bark', 2).set(11, 4, 'bark', 2).rect(6, 15, 4, 1, 'honey', 1).outline();
    if (f) s.rect(7, 7, 3, 1, 'bark', 1);
    else s.eye(7, 7, 'gold').eye(9, 7, 'gold');
  },
  frog: (s, f) => {
    if (f) s.blob(8, 11, 3, 2.5, 'moss').rect(4, 13, 2, 2, 'moss', 1).rect(10, 13, 2, 2, 'moss', 1);
    else s.blob(8, 13, 4, 2.5, 'moss').rect(4, 15, 2, 1, 'moss', 1).rect(10, 15, 2, 1, 'moss', 1);
    s.outline()
      .eye(7, f ? 9 : 11, 'gold')
      .eye(10, f ? 9 : 11, 'gold');
  },
  glowfish: (s, f) => {
    s.blob(8, 8, 3.5, 2, 'cyan')
      .set(4, f ? 7 : 9, 'cyan', 2)
      .set(3, 8, 'cyan', 2);
    s.outline().eye(10, 8, 'moonSilver');
  },
};

/** The `critters` placeholder sheet: one row of 16×16 frames, two per critter. */
export function buildCritters(): RgbaImage {
  const def = spriteAsset('critters');
  if (!def) throw new Error('critters is missing from SPRITE_ASSETS');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  for (const critter of CRITTERS) {
    const draw = CRITTER_DRAW[critter.key];
    if (!draw) throw new Error(`No placeholder drawing for critter ${critter.key}`);
    for (const f of [0, 1] as const) {
      const s = new Sprite(def.frameWidth, def.frameHeight);
      draw(s, f);
      s.draw(out, (critter.frame + f) * def.frameWidth);
    }
  }
  return out;
}

/** A cloaked villager standing on the bottom edge; frame 1 is mid-step. */
function villager(s: Sprite, npc: NpcDef, f: 0 | 1): void {
  const { ramp, accent } = npc;
  s.rect(f ? 9 : 10, 34, 2, 6, 'bark', 1).rect(f ? 14 : 13, 34, 2, 6, 'bark', 1);
  s.rect(7, 16, 10, 19, ramp, 2).rect(8, 14, 8, 3, ramp, 2);
  s.rect(7, 24, 10, 2, accent, 2); // belt
  s.blob(12, 10, 4, 4.5, 'honey'); // face
  s.rect(7, 4, 10, 3, ramp, 1).rect(7, 7, 2, 6, ramp, 1).rect(15, 7, 2, 6, ramp, 1); // hood
  s.rect(f ? 5 : 6, 17, 2, 9, ramp, 1).rect(f ? 18 : 17, 17, 2, 9, ramp, 1); // arms
  s.outline().set(10, 10, 'bark', 0, true).set(14, 10, 'bark', 0, true);
}

/** The Old Dryad: a bark figure with a crown of leaves, swaying (frame 1). */
function dryad(s: Sprite, f: 0 | 1): void {
  s.rect(8, 14, 8, 26, 'bark', 2).rect(6, 34, 12, 6, 'bark', 1);
  s.blob(12, 9, 5, 5.5, 'bark');
  s.blob(f ? 11 : 12, 4, 9, 4, 'moss')
    .blob(f ? 5 : 6, 7, 3, 3, 'leaf')
    .blob(f ? 17 : 18, 7, 3, 3, 'leaf');
  s.rect(f ? 3 : 4, 16, 4, 2, 'bark', 1).rect(f ? 16 : 17, 15, 4, 2, 'bark', 1);
  s.outline().eye(10, 10, 'mint').eye(14, 10, 'mint');
}

/** The `folk` placeholder sheet: one row of 24×40 frames, two per villager and the Dryad. */
export function buildFolk(): RgbaImage {
  const def = spriteAsset('folk');
  if (!def) throw new Error('folk is missing from SPRITE_ASSETS');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  FOLK.forEach((npc, i) => {
    for (const f of [0, 1] as const) {
      const s = new Sprite(def.frameWidth, def.frameHeight);
      if (npc.key === 'dryad') dryad(s, f);
      else villager(s, npc, f);
      s.draw(out, (i * 2 + f) * def.frameWidth);
    }
  });
  return out;
}
