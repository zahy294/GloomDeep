import { describe, expect, it } from 'vitest';
import { FLARE, HEALTH, LENS_FX, TILE_SIZE } from '../../../src/config';
import { itemId } from '../../../src/data/items';
import { tileId } from '../../../src/data/tiles';
import { Simulation } from '../../../src/sim/Simulation';
import { AIR } from '../../../src/sim/world/World';
import { ownedLenses } from '../../../src/sim/systems/LensSystem';

const T = TILE_SIZE;
const STONE = tileId('stone');

/** 60×30: stone below row 20 (with walls behind the open part); the player at column 10. */
function sim(): Simulation {
  return new Simulation({
    size: { width: 60, height: 30, chunkSize: 16 },
    generate: (w) => {
      for (let y = 0; y < 30; y++) {
        for (let x = 0; x < 60; x++) {
          if (y >= 20) w.set(x, y, STONE);
          else w.setBg(x, y, STONE);
        }
      }
      return { spawnX: 10.5 * T, spawnY: 20 * T };
    },
    startDayFraction: 0, // midnight: only the lantern lights things
  });
}

function step(s: Simulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) s.update(1000 / 60);
}

describe('lenses', () => {
  it('Amber always; others when their lens item is carried; Q cycles them', () => {
    const s = sim();
    expect(ownedLenses(s.inventory).map((l) => l.key)).toEqual(['amber']);
    s.giveItems([
      { item: 'azure_lens', count: 1 },
      { item: 'verdant_lens', count: 1 },
    ]);
    expect(ownedLenses(s.inventory).map((l) => l.key)).toEqual(['amber', 'azure', 'verdant']);
    s.input.press('cycleLens');
    step(s, 1 / 60);
    expect(s.player.lens).toBe('azure');
    s.input.press('cycleLens');
    step(s, 1 / 60);
    expect(s.player.lens).toBe('verdant');
    // Losing the lens item falls back to Amber.
    s.inventory.remove(itemId('verdant_lens'), 1);
    step(s, 1 / 60);
    expect(s.player.lens).toBe('amber');
  });

  it('Amber heals while the lantern burns', () => {
    const s = sim();
    s.player.health = 50;
    s.player.sinceDamage = 0; // no natural regeneration yet
    step(s, 2);
    expect(s.player.health).toBeCloseTo(50 + LENS_FX.amberHealPerSecond * 2, 0);
    expect(s.player.health).toBeLessThan(HEALTH.max);
  });

  it('Azure reveals veiled ore and spirit platforms in its light', () => {
    const s = sim();
    s.world.set(14, 20, tileId('veiled_lumen'));
    s.world.set(14, 16, tileId('veiled_spirit_platform'));
    s.world.set(40, 20, tileId('veiled_lumen')); // out of the cone
    s.giveItems([{ item: 'azure_lens', count: 1 }]);
    s.player.lens = 'azure';
    s.input.setAim(14.5 * T, 20.5 * T);
    step(s, 0.5);
    expect(s.world.get(14, 20)).toBe(tileId('lumen_crystal'));
    expect(s.world.get(40, 20)).toBe(tileId('veiled_lumen'));
    s.input.setAim(14.5 * T, 16.5 * T);
    step(s, 0.5);
    expect(s.world.get(14, 16)).toBe(tileId('spirit_platform'));
  });

  it('veiled spirit platforms can be walked through and are not mined', () => {
    const s = sim();
    s.world.set(12, 19, tileId('veiled_spirit_platform'));
    expect(s.world.isPlatform(12, 19)).toBe(false);
    s.input.setAim(12.5 * T, 19.5 * T);
    s.input.setHeld('useItem', true);
    step(s, 1);
    expect(s.world.get(12, 19)).toBe(tileId('veiled_spirit_platform'));
  });

  it('Verdant grows grass on soil and flowers on grass in its light', () => {
    const s = sim();
    for (let x = 12; x < 22; x++) s.world.set(x, 20, tileId('forest_soil'));
    s.giveItems([{ item: 'verdant_lens', count: 1 }]);
    s.player.lens = 'verdant';
    s.input.setAim(17 * T, 20 * T);
    step(s, 20);
    const row = Array.from({ length: 10 }, (_, i) => s.world.get(12 + i, 20));
    const above = Array.from({ length: 10 }, (_, i) => s.world.get(12 + i, 19));
    expect(row.filter((id) => id === tileId('elderglade_grass')).length).toBeGreaterThan(3);
    expect(above.some((id) => id !== AIR)).toBe(true);
  });
});

describe('flares', () => {
  it('right-click throws one towards the cursor; it lands, lights the area and burns out', () => {
    const s = sim();
    s.player.lanternOn = false;
    s.giveItems([{ item: 'flare', count: 3 }]);
    const slot = s.inventory.slots.findIndex((x) => x?.itemId === itemId('flare'));
    s.enqueue({ type: 'selectSlot', slot });
    s.input.setFocus(20 * T, 15 * T);
    s.input.setAim(30 * T, 12 * T);
    s.input.setHeld('useAlt', true);
    step(s, 1 / 30);
    s.input.setHeld('useAlt', false);
    expect(s.flares).toHaveLength(1);
    expect(s.inventory.count(itemId('flare'))).toBe(2);

    step(s, 4);
    const flare = s.flares[0];
    expect(flare).toBeDefined();
    const fx = Math.floor(((flare?.body.x ?? 0) + FLARE.size / 2) / T);
    const fy = Math.floor(((flare?.body.y ?? 0) + FLARE.size / 2) / T);
    expect(fx).toBeGreaterThan(12);
    expect(fy).toBe(19); // resting on the floor
    expect(flare?.body.vx).toBe(0);
    expect(s.world.lightR[s.world.index(fx, fy)] ?? 0).toBeGreaterThan(150);

    step(s, FLARE.lifeSeconds);
    expect(s.flares).toHaveLength(0);
  });
});
