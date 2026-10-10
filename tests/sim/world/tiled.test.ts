import { describe, expect, it } from 'vitest';
import { PREFABS, prefabByKey } from '../../../src/data/prefabs';
import { TILES, tileId } from '../../../src/data/tiles';
import { stampPrefabAt, type StampTarget } from '../../../src/sim/world/prefabs';
import { parseTiledPrefab, prefabGroundRow, type TiledMap } from '../../../src/sim/world/tiled';

const tileset = {
  tiles: [
    { id: 0, properties: [{ name: 'key', type: 'string', value: 'stone' }] },
    { id: 1, properties: [{ name: 'key', type: 'string', value: 'torch' }] },
  ],
};

function map(extra: Partial<TiledMap> = {}): TiledMap {
  return {
    width: 3,
    height: 2,
    tilewidth: 16,
    tileheight: 16,
    tilesets: [{ firstgid: 5, source: '../somewhere/shared.json' }],
    layers: [
      { name: 'fg', type: 'tilelayer', data: [0, 6, 0, 5, 5, 5 | 0x80000000] },
      {
        name: 'objects',
        type: 'objectgroup',
        objects: [
          {
            id: 1,
            name: 'a',
            type: 'waypoint',
            x: 8,
            y: 32,
            point: true,
            properties: [
              { name: 'tag', value: 'plaza' },
              { name: 'links', value: 'b' },
            ],
          },
          { id: 2, name: 'b', class: 'waypoint', x: 40, y: 32, point: true, properties: [] },
          { id: 3, name: 'ward', type: 'district', x: 16, y: 0, width: 32, height: 16 },
        ],
      },
    ],
    ...extra,
  };
}

describe('Tiled prefabs', () => {
  it('maps gids to tile keys through the tileset, ignoring flip flags', () => {
    const p = parseTiledPrefab('t', map(), { 'shared.json': tileset });
    expect(p.fg).toEqual(['', 'torch', '', 'stone', 'stone', 'stone']);
    expect(p.bg.every((k) => k === '')).toBe(true);
  });

  it('reads waypoints (feet cell above the floor line), links and areas', () => {
    const p = parseTiledPrefab('t', map(), { 'shared.json': tileset });
    expect(p.waypoints).toEqual([
      { name: 'a', x: 0, y: 1, tag: 'plaza', links: ['b'] },
      { name: 'b', x: 2, y: 1, tag: '', links: [] },
    ]);
    expect(p.objects).toEqual([
      { kind: 'district', name: 'ward', x0: 1, y0: 0, x1: 2, y1: 0, props: {} },
    ]);
  });

  it('rejects unknown tilesets, unknown gids and broken links', () => {
    expect(() => parseTiledPrefab('t', map())).toThrow(/tileset/);
    const badGid = map({ layers: [{ name: 'fg', type: 'tilelayer', data: [9, 0, 0, 0, 0, 0] }] });
    expect(() => parseTiledPrefab('t', badGid, { 'shared.json': tileset })).toThrow(/gid 9/);
    const m = map();
    const objects = m.layers[1]?.objects ?? [];
    const badLink = map({
      layers: [
        m.layers[0]!,
        {
          name: 'objects',
          type: 'objectgroup',
          objects: [{ ...objects[0]!, properties: [{ name: 'links', value: 'nobody' }] }],
        },
      ],
    });
    expect(() => parseTiledPrefab('t', badLink, { 'shared.json': tileset })).toThrow(/nobody/);
  });

  it('the shipped prefabs parse, with connected waypoint graphs', () => {
    for (const prefab of Object.values(PREFABS)) {
      if (prefab.waypoints.length === 0) continue;
      const byName = new Map(prefab.waypoints.map((w) => [w.name, w]));
      const seen = new Set<string>([prefab.waypoints[0]!.name]);
      const queue = [prefab.waypoints[0]!.name];
      while (queue.length > 0) {
        for (const next of byName.get(queue.shift()!)?.links ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size, prefab.key).toBe(prefab.waypoints.length);
      // Links go both ways (a one-way link could strand folk).
      for (const w of prefab.waypoints) {
        for (const l of w.links) expect(byName.get(l)?.links, `${w.name} → ${l}`).toContain(w.name);
      }
      // Every waypoint stands in open space on something to stand on.
      for (const w of prefab.waypoints) {
        const at = (x: number, y: number) => prefab.fg[y * prefab.width + x] ?? '';
        const open = (k: string) => k === '' || k === 'door_closed' || !TILES[tileId(k)]?.solid;
        expect(open(at(w.x, w.y)), `${prefab.key} ${w.name}`).toBe(true);
        expect(at(w.x, w.y + 1), `${prefab.key} ${w.name} floor`).not.toBe('');
      }
    }
  });

  it('stamps every cell and fills a foundation under the bottom row', () => {
    const cottage = prefabByKey('cottage');
    const W = 20;
    const H = 20;
    const fg = new Uint16Array(W * H);
    const bg = new Uint16Array(W * H);
    const stone = tileId('stone');
    fg.fill(stone, 15 * W); // ground from row 15 down
    const target: StampTarget = {
      width: W,
      height: H,
      setFg: (x, y, id) => (fg[y * W + x] = id),
      setBg: (x, y, id) => (bg[y * W + x] = id),
      fgAt: (x, y) => fg[y * W + x] ?? 0,
    };
    stampPrefabAt(target, cottage, 2, 4); // bottom row 10, ground at 15: 4 rows of foundation
    expect(fg[4 * W + 2]).toBe(tileId('elderwood_planks'));
    expect(fg[5 * W + 4]).toBe(0);
    expect(bg[5 * W + 4]).toBe(tileId('elderwood_planks'));
    for (let y = 11; y < 15; y++) expect(fg[y * W + 5]).toBe(tileId('forest_soil'));
    expect(prefabGroundRow(cottage)).toBe(cottage.height - 1);
    expect(prefabGroundRow(prefabByKey('canopyhold'))).toBe(48);
  });
});
