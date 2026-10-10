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

/** Pip: a small hooded child (about 26 px tall) standing on the bottom edge. */
function child(s: Sprite, npc: NpcDef, f: 0 | 1): void {
  const { ramp, accent } = npc;
  s.rect(f ? 9 : 10, 35, 2, 5, 'bark', 1).rect(f ? 13 : 12, 35, 2, 5, 'bark', 1);
  s.rect(8, 25, 8, 11, ramp, 2).rect(8, 30, 8, 1, accent, 2); // body and belt
  s.blob(12, 21, 3.5, 3.5, 'honey'); // face
  s.rect(8, 14, 8, 3, ramp, 1).rect(8, 17, 2, 6, ramp, 1).rect(14, 17, 2, 6, ramp, 1); // hood
  s.rect(f ? 6 : 7, 26, 2, 6, ramp, 1).rect(f ? 16 : 15, 26, 2, 6, ramp, 1); // arms
  s.outline().set(11, 21, 'bark', 0, true).set(13, 21, 'bark', 0, true);
}

/** The Gate Warden: a villager with a spear at his side. */
function warden(s: Sprite, npc: NpcDef, f: 0 | 1): void {
  villager(s, npc, f);
  s.rect(21, 8, 1, 32, 'bark', 2).set(21, 7, 'stone', 3).set(21, 6, 'stone', 2);
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
      else if (npc.key === 'child') child(s, npc, f);
      else if (npc.key === 'warden') warden(s, npc, f);
      else villager(s, npc, f);
      s.draw(out, (i * 2 + f) * def.frameWidth);
    }
  });
  return out;
}

/** A covered wagon (frame 0/1: wheel spokes turn) pulled by a stag facing right. */
function caravan(s: Sprite, f: 0 | 1): void {
  // Wagon bed and canvas cover (moonSilver) with honey stripes.
  s.blob(19, 15, 14, 8, 'moonSilver');
  s.rect(5, 16, 29, 8, 'bark', 2).rect(5, 16, 29, 1, 'bark', 3);
  for (const x of [11, 18, 25]) s.rect(x, 9, 1, 7, 'honey', 2);
  // Lantern hanging at the front on a short pole.
  s.rect(33, 12, 3, 1, 'bark', 1).rect(35, 13, 1, 3, 'gold', 1).rect(34, 16, 3, 4, 'honey', 3);
  // Shaft to the stag.
  s.rect(34, 22, 11, 1, 'bark', 1);
  // The stag: body, neck, head, legs (alternate with the frame), antlers, tail.
  s.blob(50, 19, 7, 4, 'honey').rect(55, 12, 3, 8, 'honey', 2).blob(59, 11, 3, 2.5, 'honey');
  s.rect(f ? 44 : 45, 22, 2, 10, 'honey', 1).rect(f ? 48 : 47, 22, 2, 10, 'honey', 1);
  s.rect(f ? 52 : 53, 22, 2, 10, 'honey', 1).rect(f ? 56 : 55, 22, 2, 10, 'honey', 1);
  s.set(43, 17, 'honey', 3).set(43, 18, 'honey', 2);
  s.set(58, 7, 'bark', 3).set(58, 6, 'bark', 3).set(60, 7, 'bark', 3).set(61, 6, 'bark', 3);
  s.set(57, 8, 'bark', 3).set(59, 8, 'bark', 3).set(57, 5, 'bark', 3).set(62, 5, 'bark', 3);
  s.outline().eye(60, 11, 'bark').eye(35, 17, 'honey');
  // Two wheels; spokes cross as a plus in one frame and an X in the other.
  const plus = [
    [0, -2],
    [0, 2],
    [-2, 0],
    [2, 0],
  ] as const;
  const cross = [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ] as const;
  for (const cx of [11, 27]) {
    s.blob(cx, 27.5, 4.5, 4.5, 'gold').outline();
    s.set(cx, 27, 'gold', 3, true);
    for (const [dx, dy] of f ? cross : plus) s.set(cx + dx, 27 + dy, 'bark', 3, true);
  }
}

/** The `caravan` placeholder sheet: two 64×32 walking frames, ground line on the bottom row. */
export function buildCaravan(): RgbaImage {
  const def = spriteAsset('caravan');
  if (!def) throw new Error('caravan is missing from SPRITE_ASSETS');
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  for (const f of [0, 1] as const) {
    const s = new Sprite(def.frameWidth, def.frameHeight);
    caravan(s, f);
    s.draw(out, f * def.frameWidth);
  }
  return out;
}
