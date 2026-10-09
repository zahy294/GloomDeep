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
    const colors = { ...legend(ramp), w: inside ? PALETTE[inside][2] : PALETTE[ramp][0] };
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

const STATIONS = {
  workbench: { pattern: WORKBENCH, ramp: 'bark' },
  furnace: { pattern: FURNACE, ramp: 'stone' },
  anvil: { pattern: ANVIL, ramp: 'moonSilver' },
} as const satisfies Record<string, { pattern: readonly string[]; ramp: RampName }>;

export type StationShape = keyof typeof STATIONS;

/** Draws a station tile into an atlas frame (raw RGBA buffer, as the tile atlas builder uses). */
export function drawStation(
  shape: StationShape,
  put: (x: number, y: number, color: number) => void,
): void {
  const { pattern, ramp } = STATIONS[shape];
  const ember = PALETTE.ember;
  const honey = PALETTE.honey;
  // The furnace mouth glows: e/E ember, y the hot core.
  paint(put, pattern, { ...legend(ramp), e: ember[1], E: ember[2], y: honey[3] });
}
