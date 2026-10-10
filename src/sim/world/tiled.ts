/**
 * Tiled JSON prefabs (plan 1.7 "Technical approach", plan 3.2 step 7): towns, ruins and small
 * structures are drawn in Tiled and saved as JSON maps in src/data/prefabs/. This module turns a
 * map into plain data — tile layers by tile key, and the objects that carry gameplay meaning
 * (waypoints and their links, areas, points). Pure TypeScript: worldgen runs it in a worker.
 *
 * Map conventions (see src/data/prefabs/README.md):
 * - tile layers `bg` (back walls) and `fg` (blocks, lamps, doors); an empty cell is air;
 * - tiles come from the shared tileset, whose tiles carry a `key` property (src/data/tiles.ts);
 * - object layer objects use their class (Tiled's `type`/`class`) as their kind:
 *   `waypoint` points (name, `tag`, `links` = comma-separated names), `district` rectangles,
 *   `lift` points (`to` = the other stop's name), and any other point or rectangle;
 * - map properties: `foundation` (tile key under the bottom row), `groundRow` (the map row that
 *   sits on the world's ground row, surface prefabs).
 */

export type TiledValue = string | number | boolean;

export interface TiledProperty {
  readonly name: string;
  readonly type?: string;
  readonly value: TiledValue;
}

export interface TiledObject {
  readonly id: number;
  readonly name?: string;
  readonly type?: string;
  readonly class?: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly point?: boolean;
  readonly properties?: readonly TiledProperty[];
}

export interface TiledLayer {
  readonly name: string;
  readonly type: string;
  readonly width?: number;
  readonly height?: number;
  readonly data?: readonly number[];
  readonly objects?: readonly TiledObject[];
}

export interface TiledTileset {
  readonly tiles?: readonly {
    readonly id: number;
    readonly properties?: readonly TiledProperty[];
  }[];
}

export interface TiledTilesetRef {
  readonly firstgid: number;
  readonly source?: string;
  readonly tiles?: TiledTileset['tiles'];
}

export interface TiledMap {
  readonly width: number;
  readonly height: number;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly properties?: readonly TiledProperty[];
  readonly layers: readonly TiledLayer[];
  readonly tilesets: readonly TiledTilesetRef[];
}

/** A stop on a prefab's waypoint graph (prefab tiles): the cell the feet stand in. */
export interface PrefabWaypoint {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly tag: string;
  readonly links: readonly string[];
}

/** A rectangle (prefab tiles, inclusive) or a point (x0 = x1, y0 = y1) with a kind and properties. */
export interface PrefabObject {
  readonly kind: string;
  readonly name: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly props: Readonly<Record<string, TiledValue>>;
}

/** A parsed prefab: tile keys per cell ('' = air) plus its gameplay objects. */
export interface Prefab {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly fg: readonly string[];
  readonly bg: readonly string[];
  readonly waypoints: readonly PrefabWaypoint[];
  readonly objects: readonly PrefabObject[];
  readonly props: Readonly<Record<string, TiledValue>>;
}

/** Tiled stores flip/rotation flags in the top bits of a gid. */
const GID_MASK = 0x0fffffff;

function props(list: readonly TiledProperty[] | undefined): Record<string, TiledValue> {
  const out: Record<string, TiledValue> = {};
  for (const p of list ?? []) out[p.name] = p.value;
  return out;
}

/**
 * Parses a Tiled map. `tilesets` resolves external tilesets by their `source` (the shared
 * tileset is imported once and passed in). Throws on anything the game could not stamp.
 */
export function parseTiledPrefab(
  key: string,
  map: TiledMap,
  tilesets: Readonly<Record<string, TiledTileset>> = {},
): Prefab {
  const { width, height } = map;
  // gid → tile key, from every tileset's `key` property.
  const keys = new Map<number, string>();
  for (const ref of map.tilesets) {
    const set = ref.source !== undefined ? tilesets[baseName(ref.source)] : ref;
    if (!set) throw new Error(`Prefab ${key}: unknown tileset ${ref.source ?? '(embedded)'}`);
    for (const tile of set.tiles ?? []) {
      const k = props(tile.properties).key;
      if (typeof k === 'string') keys.set(ref.firstgid + tile.id, k);
    }
  }
  const layer = (name: string): string[] => {
    const out = new Array<string>(width * height).fill('');
    const found = map.layers.find((l) => l.type === 'tilelayer' && l.name === name);
    if (!found) return out;
    const data = found.data ?? [];
    if (data.length !== width * height) {
      throw new Error(
        `Prefab ${key}: layer ${name} has ${data.length} cells, expected ${width * height}`,
      );
    }
    for (let i = 0; i < data.length; i++) {
      const gid = (data[i] ?? 0) & GID_MASK;
      if (gid === 0) continue;
      const k = keys.get(gid);
      if (k === undefined) throw new Error(`Prefab ${key}: gid ${gid} has no tile key`);
      out[i] = k === 'air' ? '' : k;
    }
    return out;
  };

  const tw = map.tilewidth;
  const th = map.tileheight;
  const waypoints: PrefabWaypoint[] = [];
  const objects: PrefabObject[] = [];
  for (const l of map.layers) {
    if (l.type !== 'objectgroup') continue;
    for (const o of l.objects ?? []) {
      const kind = o.type || o.class || '';
      const p = props(o.properties);
      const name = o.name ?? '';
      const area = !o.point && (o.width ?? 0) > 0 && (o.height ?? 0) > 0;
      if (kind === 'waypoint') {
        // A waypoint point sits on the floor line: the feet cell is the one above it.
        waypoints.push({
          name,
          x: Math.floor(o.x / tw),
          y: Math.round(o.y / th) - 1,
          tag: typeof p.tag === 'string' ? p.tag : '',
          links: splitList(p.links),
        });
        continue;
      }
      const x0 = Math.floor(o.x / tw);
      const y0 = Math.floor(o.y / th);
      objects.push({
        kind,
        name,
        x0,
        y0,
        x1: area ? Math.ceil((o.x + (o.width ?? 0)) / tw) - 1 : x0,
        y1: area ? Math.ceil((o.y + (o.height ?? 0)) / th) - 1 : y0,
        props: p,
      });
    }
  }
  const names = new Set(waypoints.map((w) => w.name));
  for (const w of waypoints) {
    for (const link of w.links) {
      if (!names.has(link))
        throw new Error(`Prefab ${key}: waypoint ${w.name} links to unknown ${link}`);
    }
  }
  return {
    key,
    width,
    height,
    fg: layer('fg'),
    bg: layer('bg'),
    waypoints,
    objects,
    props: props(map.properties),
  };
}

function splitList(value: TiledValue | undefined): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/** The map row that rests on the world's ground row (surface prefabs); default: the bottom row. */
export function prefabGroundRow(prefab: Prefab): number {
  const g = prefab.props.groundRow;
  return typeof g === 'number' ? g : prefab.height - 1;
}
