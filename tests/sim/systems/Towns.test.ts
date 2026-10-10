import { describe, expect, it } from 'vitest';
import { ESCORT, ROAD, TILE_SIZE, TOWN, TRADE } from '../../../src/config';
import { itemId } from '../../../src/data/items';
import { prefabByKey } from '../../../src/data/prefabs';
import { tileId } from '../../../src/data/tiles';
import { decodeSave, encodeSave, SAVE_VERSION } from '../../../src/persistence/saveFormat';
import type { Npc } from '../../../src/sim/entities/Npc';
import { Simulation } from '../../../src/sim/Simulation';
import { nextLine, type DialogueContext } from '../../../src/sim/systems/DialogueSystem';
import { buildNavGraph, findPath, pickNode } from '../../../src/sim/systems/NavSystem';
import { lampStage } from '../../../src/sim/systems/TownSystem';
import { buyPrice, priceFactor, sellPrice } from '../../../src/sim/systems/TradeSystem';
import { SHOPS } from '../../../src/data/shops';
import { createNpc } from '../../../src/sim/entities/Npc';
import { stampPrefabAt, worldTarget } from '../../../src/sim/world/prefabs';
import type { TownPlace } from '../../../src/sim/world/worldData';
import { AIR } from '../../../src/sim/world/World';
import { lightRoads, relightDistricts, startFestival, townSpot } from '../../../src/sim/debugTowns';

const T = TILE_SIZE;
const W = 420;
const H = 200;
const GROUND = 80;
const VILLAGE_X = 60;
const CANOPY: TownPlace = { key: 'canopyhold', x0: 200, y0: GROUND - 48, x1: 311, y1: GROUND + 9 };
const CITADEL: TownPlace = { key: 'citadel', x0: 250, y0: 120, x1: 399, y1: 163 };

/**
 * A flat stone world (ground at row 80) with Canopyhold stamped on it at column 200, the
 * Citadel buried below it (districts full of Gloam), and a cave pocket west of the town.
 */
function townWorld(): Simulation {
  return new Simulation({
    size: { width: W, height: H, chunkSize: 20 },
    towns: [CANOPY, CITADEL],
    startingInventory: false,
    generate: (w) => {
      for (let y = GROUND; y < H; y++) for (let x = 0; x < W; x++) w.set(x, y, tileId('stone'));
      for (let y = 95; y < 107; y++) for (let x = 170; x < 216; x++) w.set(x, y, AIR);
      for (const place of [CANOPY, CITADEL]) {
        const prefab = prefabByKey(place.key);
        stampPrefabAt(worldTarget(w), prefab, place.x0, place.y0);
        for (const o of prefab.objects) {
          if (o.kind !== 'district') continue;
          for (let y = place.y0 + o.y0; y <= place.y0 + o.y1; y++) {
            for (let x = place.x0 + o.x0; x <= place.x0 + o.x1; x++) {
              w.gloam[w.index(x, y)] = Number(o.props.gloam);
            }
          }
        }
      }
      return { spawnX: (VILLAGE_X + 0.5) * T, spawnY: GROUND * T };
    },
  });
}

function step(sim: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.update(1000 / 60);
}

function at(sim: Simulation, hour: number): void {
  sim.setDayFraction(hour / 24);
}

/** Puts the player's feet in tile (x, y) and looks there. */
function put(sim: Simulation, x: number, y: number): void {
  const b = sim.player.body;
  b.x = (x + 0.5) * T - b.width / 2;
  b.y = (y + 1) * T - b.height;
  b.vx = 0;
  b.vy = 0;
  sim.player.prevX = b.x;
  sim.player.prevY = b.y;
  sim.input.setFocus(b.x, b.y);
}

function rightClick(sim: Simulation, px: number, py: number): void {
  sim.input.setAim(px, py);
  sim.input.setHeld('useAlt', true);
  step(sim, 1 / 60);
  sim.input.setHeld('useAlt', false);
  step(sim, 1 / 60);
}

function folk(sim: Simulation, key: string): Npc {
  const npc = sim.settlement.npcs.find((n) => n.key === key);
  if (!npc) throw new Error(`${key} is not here`);
  return npc;
}

/** Walks up to someone and right-clicks them; returns what they said. */
function talk(sim: Simulation, key: string): { text: string; offer: string; shop: boolean } {
  const npc = folk(sim, key);
  const b = npc.body;
  put(sim, Math.floor((b.x + b.width / 2) / T) - 2, Math.floor((b.y + b.height - 1) / T));
  let said = { text: '', offer: '', shop: false };
  const off = sim.events.on('talk', (p) => (said = { text: p.text, offer: p.offer, shop: p.shop }));
  rightClick(sim, b.x + b.width / 2, b.y + b.height / 2);
  off();
  return said;
}

function feetTile(npc: Npc): { x: number; y: number } {
  const b = npc.body;
  return { x: Math.floor((b.x + b.width / 2) / T), y: Math.floor((b.y + b.height - 1) / T) };
}

const canopy = (sim: Simulation) => sim.towns.towns.find((t) => t.def.key === 'canopyhold')!;

describe('NavSystem', () => {
  const graph = buildNavGraph(prefabByKey('canopyhold'), 0, 0);
  it('finds the way between levels through the lift', () => {
    const from = pickNode(graph, 'gate:west', 0);
    const to = pickNode(graph, 'home:courier', 0);
    const path = findPath(graph, from, to);
    expect(path).not.toBeNull();
    const tags = (path ?? []).map((i) => graph.nodes[i]?.tag);
    expect(tags.filter((t) => t === 'lift').length).toBe(3);
    expect(graph.nodes[path!.at(-1)!]?.tag).toBe('home:courier');
    const liftEdges = graph.nodes.flatMap((n) => n.links.filter((l) => l.kind === 'lift'));
    expect(liftEdges).toHaveLength(4);
  });
  it('spreads folk over the waypoints of a place', () => {
    const picks = new Set([0, 1, 2, 3].map((salt) => pickNode(graph, 'plaza', salt)));
    expect(picks.size).toBe(4);
    expect(pickNode(graph, 'nowhere', 0)).toBe(-1);
  });
});

describe('DialogueSystem', () => {
  const ctx = (over: Partial<DialogueContext> = {}): DialogueContext => ({
    hasFlag: () => false,
    cleansed: 0,
    night: false,
    festival: false,
    dimming: false,
    ...over,
  });
  it('uses the last entry whose condition holds, cycling its lines and restarting on change', () => {
    const dryad = createNpc(1, 'dryad', 0, 0);
    const first = nextLine(dryad, ctx());
    expect(nextLine(dryad, ctx())).not.toBe(first);
    expect(nextLine(dryad, ctx({ cleansed: 0.3 }))).toMatch(/quarter of the Gloam/);
    const pip = createNpc(2, 'child', 0, 0);
    pip.scared = true;
    expect(nextLine(pip, ctx())).toMatch(/lamps are out/);
    pip.scared = false;
    expect(nextLine(pip, ctx({ festival: true }))).toMatch(/festival/i);
    expect(nextLine(createNpc(3, 'nobody', 0, 0), ctx())).toBe('');
  });
});

describe('Canopyhold', () => {
  it('its folk arrive and keep their routines, riding the lift between levels', () => {
    const sim = townWorld();
    at(sim, 10);
    step(sim, TOWN.checkSeconds * 1.2);
    const townsfolk = sim.settlement.npcs.filter((n) => n.town === 'canopyhold');
    expect(townsfolk.map((n) => n.key).sort()).toEqual([
      'caravaneer',
      'child',
      'courier',
      'innkeeper',
      'lampwright',
      'merchant',
      'ropewright',
      'weaver',
    ]);
    const town = canopy(sim);
    const tagAt = (npc: Npc) =>
      town.graph.nodes.find((n) => {
        const f = feetTile(npc);
        return n.x === f.x && n.y === f.y;
      })?.tag;
    expect(tagAt(folk(sim, 'merchant'))).toBe('shop:merchant');
    // Late at night the lampwright walks from the workshop to the lift, rides up, walks home.
    at(sim, 23.2);
    let rode = false;
    for (let s = 0; s < 40 * 60 && !rode; s++) {
      step(sim, 1 / 60);
      rode = folk(sim, 'lampwright').nav?.riding ?? false;
    }
    expect(rode).toBe(true);
    step(sim, 30);
    expect(tagAt(folk(sim, 'lampwright'))).toBe('home:lampwright');
  });

  it('its houses are not homes for your village', () => {
    const sim = townWorld();
    step(sim, 3);
    expect(sim.settlement.homes.size).toBe(0);
    expect(sim.settlement.npcs.some((n) => n.key === 'tinker')).toBe(false);
  });

  it('lamps burn down at night; a dark town frightens its folk; refuelling relights a lamp', () => {
    const sim = townWorld();
    const town = canopy(sim);
    expect(town.lamps.length).toBeGreaterThan(10);
    expect(town.light).toBeGreaterThan(TOWN.scaredBelow);
    // Lamps burn only at night.
    const full = town.lamps.find((l) => l.fuel === 1)!;
    at(sim, 12);
    step(sim, 1);
    expect(full.fuel).toBe(1);
    at(sim, 1);
    step(sim, 1);
    expect(full.fuel).toBeCloseTo(1 - 1 / TOWN.lampBurnSeconds, 3);
    for (const lamp of town.lamps) lamp.fuel = 0;
    step(sim, TOWN.checkSeconds * 2);
    expect(sim.world.get(town.lamps[0]!.x, town.lamps[0]!.y)).toBe(tileId('street_lamp_out'));
    expect(town.light).toBe(0);
    expect(folk(sim, 'merchant').scared).toBe(true);
    expect(folk(sim, 'merchant').nav?.goal).toBe('home:merchant');
    expect(talk(sim, 'merchant').shop).toBe(false); // too frightened to trade
    // Right-click a lamp with a Lumen petal.
    sim.giveItems([{ item: 'lumen_petal', count: 1 }]);
    const lamp = town.lamps[0]!;
    put(sim, lamp.x + 1, lamp.y);
    rightClick(sim, (lamp.x + 0.5) * T, (lamp.y + 0.5) * T);
    expect(lamp.fuel).toBeCloseTo(1, 3);
    expect(sim.world.get(lamp.x, lamp.y)).toBe(tileId('street_lamp'));
    expect(sim.inventory.count(itemId('lumen_petal'))).toBe(0);
    expect(lampStage(TOWN.lampDimBelow / 2)).toBe(1);
  });

  it('a bright town keeps the Gloam and creatures out; a dark one does not', () => {
    const sim = townWorld();
    const town = canopy(sim);
    expect(sim.towns.protects(CANOPY.x0 + 40, GROUND - 3)).toBe(true);
    for (const lamp of town.lamps) lamp.fuel = 0;
    step(sim, TOWN.checkSeconds * 1.2);
    expect(sim.towns.protects(CANOPY.x0 + 40, GROUND - 3)).toBe(false);
  });

  it('the lift basket carries the player up a level at a time, and from the top back down', () => {
    const sim = townWorld();
    const posts = canopy(sim)
      .lifts.map((l) => l.y)
      .sort((a, b) => b - a);
    const x = canopy(sim).lifts[0]!.x;
    const rides: [number, number][] = [
      [posts[0]!, posts[1]!],
      [posts[1]!, posts[2]!],
      [posts[2]!, posts[0]!],
    ];
    for (const [from, to] of rides) {
      put(sim, x - 1, from);
      rightClick(sim, (x + 0.5) * T, (from + 0.5) * T);
      const b = sim.player.body;
      expect(Math.floor((b.y + b.height - 1) / T)).toBe(to);
    }
  });
});

describe('quests', () => {
  it('deliver: offered, accepted, handed in for the reward (a taught recipe)', () => {
    const sim = townWorld();
    at(sim, 10);
    step(sim, TOWN.checkSeconds * 1.2);
    const offer = talk(sim, 'innkeeper');
    expect(offer.offer).toBe('glowcap_stew');
    sim.enqueue({ type: 'acceptQuest', quest: 'glowcap_stew' });
    step(sim, 1 / 60);
    expect(talk(sim, 'innkeeper').text).toMatch(/Twelve glowcap/);
    sim.giveItems([{ item: 'glowcap_flesh', count: 15 }]);
    expect(sim.quests.marker(folk(sim, 'innkeeper'))).toBe('?');
    talk(sim, 'innkeeper');
    expect(sim.quests.state('glowcap_stew')).toBe('done');
    expect(sim.inventory.count(itemId('glowcap_flesh'))).toBe(3);
    expect(sim.inventory.count(itemId('glimmer'))).toBe(30);
    expect(sim.progression.has('recipe:hanging_lantern')).toBe(true);
    // The taught recipe now crafts at an anvil.
    const b = sim.player.body;
    sim.world.set(Math.floor(b.x / T) + 1, Math.floor((b.y + b.height - 1) / T), tileId('anvil'));
    sim.giveItems([
      { item: 'copper_bar', count: 1 },
      { item: 'glass_jar', count: 1 },
      { item: 'torch', count: 2 },
    ]);
    const lanterns = sim.inventory.count(itemId('hanging_lantern'));
    sim.enqueue({ type: 'craft', recipe: 'hanging_lantern', times: 1 });
    step(sim, 1 / 60);
    expect(sim.inventory.count(itemId('hanging_lantern'))).toBe(lanterns + 2);
    expect(sim.quests.marker(folk(sim, 'innkeeper'))).toBe('');
  });

  it('light a route: lighting the road completes it, starts a caravan and lowers prices', () => {
    const sim = townWorld();
    at(sim, 10);
    step(sim, TOWN.checkSeconds * 1.2);
    expect(talk(sim, 'lampwright').offer).toBe('canopy_road');
    sim.enqueue({ type: 'acceptQuest', quest: 'canopy_road' });
    const road = sim.roads.roads[0]!;
    expect(road.x0).toBe(VILLAGE_X);
    expect(road.x1).toBe(CANOPY.x0 + 1); // the west gate
    const merchant = folk(sim, 'merchant');
    put(sim, feetTile(merchant).x - 2, feetTile(merchant).y);
    const before = sim.tradeTerms(merchant.id)!.factor;
    const progress: number[] = [];
    sim.events.on('roadProgress', (p) => progress.push(p.lit));
    let lit = '';
    sim.events.on('roadLit', (p) => (lit = p.road));
    for (let x = VILLAGE_X; x < CANOPY.x0; x += 12) sim.world.set(x, GROUND - 1, tileId('torch'));
    step(sim, ROAD.checkSeconds * 1.5);
    expect(lit).toBe('canopy_road');
    expect(progress.at(-1)).toBe(road.samples.length);
    expect(sim.progression.has('road:canopy_road')).toBe(true);
    // The caravan sets out from the town end and walks the ground towards the village.
    expect(road.caravan).not.toBeNull();
    const x0 = road.caravan!.x;
    step(sim, 2);
    expect(road.caravan!.x).toBeLessThan(x0);
    expect(road.caravan!.y).toBe(GROUND * T);
    put(sim, feetTile(merchant).x - 2, feetTile(merchant).y);
    expect(sim.tradeTerms(merchant.id)!.factor).toBeCloseTo(before - TRADE.roadDiscount, 5);
    talk(sim, 'lampwright');
    expect(sim.quests.state('canopy_road')).toBe('done');
  });

  it('escort: they follow, flee home after too long in the dark, and arrive in the village', () => {
    const sim = townWorld();
    at(sim, 10);
    step(sim, TOWN.checkSeconds * 1.2);
    talk(sim, 'caravaneer');
    sim.enqueue({ type: 'acceptQuest', quest: 'juniper_escort' });
    step(sim, 1 / 60);
    const juniper = folk(sim, 'courier');
    put(sim, feetTile(juniper).x + 1, feetTile(juniper).y);
    step(sim, 0.1);
    expect(juniper.escorting).toBe(true);
    // In the dark too long: she runs home and stops following.
    let fled = '';
    sim.events.on('escortFled', (p) => (fled = p.text));
    sim.quests.update(ESCORT.fearSeconds + 0.1, () => 0);
    expect(fled).toMatch(/going home/);
    expect(juniper.escorting).toBe(false);
    expect(sim.quests.state('juniper_escort')).toBe('active');
    // Pick her up again and walk to the village (she catches up when left behind).
    put(sim, feetTile(juniper).x + 1, feetTile(juniper).y);
    step(sim, 0.1);
    expect(juniper.escorting).toBe(true);
    put(sim, VILLAGE_X + 2, GROUND - 1);
    step(sim, 1);
    expect(sim.quests.state('juniper_escort')).toBe('done');
    expect(sim.progression.has('juniper_moved')).toBe(true);
    step(sim, TOWN.checkSeconds * 1.2);
    expect(sim.settlement.npcs.some((n) => n.key === 'courier')).toBe(false);
  });

  it('find: the lost thing hides in a cave, wisps lead there, picking it up and handing it in', () => {
    const sim = townWorld();
    at(sim, 10);
    step(sim, TOWN.checkSeconds * 1.2);
    expect(talk(sim, 'child').offer).toBe('lost_locket');
    sim.enqueue({ type: 'acceptQuest', quest: 'lost_locket' });
    step(sim, 1 / 60);
    const lost = sim.quests.lostThing();
    expect(lost).not.toBeNull();
    expect(lost!.y).toBeGreaterThan(GROUND + 8);
    expect(sim.world.isSolid(lost!.x, lost!.y + 1)).toBe(true);
    expect(sim.wisps.quest).toEqual(lost);
    const { x: lx, y: ly } = lost!;
    // With a full bag, the locket drops at your feet: once, however long you stand there.
    for (let i = 0; i < sim.inventory.slots.length; i++) {
      sim.inventory.slots[i] = { itemId: itemId('stone'), count: 999 };
    }
    const drops = sim.drops.length;
    put(sim, lx, ly);
    step(sim, 0.5);
    expect(sim.drops.filter((d) => d.itemId === itemId('lost_locket'))).toHaveLength(1);
    expect(sim.drops.length).toBe(drops + 1);
    expect(sim.quests.lostThing()).toBeNull();
    // Make room; it is picked up from the ground.
    for (let i = 0; i < sim.inventory.slots.length; i++) sim.inventory.slots[i] = null;
    step(sim, 2);
    expect(sim.inventory.count(itemId('lost_locket'))).toBe(1);
    talk(sim, 'child');
    expect(sim.quests.state('lost_locket')).toBe('done');
    expect(sim.inventory.count(itemId('lost_locket'))).toBe(0);
    expect(sim.inventory.count(itemId('glimmer'))).toBe(20);
  });
});

describe('trade', () => {
  it('buying something and selling it straight back never gains glimmer, at any price factor', () => {
    for (const shop of SHOPS) {
      for (const offer of shop.offers) {
        for (let f = TRADE.minFactor; f <= 1 + TRADE.darkMarkup + 1e-9; f += 0.05) {
          const paid = buyPrice(offer, f);
          const back = sellPrice(itemId(offer.item), offer.count, f);
          expect(back, `${shop.npc} ${offer.item} at ×${f.toFixed(2)}`).toBeLessThan(paid);
        }
      }
    }
  });

  it('prices follow the town light and lit roads, and never fall below the floor', () => {
    expect(priceFactor(1, 0)).toBe(1);
    expect(priceFactor(0, 0)).toBe(1 + TRADE.darkMarkup);
    expect(priceFactor(1, 10)).toBe(TRADE.minFactor);
  });
  it('buys with glimmer and sells goods for it, only within reach of the trader', () => {
    const sim = townWorld();
    at(sim, 10);
    step(sim, TOWN.checkSeconds * 1.2);
    const merchant = folk(sim, 'merchant');
    sim.giveItems([
      { item: 'glimmer', count: 50 },
      { item: 'iron_ore', count: 10 },
    ]);
    put(sim, VILLAGE_X, GROUND - 1);
    sim.enqueue({ type: 'buy', npc: merchant.id, offer: 0 });
    step(sim, 1 / 60);
    expect(sim.inventory.count(itemId('torch'))).toBe(0); // too far away
    put(sim, feetTile(merchant).x - 2, feetTile(merchant).y);
    const factor = sim.tradeTerms(merchant.id)!.factor;
    sim.enqueue({ type: 'buy', npc: merchant.id, offer: 0 });
    step(sim, 1 / 60);
    expect(sim.inventory.count(itemId('torch'))).toBe(10);
    const afterBuy = 50 - Math.round(8 * factor);
    expect(sim.inventory.count(itemId('glimmer'))).toBe(afterBuy);
    sim.enqueue({ type: 'sell', npc: merchant.id, item: itemId('iron_ore'), count: 10 });
    step(sim, 1 / 60);
    expect(sim.inventory.count(itemId('iron_ore'))).toBe(0);
    expect(sim.inventory.count(itemId('glimmer'))).toBe(
      afterBuy + Math.floor(30 * TRADE.sellShare * Math.min(1, factor)),
    );
    // Festival stalls are closed outside the festival.
    const festivalOffer = 6;
    sim.enqueue({ type: 'buy', npc: merchant.id, offer: festivalOffer });
    step(sim, 1 / 60);
    expect(sim.inventory.count(itemId('firefly_jar'))).toBe(0);
  });
});

describe('Rootdeep Citadel', () => {
  it('relighting a district beacon burns its Gloam away; reclaimed, its folk return', () => {
    const sim = townWorld();
    at(sim, 10);
    const town = sim.towns.towns.find((t) => t.def.key === 'citadel')!;
    const ward = town.districts.find((d) => d.def.key === 'gate_ward')!;
    expect(sim.world.get(ward.beaconX, ward.beaconY)).toBe(tileId('beacon_dormant'));
    put(sim, ward.beaconX - 2, ward.beaconY);
    let blocked = '';
    sim.events.on('useBlocked', (p) => (blocked = p.need));
    rightClick(sim, (ward.beaconX + 0.5) * T, (ward.beaconY + 0.5) * T);
    expect(blocked).toMatch(/3 Lumen Crystal/);
    sim.giveItems([{ item: 'lumen_crystal', count: 3 }]);
    rightClick(sim, (ward.beaconX + 0.5) * T, (ward.beaconY + 0.5) * T);
    expect(sim.world.get(ward.beaconX, ward.beaconY)).toBe(tileId('great_beacon'));
    expect(sim.inventory.count(itemId('lumen_crystal'))).toBe(0);
    expect(sim.beacons.covers(ward.x0, ward.y0)).toBe(true);
    sim.input.setFocus(((ward.x0 + ward.x1) / 2) * T, ((ward.y0 + ward.y1) / 2) * T);
    let reclaimed = '';
    sim.events.on('districtReclaimed', (p) => (reclaimed = p.district));
    step(sim, 6);
    expect(reclaimed).toBe('gate_ward');
    expect(ward.reclaimed).toBe(true);
    expect(sim.progression.has('district:gate_ward')).toBe(true);
    expect(folk(sim, 'warden').town).toBe('citadel');
    expect(sim.settlement.npcs.some((n) => n.key === 'smith')).toBe(false);
    expect(town.light).toBeCloseTo(1 / 3, 5);
    // Underground, the surface night doesn't frighten them (the town is only a third lit).
    at(sim, 1);
    step(sim, TOWN.checkSeconds * 1.2);
    expect(folk(sim, 'warden').scared).toBe(false);
  });
});

describe('festival', () => {
  it('the night after its flag is set, the town celebrates from dusk to dawn', () => {
    const sim = townWorld();
    at(sim, 12);
    step(sim, TOWN.checkSeconds * 1.2);
    const events: string[] = [];
    sim.events.on('festivalStarted', (p) => events.push(`start ${p.name}`));
    sim.events.on('festivalEnded', () => events.push('end'));
    sim.enqueue({ type: 'setFlag', flag: 'boss:moth_matriarch' });
    step(sim, TOWN.checkSeconds * 1.2);
    expect(canopy(sim).festivalPhase).toBe('due');
    for (const lamp of canopy(sim).lamps) lamp.fuel = 0;
    at(sim, 19.5);
    step(sim, TOWN.checkSeconds * 1.2);
    expect(events).toEqual(['start the Festival of Lanterns']);
    expect(canopy(sim).lamps.every((l) => l.fuel === 1)).toBe(true);
    expect(folk(sim, 'merchant').nav?.goal).toBe('plaza');
    at(sim, 7);
    step(sim, TOWN.checkSeconds * 1.2);
    expect(events).toEqual(['start the Festival of Lanterns', 'end']);
    expect(canopy(sim).festivalPhase).toBe('over');
  });
});

describe('saving towns', () => {
  it('flags, quests, lamp fuel and festivals survive; townsfolk are rebuilt, not doubled', () => {
    const sim = townWorld();
    at(sim, 10);
    step(sim, TOWN.checkSeconds * 1.2);
    talk(sim, 'child');
    sim.enqueue({ type: 'acceptQuest', quest: 'lost_locket' });
    sim.enqueue({ type: 'setFlag', flag: 'district:gate_ward' });
    step(sim, 1 / 60);
    canopy(sim).lamps[0]!.fuel = 0.25;
    const meta = {
      id: 't',
      name: 't',
      seed: 1,
      sizeKey: 'small' as const,
      width: W,
      height: H,
      createdAt: 0,
      lastPlayed: 0,
      playTime: 0,
    };
    const loaded = Simulation.fromSave(decodeSave(encodeSave(sim.toSaveState(meta, SAVE_VERSION))));
    expect(loaded.progression.has('district:gate_ward')).toBe(true);
    expect(loaded.quests.state('lost_locket')).toBe('active');
    expect(loaded.quests.lostThing()).toEqual(sim.quests.lostThing());
    expect(canopy(loaded).lamps[0]!.fuel).toBe(0.25);
    expect(loaded.towns.towns.find((t) => t.def.key === 'citadel')?.districts[0]?.reclaimed).toBe(
      true,
    );
    step(loaded, TOWN.checkSeconds * 1.2);
    const keys = loaded.settlement.npcs.map((n) => n.key);
    expect(keys.filter((k) => k === 'merchant')).toHaveLength(1);
    expect(keys).toContain('warden');
  });
});

describe('town debug starts', () => {
  it('light the roads, relight districts, start the festival, find the spots', () => {
    const sim = townWorld();
    lightRoads(sim);
    relightDistricts(sim, ['gate_ward']);
    startFestival(sim);
    step(sim, Math.max(ROAD.checkSeconds, TOWN.checkSeconds) * 1.2);
    expect(sim.progression.has('road:canopy_road')).toBe(true);
    expect(sim.progression.has('district:gate_ward')).toBe(true);
    expect(canopy(sim).festivalPhase).toBe('on');
    expect(townSpot(sim, 'canopyhold')?.y).toBe(GROUND);
    expect(townSpot(sim, 'citadel')?.x).toBeGreaterThan(CITADEL.x0);
    expect(townSpot(sim, 'road')?.x).toBeGreaterThan(VILLAGE_X);
  });
});
