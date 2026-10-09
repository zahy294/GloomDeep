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
  return { 0: r[0], 1: r[1], 2: r[2], 3: r[3], B: bark[0], d: bark[1], h: bark[3] };
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

/** Frame order matches `icon` in src/data/items.ts. */
const ICONS: readonly { pattern: readonly string[]; ramp: RampName }[] = [
  { pattern: PICKAXE, ramp: 'bark' }, // elderwood pickaxe
  { pattern: PICKAXE, ramp: 'ember' }, // copper
  { pattern: PICKAXE, ramp: 'stone' }, // iron
  { pattern: PICKAXE, ramp: 'moonSilver' }, // moonsilver
  { pattern: BAR, ramp: 'ember' }, // copper bar
  { pattern: BAR, ramp: 'stone' }, // iron bar
  { pattern: BAR, ramp: 'moonSilver' }, // moonsilver bar
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
  ICONS.forEach(({ pattern, ramp }, frame) => {
    paint((x, y, c) => setPixel(out, frame * def.frameWidth + x, y, c), pattern, legend(ramp));
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
