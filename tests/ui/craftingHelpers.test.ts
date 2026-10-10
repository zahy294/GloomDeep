import { describe, expect, it } from 'vitest';
import { itemId } from '../../src/data/items';
import {
  itemTooltip,
  pickaxeForTier,
  recipeRows,
  stationName,
  withArticle,
} from '../../src/ui/craftingHelpers';

const stack = (key: string, count: number) => ({ itemId: itemId(key), count });

describe('recipeRows', () => {
  const slots = [stack('living_wood', 2), null, stack('elderwood_planks', 9)];

  it('lists hand recipes plus those of stations in reach, craftable first', () => {
    const hand = recipeRows(slots, [], '', false);
    expect(hand.every((r) => r.recipe.station === null)).toBe(true);
    expect(hand[0]?.craftable).toBeGreaterThan(0);
    const firstBlocked = hand.findIndex((r) => r.craftable === 0);
    expect(hand.slice(firstBlocked).every((r) => r.craftable === 0)).toBe(true);

    const bench = recipeRows(slots, ['workbench'], '', false);
    const pick = bench.find((r) => r.recipe.key === 'elderwood_pickaxe');
    expect(pick?.craftable).toBe(1);
    expect(pick?.have).toEqual([9]);
  });

  it('shows recipes for missing stations only with "All", never craftable', () => {
    expect(recipeRows(slots, [], '', false).some((r) => r.recipe.key === 'copper_bar')).toBe(false);
    const all = recipeRows([stack('copper_ore', 10)], [], '', true);
    const bar = all.find((r) => r.recipe.key === 'copper_bar');
    expect(bar?.stationOk).toBe(false);
    expect(bar?.craftable).toBe(0);
  });

  it('filters by the output name, ignoring case', () => {
    const rows = recipeRows(slots, ['workbench', 'furnace', 'anvil'], 'PICK', false);
    expect(rows.map((r) => r.recipe.key).sort()).toEqual([
      'copper_pickaxe',
      'elderwood_pickaxe',
      'iron_pickaxe',
      'moonsilver_pickaxe',
    ]);
  });
});

describe('recipeRows locked recipes', () => {
  it('hides recipes that are not learned yet', () => {
    const slots = [stack('elderwood_planks', 9)];
    const open = recipeRows(slots, ['workbench'], '', true);
    expect(open.some((r) => r.recipe.key === 'elderwood_pickaxe')).toBe(true);
    const locked = recipeRows(slots, ['workbench'], '', true, ['elderwood_pickaxe']);
    expect(locked.some((r) => r.recipe.key === 'elderwood_pickaxe')).toBe(false);
    expect(locked.length).toBe(open.length - 1);
  });
});

describe('item text', () => {
  it('describes tools, stations, blocks and materials', () => {
    expect(itemTooltip(itemId('copper_pickaxe'))).toEqual([
      'Copper Pickaxe',
      'Pickaxe · tier 2 · power 1.35',
      'Strong enough for iron.',
    ]);
    expect(itemTooltip(itemId('workbench'))[1]).toMatch(/station/);
    expect(itemTooltip(itemId('torch'))[1]).toMatch(/Light/);
    expect(itemTooltip(itemId('stone'))[1]).toMatch(/Block/);
    expect(itemTooltip(itemId('iron_bar'))).toEqual(['Iron Bar', 'Material']);
  });

  it('names the weakest pickaxe for a tier, with the right article', () => {
    expect(pickaxeForTier(1)).toBe('Elderwood Pickaxe');
    expect(pickaxeForTier(3)).toBe('Iron Pickaxe');
    expect(pickaxeForTier(99)).toBeNull();
    expect(withArticle('Elderwood Pickaxe')).toBe('an Elderwood Pickaxe');
    expect(withArticle('Copper Pickaxe')).toBe('a Copper Pickaxe');
    expect(stationName('anvil')).toBe('Anvil');
  });
});
