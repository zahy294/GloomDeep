import { NAV, TILE_SIZE } from '../../config';
import type { Npc } from '../entities/Npc';
import type { Prefab } from '../world/tiled';

/**
 * NPC movement in towns (plan 1.7, plan 3.4 NavSystem): townsfolk move between the waypoints of
 * their town's prefab graph rather than by general tile pathfinding. They walk an edge in a
 * straight line (doors, steps and bridges are part of the drawn route) and ride a lift edge (both
 * ends tagged `lift`) slowly up or down. Movement is kinematic: what the player builds or digs in
 * a town doesn't strand anyone.
 */

export type EdgeKind = 'walk' | 'lift';

const NO_LINKS: NavNode['links'] = [];

export interface NavNode {
  /** World tiles: the cell the feet stand in. */
  readonly x: number;
  readonly y: number;
  readonly tag: string;
  readonly links: readonly { readonly to: number; readonly kind: EdgeKind }[];
}

export interface NavGraph {
  readonly nodes: readonly NavNode[];
}

/** Where a townsperson is on their graph and where they are going. */
export interface NavState {
  /** The node they are at, or last left. */
  node: number;
  /** Nodes still to visit, next first. */
  path: number[];
  /** The tag they are heading for (or standing at). */
  goal: string;
  /** On a lift edge right now (the renderer draws the basket). */
  riding: boolean;
  /** Seconds until they next turn around while standing about. */
  idle: number;
}

/** The waypoint graph of a prefab stamped with its top-left at (x0, y0). */
export function buildNavGraph(prefab: Prefab, x0: number, y0: number): NavGraph {
  const index = new Map(prefab.waypoints.map((w, i) => [w.name, i]));
  const nodes = prefab.waypoints.map((w) => ({
    x: x0 + w.x,
    y: y0 + w.y,
    tag: w.tag,
    links: w.links.map((name) => {
      const to = index.get(name) ?? 0;
      const other = prefab.waypoints[to];
      const kind: EdgeKind = w.tag === 'lift' && other?.tag === 'lift' ? 'lift' : 'walk';
      return { to, kind };
    }),
  }));
  return { nodes };
}

/** Nodes carrying a tag, in graph order. */
export function nodesTagged(graph: NavGraph, place: string): number[] {
  const out: number[] = [];
  graph.nodes.forEach((n, i) => {
    if (n.tag === place) out.push(i);
  });
  return out;
}

/**
 * The node for a place: one of the nodes with that tag, chosen by `salt` so folk going to the
 * plaza spread out over its waypoints. -1 if no node has the tag.
 */
export function pickNode(graph: NavGraph, place: string, salt: number): number {
  const options = nodesTagged(graph, place);
  if (options.length === 0) return -1;
  return options[Math.abs(salt) % options.length] ?? -1;
}

/** Shortest path (by distance) from one node to another, excluding the start; null if none. */
export function findPath(graph: NavGraph, from: number, to: number): number[] | null {
  const n = graph.nodes.length;
  if (from < 0 || to < 0 || from >= n || to >= n) return null;
  if (from === to) return [];
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0 || dist[u] === Infinity) return null;
    if (u === to) break;
    done[u] = 1;
    const a = graph.nodes[u]!;
    for (const link of a.links) {
      const b = graph.nodes[link.to]!;
      const d = dist[u]! + Math.hypot(b.x - a.x, b.y - a.y);
      if (d < dist[link.to]!) {
        dist[link.to] = d;
        prev[link.to] = u;
      }
    }
  }
  const path: number[] = [];
  for (let v = to; v !== from; v = prev[v]!) path.push(v);
  return path.reverse();
}

export function createNavState(node: number, goal: string): NavState {
  return { node, path: [], goal, riding: false, idle: 0 };
}

/** Puts a townsperson's feet on a node at once (spawning, a frightened escort running home). */
export function placeAtNode(npc: Npc, graph: NavGraph, node: number): void {
  const n = graph.nodes[node];
  if (!n) return;
  const b = npc.body;
  b.x = (n.x + 0.5) * TILE_SIZE - b.width / 2;
  b.y = (n.y + 1) * TILE_SIZE - b.height;
  b.vx = 0;
  b.vy = 0;
  npc.prevX = b.x;
  npc.prevY = b.y;
  if (npc.nav) {
    npc.nav.node = node;
    npc.nav.path.length = 0;
    npc.nav.riding = false;
  }
}

/** Sets off for a place (no-op if already heading there). */
export function goTo(npc: Npc, graph: NavGraph, place: string): void {
  const nav = npc.nav;
  if (!nav || nav.goal === place) return;
  const target = pickNode(graph, place, npc.id);
  if (target < 0) return;
  // Mid-edge, plan from the node being walked to (they finish the edge first).
  const start = nav.path[0] ?? nav.node;
  const rest = findPath(graph, start, target);
  if (!rest) return;
  nav.goal = place;
  nav.path = nav.path.length > 0 ? [start, ...rest] : rest;
}

/**
 * Moves along the path at walking (or lift) speed. Sets body.vx while walking so the renderer
 * steps the legs, and faces the way they go; standing about, they turn now and then.
 */
export function stepNav(npc: Npc, graph: NavGraph, dt: number, random: () => number): void {
  const nav = npc.nav;
  if (!nav) return;
  const b = npc.body;
  npc.prevX = b.x;
  npc.prevY = b.y;
  const next = nav.path[0];
  if (next === undefined) {
    b.vx = 0;
    b.vy = 0;
    nav.riding = false;
    nav.idle -= dt;
    if (nav.idle <= 0) {
      nav.idle = NAV.idleTurnMin + random() * (NAV.idleTurnMax - NAV.idleTurnMin);
      npc.facing = random() < 0.5 ? 1 : -1;
    }
    return;
  }
  const from = graph.nodes[nav.node];
  const to = graph.nodes[next];
  if (!to) {
    nav.path.length = 0;
    return;
  }
  let kind: EdgeKind = 'walk';
  for (const l of from?.links ?? NO_LINKS) if (l.to === next) kind = l.kind;
  nav.riding = kind === 'lift';
  const speed = kind === 'lift' ? NAV.liftSpeed : NAV.walkSpeed;
  const tx = (to.x + 0.5) * TILE_SIZE - b.width / 2;
  const ty = (to.y + 1) * TILE_SIZE - b.height;
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.hypot(dx, dy);
  const move = speed * dt;
  if (d <= move) {
    b.x = tx;
    b.y = ty;
    nav.node = next;
    nav.path.shift();
  } else {
    b.x += (dx / d) * move;
    b.y += (dy / d) * move;
  }
  // vx drives the walk animation (not physics: townsfolk move kinematically).
  b.vx = kind === 'walk' && Math.abs(dx) > 0 ? Math.sign(dx) * speed : 0;
  b.vy = 0;
  if (Math.abs(dx) > NAV.faceThreshold) npc.facing = dx > 0 ? 1 : -1;
}
