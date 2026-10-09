import { WORLDGEN } from '../../config';
import { SURFACE_BIOMES } from '../../data/biomes';
import { tileId } from '../../data/tiles';
import { SPAWN_TREE, TREE_SPECIES, treeSpecies, type TreeSpecies } from '../../data/trees';
import { hash2, valueNoise2 } from '../../sim/random';
import { AIR, isSolidId, noiseSeed, stepRandom, type GenContext } from './context';

interface SpeciesIds {
  def: TreeSpecies;
  trunk: number;
  leaves: number;
  branch: number;
  root: number;
  hanging: number;
}

const SPECIES = TREE_SPECIES.map((def): SpeciesIds => ({
  def,
  trunk: tileId(def.trunk),
  leaves: tileId(def.leaves),
  branch: tileId(def.branch),
  root: tileId(def.root),
  hanging: def.hanging ? tileId(def.hanging) : -1,
}));
const SPECIES_BY_BIOME = SURFACE_BIOMES.map((b) => SPECIES.filter((s) => s.def.biome === b.key));
const TREE = WORLDGEN.trees;
const SHAFT_ROW = 7;

type Random = () => number;
const between = (random: Random, [min, max]: readonly [number, number]) =>
  min + Math.floor(random() * (max - min + 1));

/**
 * Step 7 (part) — giant ancient trees: one at the edge of the starting glade, then one per site
 * every `spacing` columns where the biome's species grows and the ground is flat and dry.
 */
export function giantTrees(ctx: GenContext): void {
  const random = stepRandom(ctx, 71);
  const gapSeed = noiseSeed(ctx, 71);
  const spawnTreeX = Math.floor(ctx.width / 2) + SPAWN_TREE.offset;
  const spawnSpecies = SPECIES.find((s) => s.def.key === treeSpecies(SPAWN_TREE.species).key);
  if (spawnSpecies) buildTree(ctx, spawnSpecies, spawnTreeX, random, gapSeed);

  let x = TREE.edgeMargin;
  while (x < ctx.width - TREE.edgeMargin) {
    const options = SPECIES_BY_BIOME[ctx.surfaceBiome[x] ?? 0] ?? [];
    const species = options[Math.floor(random() * options.length)];
    if (!species) {
      x += TREE.emptySiteStep;
      continue;
    }
    const nearSpawnTree = Math.abs(x - spawnTreeX) < species.def.spacing[0];
    const nearSpawn = Math.abs(x - ctx.width / 2) < WORLDGEN.spawnHalfWidth;
    if (!nearSpawnTree && !nearSpawn && random() < species.def.chance && siteOk(ctx, x)) {
      buildTree(ctx, species, x, random, gapSeed);
    }
    x += between(random, species.def.spacing);
  }
}

/** Flat, dry ground around the trunk. */
function siteOk(ctx: GenContext, x: number): boolean {
  const ground = ctx.surface[x] ?? 0;
  for (let dx = -TREE.siteHalfWidth; dx <= TREE.siteHalfWidth; dx++) {
    const s = ctx.surface[x + dx];
    if (s === undefined || Math.abs(s - ground) > TREE.maxSlope) return false;
    if ((ctx.liquid[(s - 1) * ctx.width + x + dx] ?? 0) > 0) return false;
  }
  return true;
}

function buildTree(
  ctx: GenContext,
  s: SpeciesIds,
  x: number,
  random: Random,
  gapSeed: number,
): void {
  const { def } = s;
  const ground = ctx.surface[x] ?? 0;
  const baseWidth = between(random, def.trunkWidth);
  const height = between(random, def.height);
  const top = ground - height;
  if (top - def.canopy.radiusY[1] < TREE.skyMargin) return; // no room under the world's top

  // Trunk: living-wood background wall, narrowing towards the top, down into the ground a little.
  for (let y = top; y < ground + TREE.trunkFooting; y++) {
    const t = Math.min(1, (ground - y) / height);
    const w = Math.max(TREE.minTrunkWidth, Math.round(baseWidth * (1 - (1 - def.taper) * t)));
    const x0 = x - Math.floor(w / 2);
    for (let tx = x0; tx < x0 + w; tx++) setBg(ctx, tx, y, s.trunk);
  }

  roots(ctx, s, x, ground, baseWidth, random);
  const branchCount = between(random, def.branches.count);
  const firstSide = random() < 0.5 ? -1 : 1;
  for (let b = 0; b < branchCount; b++) {
    const side = b % 2 === 0 ? firstSide : -firstSide;
    const along =
      def.branches.from + ((def.branches.to - def.branches.from) * (b + 0.5)) / branchCount;
    const y = Math.round(ground - height * along);
    const t = Math.min(1, (ground - y) / height);
    const halfTrunk = Math.max(1, (baseWidth * (1 - (1 - def.taper) * t)) / 2);
    branch(ctx, s, x, y, side, halfTrunk, random, gapSeed);
  }
  canopy(ctx, s, x, top, random, gapSeed);
}

/** A one-way branch growing out of the trunk, rising gently, ending in a leaf clump. */
function branch(
  ctx: GenContext,
  s: SpeciesIds,
  x: number,
  y: number,
  side: number,
  halfTrunk: number,
  random: Random,
  gapSeed: number,
): void {
  const length = between(random, s.def.branches.length);
  let bx = x + side * Math.ceil(halfTrunk);
  let by = y;
  for (let i = 0; i < length; i++) {
    setFg(ctx, bx, by, s.branch);
    bx += side;
    if (i > 0 && i % TREE.branchRiseEvery === 0) by--;
  }
  blob(ctx, s, bx, by - 1, s.def.branches.clump, s.def.branches.clump * 0.7, gapSeed, 0);
  hangBelow(ctx, s, bx - s.def.branches.clump, bx + s.def.branches.clump, by, random);
}

/** The crown: a lumpy ellipse of leaves with noise gaps, plus willow curtains. */
function canopy(
  ctx: GenContext,
  s: SpeciesIds,
  x: number,
  top: number,
  random: Random,
  gapSeed: number,
): void {
  const c = s.def.canopy;
  const rx = between(random, c.radiusX);
  const ry = between(random, c.radiusY);
  blob(ctx, s, x, top, rx, ry, gapSeed, c.gaps);
  for (let i = 0; i < c.lumps; i++) {
    const angle = random() * Math.PI * 2;
    const lx = Math.round(x + Math.cos(angle) * rx * TREE.lumpReach);
    const ly = Math.round(top + Math.sin(angle) * ry * TREE.lumpReach);
    const scale = TREE.lumpMinScale + random() * (1 - TREE.lumpMinScale);
    blob(ctx, s, lx, ly, rx * scale * TREE.lumpSize, ry * scale * TREE.lumpSize, gapSeed, c.gaps);
  }
  // Willow curtains: strands of leaves hanging from the canopy's underside.
  if (c.droop > 0) {
    for (let cx = x - rx; cx <= x + rx; cx++) {
      if (random() > TREE.droopDensity || isShaft(s, cx, gapSeed)) continue;
      let y = top;
      while (y < ctx.height && ctx.fg[y * ctx.width + cx] === s.leaves) y++;
      const strand = Math.round(c.droop * (TREE.droopMin + random() * (1 - TREE.droopMin)));
      for (let k = 0; k < strand; k++) if (!setFg(ctx, cx, y + k, s.leaves)) break;
    }
  }
  hangBelow(ctx, s, x - rx, x + rx, top, random);
}

/** Columns left open through every leaf of the tree, so sunlight reaches the ground there. */
function isShaft(s: SpeciesIds, x: number, gapSeed: number): boolean {
  return hash2(x, SHAFT_ROW, gapSeed) < s.def.canopy.shafts;
}

/** Fills an ellipse of air with leaves, leaving noise gaps (`gaps` = fraction left open). */
function blob(
  ctx: GenContext,
  s: SpeciesIds,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  gapSeed: number,
  gaps: number,
): void {
  const size = s.def.canopy.gapSize;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy > 1 || isShaft(s, x, gapSeed)) continue;
      if (gaps > 0 && valueNoise2(x / size, y / size, gapSeed) < gaps) continue;
      setFg(ctx, x, y, s.leaves);
    }
  }
}

/** Vines or moss hanging from leaf undersides between columns x0..x1 (scanning from row y). */
function hangBelow(
  ctx: GenContext,
  s: SpeciesIds,
  x0: number,
  x1: number,
  fromY: number,
  random: Random,
): void {
  if (s.hanging < 0) return;
  for (let x = Math.max(0, x0); x <= Math.min(ctx.width - 1, x1); x++) {
    if (random() > TREE.hangingDensity) continue;
    // Find the canopy's underside in this column.
    let y = fromY;
    while (y < ctx.height && ctx.fg[y * ctx.width + x] !== s.leaves) y++;
    while (y < ctx.height && ctx.fg[y * ctx.width + x] === s.leaves) y++;
    if (y >= ctx.height || ctx.fg[(y - 1) * ctx.width + x] !== s.leaves) continue;
    const length = 1 + Math.floor(random() * TREE.hangingMaxLength);
    for (let k = 0; k < length; k++) if (!setFg(ctx, x, y + k, s.hanging)) break;
  }
}

/**
 * Roots: low flares beside the trunk (one tile above the ground, so walking climbs them) that
 * dive into the soil and wander down and outward, replacing what they pass through.
 */
function roots(
  ctx: GenContext,
  s: SpeciesIds,
  x: number,
  ground: number,
  baseWidth: number,
  random: Random,
): void {
  for (const side of [-1, 1]) {
    const count = between(random, s.def.roots.perSide);
    for (let r = 0; r < count; r++) {
      let rx = x + side * Math.ceil(baseWidth / 2);
      let ry = ground - (r === 0 ? 1 : 0); // the first root flares above the ground
      const length = between(random, s.def.roots.length);
      for (let i = 0; i < length; i++) {
        if (ry < ground) {
          setFg(ctx, rx, ry, s.root);
          ctx.surface[rx] = Math.min(ctx.surface[rx] ?? ry, ry);
        } else {
          replaceSolid(ctx, rx, ry, s.root);
        }
        if (random() < TREE.rootOutward) rx += side;
        else ry++;
      }
    }
  }
}

function setFg(ctx: GenContext, x: number, y: number, id: number): boolean {
  if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) return false;
  const i = y * ctx.width + x;
  if (ctx.fg[i] !== AIR || (ctx.liquid[i] ?? 0) > 0) return false;
  ctx.fg[i] = id;
  return true;
}

function replaceSolid(ctx: GenContext, x: number, y: number, id: number): void {
  if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) return;
  const i = y * ctx.width + x;
  if (isSolidId(ctx.fg[i] ?? AIR)) ctx.fg[i] = id;
}

function setBg(ctx: GenContext, x: number, y: number, id: number): void {
  if (x < 0 || y < 0 || x >= ctx.width || y >= ctx.height) return;
  ctx.bg[y * ctx.width + x] = id;
}
