/**
 * Code sketches that bootstrapped the M11 prefabs (tools/lib/prefabBuilder.ts). The JSON maps
 * they produced in src/data/prefabs/ are what the game loads and what you edit in Tiled.
 */
import { PrefabCanvas } from './prefabBuilder';

/** A one-room plank cottage, lit, door on the right: a valid village home (M10 debug village). */
export function cottage(): PrefabCanvas {
  const c = new PrefabCanvas(10, 7);
  c.props.foundation = 'forest_soil';
  c.house({ x0: 0, x1: 9, roofY: 0, floorY: 6, ownFloor: true, doors: ['right'] });
  // The M10 cottage had its torch one cell in from the wall.
  c.set('fg', 2, 2, 'torch');
  return c;
}

/**
 * Canopyhold (plan 1.7): a trading town in and around a giant tree. Three levels — the market
 * street on the ground, a deck of homes around the trunk, an upper deck with a lookout — joined
 * by branch steps (players), a lift basket (folk and players) and a rope bridge to a second tree.
 */
export function canopyhold(): PrefabCanvas {
  const W = 112;
  const H = 58;
  const G = 48; // ground row (grass), sits on the world's ground row
  const c = new PrefabCanvas(W, H);
  c.props.foundation = 'forest_soil';
  c.props.groundRow = G;

  // Ground: grass over soil.
  c.fill('fg', 0, G, W - 1, G, 'elderglade_grass');
  c.fill('fg', 0, G + 1, W - 1, H - 1, 'forest_soil');
  c.fill('bg', 0, G + 1, W - 1, H - 1, 'forest_soil');

  // The great tree and the east tree: trunks as back walls, canopies of leaves.
  c.fill('bg', 50, 6, 61, G, 'living_wood');
  c.fill('bg', 93, 16, 98, G, 'living_wood');
  c.ellipse('fg', 56, 8, 34, 7, 'elder_leaves');
  c.ellipse('fg', 96, 15, 14, 5, 'elder_leaves');

  // Decks (one-way branches): mid around the trunk, upper above it, and the east tree's deck.
  const MID = 36;
  const UP = 24;
  c.fill('fg', 22, MID, 73, MID, 'branch');
  c.fill('fg', 74, MID, 84, MID, 'rope_bridge');
  c.fill('fg', 85, MID, 107, MID, 'branch');
  c.fill('fg', 38, UP, 72, UP, 'branch');

  // Branch steps for climbers: ground → mid, mid → upper (3 rows apart, a 4.5-tile jump).
  for (const [x, y] of [
    [44, 45],
    [47, 42],
    [44, 39],
    [49, 33],
    [52, 30],
    [49, 27],
  ] as const) {
    c.fill('fg', x, y, x + 2, y, 'branch');
  }

  // Ground buildings: the inn, the trader's shop, the lampwright's workshop, the caravan house.
  c.house({
    x0: 6,
    x1: 25,
    roofY: 41,
    floorY: G,
    ownFloor: false,
    doors: ['left', 'right'],
    light: 'hanging_lantern',
  });
  c.set('fg', 18, 43, 'hanging_lantern');
  c.house({ x0: 28, x1: 39, roofY: 42, floorY: G, ownFloor: false, doors: ['left', 'right'] });
  c.house({ x0: 72, x1: 83, roofY: 42, floorY: G, ownFloor: false, doors: ['left', 'right'] });

  // Mid-deck homes, and the east tree's homes past the rope bridge.
  const midHome = (x0: number, x1: number) =>
    c.house({ x0, x1, roofY: MID - 6, floorY: MID, ownFloor: true, doors: ['left', 'right'] });
  midHome(24, 33); // merchant
  midHome(34, 43); // lampwright
  midHome(64, 73); // Pip's family
  midHome(86, 95); // ropewright
  midHome(97, 106); // weaver
  // Upper-deck homes.
  const upHome = (x0: number, x1: number) =>
    c.house({ x0, x1, roofY: UP - 6, floorY: UP, ownFloor: true, doors: ['left', 'right'] });
  upHome(38, 47); // caravan master
  upHome(63, 72); // courier

  // Lift baskets beside the trunk: ground, mid deck, upper deck.
  const LIFT_X = 62;
  for (const [level, y] of [
    [0, G - 1],
    [1, MID - 1],
    [2, UP - 1],
  ] as const) {
    c.set('fg', LIFT_X, y, 'lift_post');
    c.point('lift', `lift_${level}`, LIFT_X, y, { line: 'trunk', level });
  }

  // Street lamps (fuelled; the TownSystem dims them) and lanterns hung among the leaves.
  for (const x of [3, 27, 42, 49, 56, 66, 70, 85, 104, 109]) c.set('fg', x, G - 1, 'street_lamp');
  for (const x of [48, 58, 78, 85]) c.set('fg', x, MID - 1, 'street_lamp');
  for (const x of [52, 59]) c.set('fg', x, UP - 1, 'street_lamp');
  for (const [x, y] of [
    [40, 10],
    [56, 13],
    [72, 10],
    [54, MID + 1],
    [68, MID + 1],
    [79, MID + 1],
    [55, UP + 1],
    [95, 19],
  ] as const) {
    c.set('fg', x, y, 'hanging_lantern');
  }

  // Waypoints. Ground (feet row G-1).
  const g = G - 1;
  c.waypoint('gate_w', 1, g, 'gate:west')
    .waypoint('inn_home', 9, g, 'home:innkeeper')
    .waypoint('inn_a', 14, g, 'inn')
    .waypoint('inn_b', 20, g, 'inn')
    .waypoint('street_w', 27, g, 'street')
    .waypoint('shop_merchant', 33, g, 'shop:merchant')
    .waypoint('plaza_a', 45, g, 'plaza')
    .waypoint('plaza_b', 52, g, 'plaza')
    .waypoint('plaza_c', 58, g, 'plaza')
    .waypoint('lift_g', LIFT_X, g, 'lift')
    .waypoint('plaza_d', 67, g, 'plaza')
    .waypoint('shop_lampwright', 78, g, 'shop:lampwright')
    .waypoint('street_e', 86, g, 'street')
    .waypoint('yard_a', 91, g, 'yard')
    .waypoint('yard_b', 100, g, 'yard')
    .waypoint('gate_e', 110, g, 'gate:east')
    .chain([
      'gate_w',
      'inn_home',
      'inn_a',
      'inn_b',
      'street_w',
      'shop_merchant',
      'plaza_a',
      'plaza_b',
      'plaza_c',
      'lift_g',
      'plaza_d',
      'shop_lampwright',
      'street_e',
      'yard_a',
      'yard_b',
      'gate_e',
    ]);
  // Mid deck (feet row MID-1).
  const m = MID - 1;
  c.waypoint('home_merchant', 28, m, 'home:merchant')
    .waypoint('home_lampwright', 38, m, 'home:lampwright')
    .waypoint('deck_w', 48, m, 'deck')
    .waypoint('lift_m', LIFT_X, m, 'lift')
    .waypoint('home_child', 68, m, 'home:child')
    .waypoint('bridge', 79, m, 'bridge')
    .waypoint('deck_e', 96, m, 'deck')
    .waypoint('home_ropewright', 90, m, 'home:ropewright')
    .waypoint('home_weaver', 101, m, 'home:weaver')
    .chain([
      'home_merchant',
      'home_lampwright',
      'deck_w',
      'lift_m',
      'home_child',
      'bridge',
      'home_ropewright',
      'deck_e',
      'home_weaver',
    ]);
  // Upper deck (feet row UP-1).
  const u = UP - 1;
  c.waypoint('home_caravaneer', 42, u, 'home:caravaneer')
    .waypoint('lookout_a', 52, u, 'lookout')
    .waypoint('lookout_b', 57, u, 'lookout')
    .waypoint('lift_u', LIFT_X, u, 'lift')
    .waypoint('home_courier', 67, u, 'home:courier')
    .chain(['home_caravaneer', 'lookout_a', 'lookout_b', 'lift_u', 'home_courier']);
  // The lift joins the levels.
  c.chain(['lift_g', 'lift_m', 'lift_u']);
  return c;
}

/**
 * The Rootdeep Citadel (plan 1.7): a city carved into the World Tree's roots, lost to the Gloam.
 * Three districts side by side, each with a dormant beacon on its street; gates in the outer wall
 * at both ends of the street.
 */
export function citadel(): PrefabCanvas {
  const W = 150;
  const H = 44;
  const FLOOR = 40; // street floor row; the street's feet row is FLOOR - 1
  const c = new PrefabCanvas(W, H);
  c.props.foundation = 'carved_brick';

  // Shell: bricks all round, carved stone behind everything inside.
  c.fill('fg', 0, 0, W - 1, H - 1, 'carved_brick');
  c.fill('bg', 0, 0, W - 1, H - 1, 'carved_brick');
  c.fill('fg', 2, 4, W - 3, FLOOR - 1, '');
  // Root beams across the ceiling and pillars between the districts (open at street level).
  for (const x of [50, 100]) {
    c.fill('fg', x - 1, 4, x, FLOOR - 7, 'carved_brick');
    c.fill('fg', x - 1, FLOOR - 7, x, FLOOR - 7, 'carved_runestone');
  }
  c.fill('bg', 2, 4, W - 3, 6, 'rootwood');
  // Gates: openings through the outer wall at the street's ends (tunnels meet them).
  c.fill('fg', 0, FLOOR - 4, 1, FLOOR - 1, '');
  c.fill('fg', W - 2, FLOOR - 4, W - 1, FLOOR - 1, '');

  // A gallery (one-way stone ledges) along each district, reached by steps.
  const GALLERY = 28;
  const districts = [
    { key: 'gate_ward', x0: 2, x1: 48 },
    { key: 'lantern_market', x0: 51, x1: 98 },
    { key: 'high_hall', x0: 101, x1: 147 },
  ] as const;
  for (const d of districts) {
    c.fill('fg', d.x0 + 4, GALLERY, d.x1 - 4, GALLERY, 'branch');
    const mid = Math.floor((d.x0 + d.x1) / 2);
    for (const [dx, y] of [
      [-5, 37],
      [-2, 34],
      [-5, 31],
    ] as const) {
      c.fill('fg', mid + dx, y, mid + dx + 2, y, 'branch');
    }
    // Homes carved into the district: one each side of the beacon on the street, two up on the
    // gallery.
    const home = (x0: number, x1: number, floorY: number) =>
      c.house({
        x0,
        x1,
        roofY: floorY - 6,
        floorY,
        ownFloor: floorY !== FLOOR,
        doors: ['left', 'right'],
        wall: 'carved_brick',
        back: 'carved_brick',
        light: '',
      });
    home(d.x0 + 2, d.x0 + 11, FLOOR);
    home(d.x1 - 11, d.x1 - 2, FLOOR);
    home(d.x0 + 6, d.x0 + 15, GALLERY);
    home(d.x1 - 15, d.x1 - 6, GALLERY);
    // The district's beacon in the middle of its street, lamps along it, runes on the pillars.
    c.set('fg', mid, FLOOR - 1, 'beacon_dormant');
    for (const dx of [-8, 8]) c.set('fg', mid + dx, FLOOR - 1, 'street_lamp_out');
    c.area('district', d.key, d.x0, 4, d.x1, FLOOR - 1, { gloam: 220 });
  }
  for (const [x, y] of [
    [20, 10],
    [75, 12],
    [124, 10],
  ] as const) {
    c.fill('fg', x, y, x + 3, y, 'carved_runestone');
  }

  // Waypoints along the street (folk keep to it; the galleries are for explorers).
  const s = FLOOR - 1;
  const names: string[] = ['gate_w'];
  c.waypoint('gate_w', 1, s, 'gate:west');
  for (const d of districts) {
    const mid = Math.floor((d.x0 + d.x1) / 2);
    const k = d.key;
    c.waypoint(`${k}_home_a`, d.x0 + 7, s, `home:${k}:a`)
      .waypoint(`${k}_street_a`, mid - 6, s, `street:${k}`)
      .waypoint(`${k}_beacon`, mid + 2, s, `beacon:${k}`)
      .waypoint(`${k}_street_b`, mid + 6, s, `street:${k}`)
      .waypoint(`${k}_home_b`, d.x1 - 7, s, `home:${k}:b`);
    names.push(`${k}_home_a`, `${k}_street_a`, `${k}_beacon`, `${k}_street_b`, `${k}_home_b`);
  }
  names.push('gate_e');
  c.waypoint('gate_e', W - 2, s, 'gate:east');
  c.chain(names);
  return c;
}

/** Carves a filled ellipse of air out of the foreground (the back wall stays). */
function hollow(c: PrefabCanvas, cx: number, cy: number, rx: number, ry: number): void {
  c.ellipse('fg', cx, cy, rx, ry, '', true);
}

/**
 * Doorways on both sides at floor level (`floor` = the floor row): a corridor `rows` tall cut
 * from the map edge to `reach` columns in, a `door` rectangle (sealed in a fight) a few columns
 * in, and a `gate` point on the edge where a tunnel arrives.
 */
function doorways(c: PrefabCanvas, floor: number, reach: number, rows = 4): void {
  const W = c.width;
  c.fill('fg', 0, floor - rows, reach, floor - 1, '');
  c.fill('fg', W - 1 - reach, floor - rows, W - 1, floor - 1, '');
  c.area('door', 'west', 3, floor - rows, 4, floor - 1);
  c.area('door', 'east', W - 5, floor - rows, W - 4, floor - 1);
  c.point('gate', 'west', 0, floor - 1);
  c.point('gate', 'east', W - 1, floor - 1);
}

/**
 * M12: the Moth Matriarch's nest, a great glowcap hollow in the Grottos. Glowing caps (bouncy)
 * and branch ledges to fight from; two lures already set on the ledges.
 */
export function mothArena(): PrefabCanvas {
  const W = 72;
  const H = 40;
  const FLOOR = 34;
  const c = new PrefabCanvas(W, H);
  c.fill('fg', 0, 0, W - 1, H - 1, 'stone');
  c.fill('bg', 0, 0, W - 1, H - 1, 'stone');
  hollow(c, 36, 19, 33, 17);
  c.fill('fg', 2, FLOOR, W - 3, H - 1, 'stone');
  c.fill('fg', 6, FLOOR, W - 7, FLOOR, 'moss');
  doorways(c, FLOOR, 14);
  // Mushrooms: stems behind, glowing caps you can bounce on.
  for (const [x, top, w] of [
    [12, 27, 5],
    [55, 27, 5],
    [33, 23, 6],
  ] as const) {
    c.fill('bg', x + Math.floor(w / 2), top + 1, x + Math.floor(w / 2), FLOOR - 1, 'living_wood');
    c.fill('fg', x, top, x + w - 1, top, 'glowcap_flesh');
  }
  for (const [x0, x1, y] of [
    [20, 27, 29],
    [44, 51, 29],
    [14, 21, 20],
    [50, 57, 20],
    [29, 42, 14],
  ] as const) {
    c.fill('fg', x0, y, x1, y, 'branch');
  }
  c.set('fg', 23, 28, 'moth_lure');
  c.set('fg', 48, 28, 'moth_lure');
  c.area('arena', 'nest', 2, 2, W - 3, FLOOR - 1);
  c.area('trigger', 'nest', 16, 4, W - 17, FLOOR - 1);
  c.point('boss', 'matriarch', 36, 8);
  c.point('start', 'start', 22, FLOOR - 1);
  return c;
}

/**
 * M12: the Mire Sovereign's pool, a sunken basin in the Weeping Mire open to the sky, with
 * ledges at three heights, braziers on them, and a sluice lever on each side wall. Root
 * palisades rise round the rim during the fight. Surface prefab: row 10 sits on the ground.
 */
export function mireArena(): PrefabCanvas {
  const W = 84;
  const H = 34;
  const G = 10;
  const BOTTOM = 26; // the pool's lowest water row
  const c = new PrefabCanvas(W, H);
  c.props.foundation = 'mud';
  c.props.groundRow = G;
  c.fill('fg', 0, G, W - 1, H - 1, 'mud');
  c.fill('bg', 0, G + 1, W - 1, H - 1, 'mud');
  c.fill('fg', 0, G, 7, G, 'mire_grass');
  c.fill('fg', W - 8, G, W - 1, G, 'mire_grass');
  c.fill('fg', 8, G, W - 9, BOTTOM, '');
  c.fill('fg', 8, BOTTOM + 1, W - 9, BOTTOM + 2, 'peat');
  for (const [x0, x1, y] of [
    [14, 24, 22],
    [59, 69, 22],
    [30, 40, 17],
    [43, 53, 17],
    [18, 26, 13],
    [57, 65, 13],
    [8, 12, 15],
    [W - 13, W - 9, 15],
  ] as const) {
    c.fill('fg', x0, y, x1, y, 'branch');
  }
  for (const [x, y] of [
    [19, 21],
    [64, 21],
    [35, 16],
    [48, 16],
    [22, 12],
    [61, 12],
  ] as const) {
    c.set('fg', x, y, 'mire_brazier');
  }
  c.set('fg', 9, 14, 'sluice_lever');
  c.set('fg', W - 10, 14, 'sluice_lever');
  c.area('door', 'west', 4, 0, 5, G - 1);
  c.area('door', 'east', W - 6, 0, W - 5, G - 1);
  c.area('pool', 'pool', 8, G + 1, W - 9, BOTTOM);
  c.area('arena', 'pool', 4, 0, W - 5, BOTTOM);
  c.area('trigger', 'pool', 8, G + 1, W - 9, BOTTOM);
  c.point('boss', 'sovereign', 42, BOTTOM - 2);
  c.point('start', 'start', 20, 21);
  return c;
}

/**
 * M12: the Hollow Warden's hall, a crystal hall in the Moonstone Hollows. Prisms in the corners,
 * on the ceiling and over the ledges turn a lantern beam; right-click one to turn it round.
 */
export function wardenArena(): PrefabCanvas {
  const W = 70;
  const H = 42;
  const FLOOR = 36;
  const c = new PrefabCanvas(W, H);
  c.fill('fg', 0, 0, W - 1, H - 1, 'stone');
  c.fill('bg', 0, 0, W - 1, H - 1, 'stone');
  c.fill('fg', 3, 3, W - 4, FLOOR - 1, '');
  doorways(c, FLOOR, 3);
  // Crystal clusters on the walls and ceiling (their own cold light).
  for (const [x, y] of [
    [2, 10],
    [2, 22],
    [W - 3, 10],
    [W - 3, 22],
    [16, 2],
    [27, 2],
    [42, 2],
    [53, 2],
  ] as const) {
    c.set('fg', x, y, 'moonstone_crystal');
  }
  for (const [x0, x1, y] of [
    [9, 18, 28],
    [W - 19, W - 10, 28],
    [28, 41, 19],
  ] as const) {
    c.fill('fg', x0, y, x1, y, 'branch');
  }
  for (const [x, y, k] of [
    [5, FLOOR - 1, 'prism_slash'],
    [W - 6, FLOOR - 1, 'prism_back'],
    [5, 4, 'prism_back'],
    [W - 6, 4, 'prism_slash'],
    [35, 4, 'prism_back'],
    [13, 27, 'prism_slash'],
    [W - 14, 27, 'prism_back'],
    [35, 18, 'prism_slash'],
  ] as const) {
    c.set('fg', x, y, k);
  }
  c.area('arena', 'hall', 3, 3, W - 4, FLOOR - 1);
  c.area('trigger', 'hall', 14, 3, W - 15, FLOOR - 1);
  c.point('boss', 'warden', 35, FLOOR - 1);
  c.point('start', 'start', 20, FLOOR - 1);
  return c;
}

/**
 * M12: the Gloam Heart's chamber at the bottom of the world, round the World Tree's taproot.
 * Six choked root-lamps on the floor and ledges; the whole chamber starts thick with Gloam.
 */
export function heartArena(): PrefabCanvas {
  const W = 100;
  const H = 56;
  const FLOOR = 48;
  const c = new PrefabCanvas(W, H);
  c.fill('fg', 0, 0, W - 1, H - 1, 'gloam_veined_stone');
  c.fill('bg', 0, 0, W - 1, H - 1, 'gloam_veined_stone');
  hollow(c, 50, 25, 47, 25);
  c.fill('fg', 2, FLOOR, W - 3, H - 1, 'obsidian');
  doorways(c, FLOOR, 21);
  // The taproot coming down out of the ceiling to the Heart.
  c.fill('bg', 46, 0, 53, 30, 'living_wood');
  c.fill('fg', 47, 1, 52, 6, 'rootwood');
  for (const [x0, x1, y] of [
    [14, 24, 38],
    [75, 85, 38],
    [26, 36, 28],
    [63, 73, 28],
    [36, 44, 18],
    [55, 63, 18],
  ] as const) {
    c.fill('fg', x0, y, x1, y, 'branch');
  }
  for (const [x, y] of [
    [26, FLOOR - 1],
    [73, FLOOR - 1],
    [19, 37],
    [80, 37],
    [31, 27],
    [68, 27],
  ] as const) {
    c.set('fg', x, y, 'heart_node');
  }
  c.area('arena', 'heart', 3, 2, W - 4, FLOOR - 1);
  c.area('trigger', 'heart', 22, 4, W - 23, FLOOR - 1);
  c.area('gloam', 'heart', 0, 0, W - 1, H - 1, { gloam: 230 });
  c.point('boss', 'heart', 50, 25);
  c.point('start', 'start', 34, 27);
  return c;
}

export const SKETCHES: Readonly<Record<string, () => PrefabCanvas>> = {
  cottage,
  canopyhold,
  citadel,
  moth_arena: mothArena,
  mire_arena: mireArena,
  warden_arena: wardenArena,
  heart_arena: heartArena,
};
