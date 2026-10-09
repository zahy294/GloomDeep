import { describe, expect, it } from 'vitest';
import { DEPTH_LAYERS, SURFACE_BIOMES } from '../../../src/data/biomes';
import { Simulation } from '../../../src/sim/Simulation';
import { findDebugSpawn } from '../../../src/sim/world/debugSpawn';
import { generateWorld } from '../../../src/workers/worldgen/generateWorld';

const W = 700;
const H = 360;

describe('findDebugSpawn', () => {
  const { world } = Simulation.fromGenerated(generateWorld(W, H, 42));

  it.each(SURFACE_BIOMES.map((b, i) => [b.key, i] as const))(
    'spawns on the surface of %s, inside that biome',
    (key, index) => {
      const spawn = findDebugSpawn(world, { biome: key, spot: null });
      expect(spawn).not.toBeNull();
      if (!spawn) return;
      expect(world.surfaceBiome[spawn.x]).toBe(index);
      expect(spawn.y).toBe(world.skyline[spawn.x]);
    },
  );

  it('spot=cave gives a solid floor with dry headroom, well below the surface', () => {
    const spawn = findDebugSpawn(world, { biome: null, spot: 'cave' });
    expect(spawn).not.toBeNull();
    if (!spawn) return;
    expect(world.isSolid(spawn.x, spawn.y)).toBe(true);
    for (let dy = 1; dy <= 4; dy++) {
      expect(world.isSolid(spawn.x, spawn.y - dy)).toBe(false);
      expect(world.liquidType[(spawn.y - dy) * W + spawn.x]).toBe(0);
    }
    expect(spawn.y).toBeGreaterThan((world.skyline[spawn.x] ?? 0) + 20);
  });

  it.each(DEPTH_LAYERS.map((l, i) => [l.key, i] as const))(
    'a depth layer key (%s) spawns inside that layer',
    (key, index) => {
      const spawn = findDebugSpawn(world, { biome: key, spot: null });
      expect(spawn).not.toBeNull();
      if (!spawn) return;
      const top = world.layerTops[index] ?? 0;
      const bottom = world.layerTops[index + 1] ?? H;
      expect(spawn.y).toBeGreaterThanOrEqual(top);
      expect(spawn.y).toBeLessThan(bottom);
      expect(world.isSolid(spawn.x, spawn.y)).toBe(true);
      expect(world.isSolid(spawn.x, spawn.y - 1)).toBe(false);
    },
  );

  it('is deterministic and falls back to the world centre without a target', () => {
    const target = { biome: 'glowcap_grottos', spot: null } as const;
    expect(findDebugSpawn(world, target)).toEqual(findDebugSpawn(world, target));
    const centre = findDebugSpawn(world, { biome: null, spot: null });
    expect(centre).toEqual({ x: W / 2, y: world.skyline[W / 2] });
  });
});
