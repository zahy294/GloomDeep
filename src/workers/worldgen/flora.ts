import { WORLDGEN } from '../../config';
import { DEPTH_LAYERS, SURFACE_BIOMES } from '../../data/biomes';
import { FLORA, RUINS, type FloraRule } from '../../data/flora';
import { TILES, tileId } from '../../data/tiles';
import { AIR, isSolidId, layerAt, stepRandom, type GenContext } from './context';

interface Rule {
  id: number;
  chance: number;
  chain: number;
}

const GRASS = SURFACE_BIOMES.map((b) => tileId(b.grass));
const SAPLING = Uint8Array.from(TILES, (t) => (t.decor?.sprite === 'saplings' ? 1 : 0));
const DECOR_SUPPORT = TILES.map((t) => t.decor?.support ?? null);
/** Blocks, branches and leaf canopies hold decorations (as in src/sim/world/decor.ts). */
const ANCHOR = Uint8Array.from(TILES, (t) =>
  t.solid || t.platform || t.sunTransmit !== undefined ? 1 : 0,
);
const TRUNK = tileId('living_wood');
const RUIN_STONE = tileId(RUINS.stone);
const RUIN_RUNE = tileId(RUINS.rune);
const FLORA_CFG = WORLDGEN.flora;

function rulesFor(where: FloraRule['where'], keys: readonly { key: string }[]): Rule[][] {
  return keys.map((k) =>
    FLORA.filter((r) => r.where === where && r.in.includes(k.key)).map((r) => ({
      id: tileId(r.decor),
      chance: r.chance,
      chain: r.chain ?? 1,
    })),
  );
}
const SURFACE_RULES = rulesFor('surface', SURFACE_BIOMES);
const FLOOR_RULES = rulesFor('caveFloor', DEPTH_LAYERS);
const CEILING_RULES = rulesFor('caveCeiling', DEPTH_LAYERS);

type Random = () => number;
const between = (random: Random, [min, max]: readonly [number, number]) =>
  min + Math.floor(random() * (max - min + 1));

function pick(rules: readonly Rule[], random: Random): Rule | null {
  for (const rule of rules) if (random() < rule.chance) return rule;
  return null;
}

/**
 * Step 9 (part) — flora: grass, ferns, flowers and saplings on each biome's grass; glowing
 * mushrooms, moss, crystals and embers on cave floors; moss and vines hanging from cave ceilings.
 */
export function flora(ctx: GenContext): void {
  const { width, height, fg, liquid } = ctx;
  const random = stepRandom(ctx, 91);
  const empty = (i: number) => fg[i] === AIR && (liquid[i] ?? 0) === 0;

  let lastSapling = -Infinity;
  for (let x = 1; x < width - 1; x++) {
    const ground = ctx.surface[x] ?? height;
    const biome = ctx.surfaceBiome[x] ?? 0;
    const i = (ground - 1) * width + x;
    if (ground <= 0 || fg[ground * width + x] !== GRASS[biome] || !empty(i)) continue;
    const rule = pick(SURFACE_RULES[biome] ?? [], random);
    if (!rule) continue;
    if (SAPLING[rule.id] === 1) {
      if (x - lastSapling < FLORA_CFG.saplingSpacing) continue;
      lastSapling = x;
    }
    fg[i] = rule.id;
  }

  for (let y = 1; y < height - 1; y++) {
    const layer = layerAt(ctx, y);
    const floor = FLOOR_RULES[layer] ?? [];
    const ceiling = CEILING_RULES[layer] ?? [];
    if (floor.length === 0 && ceiling.length === 0) continue;
    for (let x = 1; x < width - 1; x++) {
      if (y - (ctx.surface[x] ?? 0) < WORLDGEN.caveMinDepth) continue;
      const i = y * width + x;
      if (!empty(i)) continue;
      if (isSolidId(fg[i + width] ?? AIR)) {
        const rule = pick(floor, random);
        if (rule) fg[i] = rule.id;
      } else if (isSolidId(fg[i - width] ?? AIR)) {
        const rule = pick(ceiling, random);
        if (!rule) continue;
        const length = 1 + Math.floor(random() * rule.chain);
        for (let k = 0; k < length && empty(i + k * width); k++) fg[i + k * width] = rule.id;
      }
    }
  }
}

/**
 * Step 7 (part) — small ruins: runestone pillars, some carved with runes and some joined by a
 * lintel, on flat ground away from the spawn and the giant trees. One stands on the glade.
 */
export function ruins(ctx: GenContext): void {
  const random = stepRandom(ctx, 72);
  const mid = Math.floor(ctx.width / 2);
  buildRuin(ctx, mid + RUINS.spawnRuinOffset, random);
  const biomes = new Set(RUINS.biomes.map((k) => SURFACE_BIOMES.findIndex((b) => b.key === k)));
  let left = Math.round((ctx.width / 1000) * RUINS.perThousandColumns);
  for (let n = 0; n < left * FLORA_CFG.ruinAttempts && left > 0; n++) {
    const x = Math.floor(random() * ctx.width);
    if (!biomes.has(ctx.surfaceBiome[x] ?? -1)) continue;
    if (Math.abs(x - mid) < WORLDGEN.spawnHalfWidth + FLORA_CFG.ruinClearance) continue;
    if (!flatAndClear(ctx, x)) continue;
    buildRuin(ctx, x, random);
    left--;
  }
}

/** Flat ground with no giant tree trunk nearby. */
function flatAndClear(ctx: GenContext, x: number): boolean {
  const ground = ctx.surface[x] ?? 0;
  const half = FLORA_CFG.ruinClearance;
  for (let dx = -half; dx <= half; dx++) {
    const s = ctx.surface[x + dx];
    if (s === undefined || Math.abs(s - ground) > 1) return false;
    for (let dy = 1; dy <= FLORA_CFG.trunkCheckHeight; dy++) {
      if (ctx.bg[(s - dy) * ctx.width + x + dx] === TRUNK) return false;
    }
  }
  return true;
}

function buildRuin(ctx: GenContext, x: number, random: Random): void {
  const { width, fg } = ctx;
  const pillars = between(random, RUINS.pillars);
  let px = x;
  let previous: { x: number; top: number } | null = null;
  for (let p = 0; p < pillars; p++) {
    const ground = ctx.surface[px] ?? 0;
    const h = between(random, RUINS.pillarHeight);
    for (let k = 1; k <= h; k++) {
      const i = (ground - k) * width + px;
      if (fg[i] !== AIR) break;
      fg[i] = random() < RUINS.runeChance ? RUIN_RUNE : RUIN_STONE;
    }
    const top = ground - h;
    if (previous && random() < RUINS.lintelChance) {
      const row = Math.max(top, previous.top) - 1;
      for (let lx = previous.x; lx <= px; lx++) {
        const i = row * width + lx;
        if (fg[i] === AIR) fg[i] = RUIN_STONE;
      }
    }
    previous = { x: px, top };
    px += between(random, RUINS.pillarSpacing);
  }
}

/**
 * Validation (part): later steps (settling silt and gravel, liquids) can leave a decoration
 * floating or under water; remove those so every decoration in a new world is supported.
 */
export function removeUnsupportedDecor(ctx: GenContext): void {
  const { width, height, fg, liquid } = ctx;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const support = DECOR_SUPPORT[fg[i] ?? AIR];
      if (!support) continue;
      const below = y + 1 < height ? (fg[i + width] ?? AIR) : AIR;
      const above = y > 0 ? (fg[i - width] ?? AIR) : AIR;
      const held =
        support === 'ground'
          ? ANCHOR[below] === 1
          : support === 'ceiling'
            ? ANCHOR[above] === 1 || DECOR_SUPPORT[above] === 'ceiling'
            : true;
      if (!held || (liquid[i] ?? 0) > 0) fg[i] = AIR;
    }
  }
}
