/**
 * Builds Tiled JSON maps from code (M11 bootstrap). The maps it writes to src/data/prefabs/ are
 * the source of truth afterwards: open and edit them in Tiled. `npm run prefabs -- <key> --force`
 * regenerates one from its sketch (tools/lib/prefabSketches.ts), overwriting hand edits.
 */
import { TILES } from '../../src/data/tiles';
import type { TiledMap, TiledObject, TiledProperty, TiledValue } from '../../src/sim/world/tiled';

export const TILESET_FILE = 'gloamdeep.tileset.json';
export const TILESET_IMAGE = 'gloamdeep.tileset.png';
export const TILESET_COLUMNS = 16;
const TILE = 16;
/** Tileset local id = tile id, so gid = tile id + FIRST_GID. */
const FIRST_GID = 1;

const TILE_IDS = new Map(TILES.map((t) => [t.key, t.id]));

function property(name: string, value: TiledValue): TiledProperty {
  const type =
    typeof value === 'number'
      ? Number.isInteger(value)
        ? 'int'
        : 'float'
      : typeof value === 'boolean'
        ? 'bool'
        : 'string';
  return { name, type, value };
}

export interface SketchObject {
  kind: string;
  name: string;
  /** Prefab tiles; a point when w/h are 0. */
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, TiledValue>;
}

/** A map under construction: tile keys per cell ('' = air), waypoints and objects. */
export class PrefabCanvas {
  readonly fg: string[];
  readonly bg: string[];
  readonly objects: SketchObject[] = [];
  readonly props: Record<string, TiledValue> = {};

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.fg = new Array<string>(width * height).fill('');
    this.bg = new Array<string>(width * height).fill('');
  }

  private check(key: string): void {
    if (key !== '' && !TILE_IDS.has(key)) throw new Error(`Unknown tile key ${key}`);
  }

  set(layer: 'fg' | 'bg', x: number, y: number, key: string): this {
    this.check(key);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return this;
    this[layer][y * this.width + x] = key;
    return this;
  }

  get(layer: 'fg' | 'bg', x: number, y: number): string {
    return this[layer][y * this.width + x] ?? '';
  }

  /** Fills an inclusive rectangle. */
  fill(layer: 'fg' | 'bg', x0: number, y0: number, x1: number, y1: number, key: string): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(layer, x, y, key);
    return this;
  }

  /** A filled ellipse (canopies). Only sets cells that are empty in that layer unless `over`. */
  ellipse(
    layer: 'fg' | 'bg',
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    key: string,
    over = false,
  ): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
        if (!over && this.get(layer, x, y) !== '') continue;
        this.set(layer, x, y, key);
      }
    }
    return this;
  }

  /**
   * A one-room house: walls, roof and floor of `wall`, back wall `back`, a light inside, and
   * 3-tall doors on the given sides. `floorY` is the floor row (null = stands on the map's ground:
   * its interior reaches down to `floorY - 1` and there's no floor row of its own).
   */
  house(o: {
    x0: number;
    x1: number;
    roofY: number;
    floorY: number;
    ownFloor: boolean;
    doors: readonly ('left' | 'right')[];
    wall?: string;
    back?: string;
    light?: string;
  }): this {
    const wall = o.wall ?? 'elderwood_planks';
    const back = o.back ?? 'elderwood_planks';
    const bottom = o.ownFloor ? o.floorY : o.floorY - 1;
    this.fill('bg', o.x0, o.roofY, o.x1, bottom, back);
    this.fill('fg', o.x0, o.roofY, o.x1, o.roofY, wall);
    if (o.ownFloor) this.fill('fg', o.x0, o.floorY, o.x1, o.floorY, wall);
    this.fill('fg', o.x0, o.roofY, o.x0, bottom, wall);
    this.fill('fg', o.x1, o.roofY, o.x1, bottom, wall);
    this.fill('fg', o.x0 + 1, o.roofY + 1, o.x1 - 1, o.floorY - 1, '');
    for (const side of o.doors) {
      const x = side === 'left' ? o.x0 : o.x1;
      for (let y = o.floorY - 3; y <= o.floorY - 1; y++) this.set('fg', x, y, 'door_closed');
    }
    if (o.light !== '') this.set('fg', o.x0 + 2, o.roofY + 2, o.light ?? 'torch');
    return this;
  }

  /** Waypoint: a point on the floor line under feet cell (x, feetY). */
  waypoint(
    name: string,
    x: number,
    feetY: number,
    tag: string,
    links: readonly string[] = [],
  ): this {
    this.objects.push({
      kind: 'waypoint',
      name,
      x,
      y: feetY + 1,
      w: 0,
      h: 0,
      props: { tag, links: links.join(',') },
    });
    return this;
  }

  /** Links waypoints in a chain (each to the next), both ways. */
  chain(names: readonly string[]): this {
    for (let i = 0; i + 1 < names.length; i++) this.link(names[i]!, names[i + 1]!);
    return this;
  }

  link(a: string, b: string): this {
    const add = (from: string, to: string) => {
      const o = this.objects.find((w) => w.kind === 'waypoint' && w.name === from);
      if (!o) throw new Error(`No waypoint ${from}`);
      const links = String(o.props.links ?? '')
        .split(',')
        .filter((s) => s.length > 0);
      if (!links.includes(to)) links.push(to);
      o.props.links = links.join(',');
    };
    add(a, b);
    add(b, a);
    return this;
  }

  point(
    kind: string,
    name: string,
    x: number,
    y: number,
    props: Record<string, TiledValue> = {},
  ): this {
    this.objects.push({ kind, name, x, y, w: 0, h: 0, props });
    return this;
  }

  area(
    kind: string,
    name: string,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    props: Record<string, TiledValue> = {},
  ): this {
    this.objects.push({ kind, name, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, props });
    return this;
  }

  toTiled(): TiledMap {
    const gids = (layer: string[]) =>
      layer.map((k) => (k === '' ? 0 : (TILE_IDS.get(k) ?? 0) + FIRST_GID));
    let id = 1;
    const objects: TiledObject[] = this.objects.map((o) => {
      const point = o.w === 0 && o.h === 0;
      // Points sit where the sketch says: a waypoint on its floor line (left edge + half a tile),
      // other points in the middle of their cell.
      const px = (o.x + 0.5) * TILE;
      const py = o.kind === 'waypoint' ? o.y * TILE : (o.y + 0.5) * TILE;
      return {
        id: id++,
        name: o.name,
        type: o.kind,
        x: point ? px : o.x * TILE,
        y: point ? py : o.y * TILE,
        width: o.w * TILE,
        height: o.h * TILE,
        ...(point ? { point: true } : {}),
        rotation: 0,
        visible: true,
        properties: Object.entries(o.props).map(([k, v]) => property(k, v)),
      } as TiledObject;
    });
    const layer = (lid: number, name: string, data: number[]) => ({
      id: lid,
      name,
      type: 'tilelayer',
      width: this.width,
      height: this.height,
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      data,
    });
    return {
      type: 'map',
      version: '1.10',
      tiledversion: '1.11.0',
      orientation: 'orthogonal',
      renderorder: 'right-down',
      infinite: false,
      width: this.width,
      height: this.height,
      tilewidth: TILE,
      tileheight: TILE,
      nextlayerid: 4,
      nextobjectid: id,
      properties: Object.entries(this.props).map(([k, v]) => property(k, v)),
      tilesets: [{ firstgid: FIRST_GID, source: TILESET_FILE }],
      layers: [
        layer(1, 'bg', gids(this.bg)),
        layer(2, 'fg', gids(this.fg)),
        {
          id: 3,
          name: 'objects',
          type: 'objectgroup',
          draworder: 'topdown',
          x: 0,
          y: 0,
          opacity: 1,
          visible: true,
          objects,
        },
      ],
    } as TiledMap;
  }
}

/** The shared Tiled tileset: one tile per game tile (local id = tile id), each with its `key`. */
export function buildTileset(): Record<string, unknown> {
  const rows = Math.ceil(TILES.length / TILESET_COLUMNS);
  return {
    type: 'tileset',
    version: '1.10',
    tiledversion: '1.11.0',
    name: 'gloamdeep',
    tilewidth: TILE,
    tileheight: TILE,
    tilecount: TILES.length,
    columns: TILESET_COLUMNS,
    margin: 0,
    spacing: 0,
    image: TILESET_IMAGE,
    imagewidth: TILESET_COLUMNS * TILE,
    imageheight: rows * TILE,
    tiles: TILES.map((t) => ({ id: t.id, properties: [property('key', t.key)] })),
  };
}
