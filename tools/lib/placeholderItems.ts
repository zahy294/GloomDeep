/**
 * Placeholder item icons and crafting-station tiles (M6), drawn from small pixel patterns in
 * palette colours: dark outline from the object's own ramp, light from the top-left (plan 2.9.1).
 * Real art replaces them through the manifest (`items` sprite sheet; station tiles in the tile
 * atlas).
 */
import { ITEMS } from '../../src/data/items';
import { PALETTE, type RampName } from '../../src/data/palette';
import { spriteAsset } from '../../src/data/spriteAssets';
import { createImage, setPixel, type RgbaImage } from './image';

const SIZE = 16;

/**
 * Pattern characters: '.' transparent; '0'–'3' the item's main ramp, dark → light;
 * 'B', 'd', 'h' bark outline, dark and light (handles, wood).
 */
type Legend = Record<string, number>;

function legend(ramp: RampName): Legend {
  const r = PALETTE[ramp];
  const bark = PALETTE.bark;
  const brass = PALETTE.gold;
  return {
    0: r[0],
    1: r[1],
    2: r[2],
    3: r[3],
    B: bark[0],
    d: bark[1],
    h: bark[3],
    r: brass[0],
    R: brass[2],
    // Iron: lamp posts, pulleys (tealShadow, dark → light).
    O: PALETTE.tealShadow[0],
    I: PALETTE.tealShadow[1],
    i: PALETTE.tealShadow[2],
  };
}

/** Paints a pattern of up to 16×16 characters; extra legend keys override the defaults. */
function paint(
  put: (x: number, y: number, color: number) => void,
  rows: readonly string[],
  colors: Legend,
): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < Math.min(SIZE, row.length); x++) {
      const ch = row[x] ?? '.';
      if (ch === '.') continue;
      const color = colors[ch];
      if (color === undefined) throw new Error(`Unknown pattern character "${ch}"`);
      put(x, y, color);
    }
  });
}

const PICKAXE = [
  '................',
  '......00000.....',
  '....0022223000..',
  '...021100011320.',
  '..0210..Bhd.0120',
  '..010..Bhd...010',
  '..00..Bhd.....00',
  '......Bhd.......',
  '.....Bhd........',
  '....Bhd.........',
  '...Bhd..........',
  '..Bhd...........',
  '.Bhd............',
  '.BB.............',
];

const BAR = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....00000000...',
  '....0333333320..',
  '...033222222210.',
  '..0322222222110.',
  '..0111111111100.',
  '..00000000000...',
];

/** A lens: a round coloured glass (0–3) in a brass rim (r/R). */
const LENS = [
  '................',
  '................',
  '.....rrrrrr.....',
  '....rR3322Rr....',
  '...rR332221Rr...',
  '...rR322211Rr...',
  '...rR222110Rr...',
  '...rR221100Rr...',
  '....rR1100Rr....',
  '.....rrrrrr.....',
  '................',
];

/** A flare: a stubby stick with a bright red-gold head. */
const FLARE_ICON = [
  '................',
  '................',
  '..........0000..',
  '.........033320.',
  '.........032220.',
  '........B0322100',
  '.......Bhd01100.',
  '......Bhd.000...',
  '.....Bhd........',
  '....Bhd.........',
  '...Bhd..........',
  '...BB...........',
];

/** A sword: blade (0–3) up to the top-right, crossguard and grip in bark. */
const SWORD = [
  '.............00.',
  '............0330',
  '...........03320',
  '..........03320.',
  '.........03320..',
  '........03320...',
  '.......03320....',
  '..B...03320.....',
  '..BhB03320......',
  '...BhB320.......',
  '....BhB0........',
  '...BhdhB........',
  '..Bhd.BB........',
  '.Bhd............',
  '.BB.............',
];

/** A bow: a bent wooden limb (bark) with a pale string. */
const BOW = [
  '........BBB.....',
  '..........BhB...',
  '...........BhB..',
  '........3...Bh..',
  '.......3.....Bh.',
  '......3......Bh.',
  '.....3.......Bh.',
  '....3........Bh.',
  '...3.........Bh.',
  '..3.........Bh..',
  '.3.........BhB..',
  '3.......BBBB....',
];

/** An arrow: shaft from the bottom-left, a stone head at the top-right, fletching. */
const ARROW = [
  '............000.',
  '...........0330.',
  '...........0320.',
  '..........Bh00..',
  '.........Bh.....',
  '........Bh......',
  '.......Bh.......',
  '......Bh........',
  '.....Bh.........',
  '..33Bh..........',
  '..3Bh...........',
  '...3............',
];

/** A staff: a long shaft with a glowing crystal at its head. */
const STAFF = [
  '...........00...',
  '..........0330..',
  '.........033320.',
  '.........032220.',
  '..........0220..',
  '.........BhB0...',
  '........Bhd.....',
  '.......Bhd......',
  '......Bhd.......',
  '.....Bhd........',
  '....Bhd.........',
  '...Bhd..........',
  '..Bhd...........',
  '..BB............',
];

/** A bucket (iron, 0–3) with a handle; 'w' marks the liquid inside (drawn per bucket kind). */
const BUCKET = [
  '................',
  '.....000000.....',
  '....0......0....',
  '...0........0...',
  '..000000000000..',
  '..0wwwwwwwwww0..',
  '..03wwwwwwww20..',
  '...03222222210..',
  '...03222222110..',
  '....032222110...',
  '....032221110...',
  '....001111100...',
  '.....0000000....',
];

/** A glass jar with a cork, fireflies glowing inside (y). */
const JAR = [
  '................',
  '................',
  '......BBBB......',
  '......Bhdd......',
  '.....000000.....',
  '....03333330....',
  '....03.y..30....',
  '....03..y.30....',
  '....03y...30....',
  '....03..y.30....',
  '....03.y.y30....',
  '....02222220....',
  '.....000000.....',
  '................',
  '................',
  '................',
];

/** A Lumen petal: a curved glowing petal. */
const LUMEN_PETAL = [
  '................',
  '................',
  '..........000...',
  '........00330...',
  '......0033320...',
  '.....03333220...',
  '....033322220...',
  '...033222210....',
  '...03222210.....',
  '..0322210.......',
  '..022110........',
  '..00000.........',
];

/** A stack of glowing coins (gold ramp), with sparkles (y). */
const GLIMMER = [
  '................',
  '..........y.....',
  '.....00000......',
  '....0333320.....',
  '....0322210.....',
  '....0211110.....',
  '....0222210.....',
  '....0011100.....',
  '....0222210.....',
  '....0011100.....',
  '.....00000......',
  '.y..............',
];

/** A locket on a chain (moonSilver ramp) with a small gold clasp. */
const LOCKET = [
  '................',
  '....3......3....',
  '.....3....3.....',
  '......3..3......',
  '.......33.......',
  '.....000000.....',
  '....03333320....',
  '....03222210....',
  '....0322rR10....',
  '....02222110....',
  '....01221110....',
  '.....011110.....',
  '......0000......',
];

/** Frame order matches `icon` in src/data/items.ts. */
const ICONS: readonly { pattern: readonly string[]; ramp: RampName; inside?: RampName | null }[] = [
  { pattern: PICKAXE, ramp: 'bark' }, // elderwood pickaxe
  { pattern: PICKAXE, ramp: 'ember' }, // copper
  { pattern: PICKAXE, ramp: 'stone' }, // iron
  { pattern: PICKAXE, ramp: 'moonSilver' }, // moonsilver
  { pattern: BAR, ramp: 'ember' }, // copper bar
  { pattern: BAR, ramp: 'stone' }, // iron bar
  { pattern: BAR, ramp: 'moonSilver' }, // moonsilver bar
  { pattern: BAR, ramp: 'gold' }, // gold bar
  { pattern: LENS, ramp: 'cyan' }, // azure lens
  { pattern: LENS, ramp: 'rose' }, // crimson lens
  { pattern: LENS, ramp: 'leaf' }, // verdant lens
  { pattern: FLARE_ICON, ramp: 'ember' }, // flare
  { pattern: SWORD, ramp: 'bark' }, // elderwood sword
  { pattern: SWORD, ramp: 'ember' }, // copper sword
  { pattern: SWORD, ramp: 'stone' }, // iron sword
  { pattern: BOW, ramp: 'moonSilver' }, // elderwood bow (string colour)
  { pattern: ARROW, ramp: 'stone' }, // wooden arrow
  { pattern: STAFF, ramp: 'cyan' }, // lumen staff
  { pattern: BUCKET, ramp: 'stone', inside: null }, // bucket
  { pattern: BUCKET, ramp: 'stone', inside: 'cyan' }, // water bucket
  { pattern: BUCKET, ramp: 'stone', inside: 'ember' }, // lava bucket
  { pattern: JAR, ramp: 'moonSilver', inside: null }, // glass jar (empty)
  { pattern: LUMEN_PETAL, ramp: 'cyan' }, // lumen petal
  { pattern: GLIMMER, ramp: 'gold' }, // glimmer
  { pattern: LOCKET, ramp: 'moonSilver' }, // lost locket
];

/** The `items` placeholder sheet: one row of 16×16 icons. */
export function buildItemIcons(): RgbaImage {
  const def = spriteAsset('items');
  if (!def) throw new Error('items is missing from SPRITE_ASSETS');
  const used = Math.max(...ITEMS.map((i) => i.icon ?? -1)) + 1;
  if (used > ICONS.length || def.frames < used) {
    throw new Error(`items.ts uses ${used} icon frames; the placeholder draws ${ICONS.length}`);
  }
  const out = createImage(def.frameWidth * def.frames, def.frameHeight);
  ICONS.forEach(({ pattern, ramp, inside }, frame) => {
    // 'w' is the bucket's contents: liquid, or the dark inside of an empty bucket.
    const colors = {
      ...legend(ramp),
      w: inside ? PALETTE[inside][2] : PALETTE[ramp][0],
      y: PALETTE.honey[3], // fireflies in a jar
    };
    paint((x, y, c) => setPixel(out, frame * def.frameWidth + x, y, c), pattern, colors);
  });
  return out;
}

const WORKBENCH = [
  '................',
  '................',
  '................',
  '................',
  '................',
  'BBBBBBBBBBBBBBBB',
  'BhhhhhhhhhhhhhhB',
  'BddddddddddddddB',
  'BBBBBBBBBBBBBBBB',
  '.Bhd........Bhd.',
  '.Bhd........Bhd.',
  '.Bhd........Bhd.',
  '.Bhd........Bhd.',
  '.Bhd........Bhd.',
  '.Bhd........Bhd.',
  '.BBB........BBB.',
];

const FURNACE = [
  '.....000000.....',
  '.....023320.....',
  '..000023320000..',
  '..023333333320..',
  '..032222222210..',
  '..022222222210..',
  '..022000002210..',
  '..0220eEe02210..',
  '..020eEyEe0210..',
  '..020EyyyE0210..',
  '..020eEyEe0210..',
  '..022000002210..',
  '..022222222210..',
  '..011111111110..',
  '..011111111110..',
  '..000000000000..',
];

const ANVIL = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '0000000000000...',
  '03333333333320..',
  '.0222222222210..',
  '..00012221000...',
  '....0122210.....',
  '....0122210.....',
  '...011222110....',
  '..01111111110...',
  '..00000000000...',
  '................',
  '................',
];

/** One cell of a 3-tall wooden door: planks with a frame and a brass handle. */
const DOOR = [
  'BBBBBBBBBBBBBBBB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhRhB',
  'BhhdhhhdhhhdhRhB',
  'BhhdhhhdhhhdhhhB',
  'BBBBBBBBBBBBBBBB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BhhdhhhdhhhdhhhB',
  'BBBBBBBBBBBBBBBB',
];

/** A beacon: a runestone plinth holding a large glowing crystal. */
const BEACON = [
  '.......00.......',
  '......0330......',
  '.....033320.....',
  '.....033220.....',
  '.....032220.....',
  '......0220......',
  '.......00.......',
  '.....SSSSSS.....',
  '......SssS......',
  '......SssS......',
  '......SssS......',
  '......SssS......',
  '.....SSssSS.....',
  '....SSssssSS....',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
];

/** A street lamp: iron post under a lantern head. Glass is rows 3-5 in the tile's own ramp. */
const LAMP = [
  '.....OOOOOO.....',
  '....OiiiiiIO....',
  '....OIIIIIIO....',
  '....I332221I....',
  '....I322221I....',
  '....I222211I....',
  '....OIIIIIIO....',
  '.....OOOOOO.....',
  '.......iIO......',
  '.......iIO......',
  '.......iIO......',
  '.......iIO......',
  '.......iIO......',
  '......iIIIO.....',
  '.....OIIIIIO....',
  '....OOOOOOOOO...',
];

/** The dimmed lamp: only the lower half of the glass still burns, the upper rows are dark. */
const LAMP_DIM = LAMP.map((row, y) => (y === 3 || y === 4 ? row.replace(/[123]/g, '0') : row));

/** A lift: a pulley wheel at the top, a rope, and a wooden basket hanging from it. */
const LIFT = [
  '......OOOO......',
  '.....OiIIIO.....',
  '.....OIOOIO.....',
  '.....OiIIIO.....',
  '......OOOO......',
  '.......hd.......',
  '.......hd.......',
  '......h..d......',
  '.....h....d.....',
  '...BBBBBBBBBB...',
  '...BhhdhhdhhB...',
  '...BdhhdhhdhB...',
  '...BhhdhhdhhB...',
  '...BddddddddB...',
  '....BBBBBBBB....',
  '................',
];

/** A dormant beacon: the runestone plinth under a dark, cracked crystal (ramp passed in: gloam). */
const BEACON_DORMANT = [
  '.......00.......',
  '......0220......',
  '.....022120.....',
  '.....02.020.....',
  '.....021020.....',
  '......0120......',
  '.......00.......',
  '.....SSSSSS.....',
  '......SssS......',
  '......SssS......',
  '......SssS......',
  '......SssS......',
  '.....SSssSS.....',
  '....SSssssSS....',
  '...SSSSSSSSSS...',
  '...SSSSSSSSSS...',
];

/** A small hanging lantern: chain from the top edge, bark frame, warm glass. */
const HANGING_LANTERN = [
  '.......rr.......',
  '.......r........',
  '.......rr.......',
  '.......r........',
  '......BBBB......',
  '.....BhhhhB.....',
  '....B3322Bd.....',
  '....B3222Bd.....',
  '....B2221Bd.....',
  '....B2211Bd.....',
  '.....BddddB.....',
  '......BBBB......',
  '................',
  '................',
  '................',
  '................',
];

/** A moth lure (M12): a glowcap and two petals on a stake; ramp passed in: rose. */
const LURE = [
  '................',
  '.......00.......',
  '......0330......',
  '.....033320.....',
  '....0332y220....',
  '.....0222210....',
  '..00..0110..00..',
  '.0330..BB..0330.',
  '.0320..Bd..0220.',
  '..00...Bd...00..',
  '.......Bd.......',
  '.......Bd.......',
  '.......Bd.......',
  '.......Bd.......',
  '......BBdd......',
  '.....BBBBdd.....',
];

/** A sluice lever: wooden post, brass pivot, handle up (closed) or down (open). */
const LEVER_BASE = [
  '.....BBBBB......',
  '.....BhhdB......',
  '.....BhRdB',
  '.....BhhdB',
  '.....BhdBB',
  '.....BhddB',
  '....BBBBBBB.....',
  '...BBhhhhddB....',
  '...BBBBBBBBB....',
];
const LEVER = [
  '................',
  '............RR..',
  '............RR..',
  '...........r....',
  '..........r.....',
  '.........r......',
  '........r.......',
  ...LEVER_BASE.map((row) => row.padEnd(16, '.')),
];
const LEVER_OPEN = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....BBBBB......',
  '.....BhhdB......',
  '.....BhRdBr.....',
  '.....BhhdB.r....',
  '.....BhdBB..RR..',
  '.....BhddB..RR..',
  '....BBBBBBB.....',
  '...BBhhhhddB....',
  '...BBBBBBBBB....',
];

/** A brazier: iron bowl on a stand; flames in the tile's ramp (ember lit), `y` the hot core. */
const BRAZIER_BOWL = [
  '...OiiiiiiiiO...',
  '...OIIIIIIIIO...',
  '....OIIIIIIO....',
  '.....OOIIOO.....',
  '.......IO.......',
  '.......IO.......',
  '......iIIO......',
  '....OOOOOOOO....',
];
const BRAZIER = [
  '................',
  '................',
  '.......3........',
  '......323.......',
  '.....33232......',
  '....3322212.....',
  '....32yy2210....',
  '.....2yy21......',
  ...BRAZIER_BOWL,
];
/** Burnt out: only a low mound of ash (the tile's stone ramp) in the bowl. */
const BRAZIER_OUT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....01122110....',
  ...BRAZIER_BOWL,
];

/** A diagonal crystal mirror. `slash` is "/" (low left, high right); a clear white spine runs along it. */
function prism(slash: boolean): string[] {
  return Array.from({ length: 16 }, (_, y) => {
    const c = slash ? 15 - y : y;
    return Array.from({ length: 16 }, (_, x) => {
      const d = Math.abs(x - c);
      return d === 0 ? 'W' : d === 1 ? '3' : d === 2 ? '1' : d === 3 ? '0' : '.';
    }).join('');
  });
}

/** A heart node: a gnarled root cup holding an orb (dark when dormant, gold when lit, per ramp). */
const NODE = [
  '................',
  '................',
  '.......00.......',
  '......0330......',
  '.....033220.....',
  '.....032221.....',
  '.....022211.....',
  '......0110......',
  '.B..BBBBBBBB..B.',
  '.Bd.BhdddddB.dB.',
  '..Bd.BhddddB.B..',
  '...BdBhddddBd...',
  '....BBdddddB....',
  '.....BdBBdB.....',
  '....BB.BB.BB....',
  '...BBB.BB.BBB...',
];

const STATIONS = {
  lure: { pattern: LURE, ramp: 'rose' },
  lever: { pattern: LEVER, ramp: 'bark' },
  lever_open: { pattern: LEVER_OPEN, ramp: 'bark' },
  brazier: { pattern: BRAZIER, ramp: 'ember' },
  brazier_out: { pattern: BRAZIER_OUT, ramp: 'stone' },
  prism_left: { pattern: prism(true), ramp: 'cyan' },
  prism_right: { pattern: prism(false), ramp: 'cyan' },
  node: { pattern: NODE, ramp: 'gloam' },
  workbench: { pattern: WORKBENCH, ramp: 'bark' },
  furnace: { pattern: FURNACE, ramp: 'stone' },
  anvil: { pattern: ANVIL, ramp: 'moonSilver' },
  door: { pattern: DOOR, ramp: 'bark' },
  jar: { pattern: JAR, ramp: 'moonSilver' },
  beacon: { pattern: BEACON, ramp: 'cyan' },
  lamp: { pattern: LAMP, ramp: 'gold' },
  lamp_dim: { pattern: LAMP_DIM, ramp: 'gold' },
  lift: { pattern: LIFT, ramp: 'bark' },
  beacon_dormant: { pattern: BEACON_DORMANT, ramp: 'gloam' },
  hanging_lantern: { pattern: HANGING_LANTERN, ramp: 'honey' },
} as const satisfies Record<string, { pattern: readonly string[]; ramp: RampName }>;

export type StationShape = keyof typeof STATIONS;

/**
 * Draws a station tile into an atlas frame (raw RGBA buffer, as the tile atlas builder uses).
 * `ramp` overrides the shape's default ramp (a lamp's glass takes the tile's own ramp).
 */
export function drawStation(
  shape: StationShape,
  put: (x: number, y: number, color: number) => void,
  ramp: RampName = STATIONS[shape].ramp,
): void {
  const { pattern } = STATIONS[shape];
  const ember = PALETTE.ember;
  const honey = PALETTE.honey;
  // The furnace mouth glows: e/E ember, y the hot core.
  const stone = PALETTE.moonSilver;
  paint(put, pattern, {
    ...legend(ramp),
    e: ember[1],
    E: ember[2],
    y: honey[3],
    R: PALETTE.gold[3],
    S: stone[0],
    s: stone[2],
    W: stone[3],
  });
}
