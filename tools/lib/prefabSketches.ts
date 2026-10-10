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

export const SKETCHES: Readonly<Record<string, () => PrefabCanvas>> = {
  cottage,
  canopyhold,
  citadel,
};
