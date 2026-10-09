import { useMemo, useState } from 'preact/hooks';
import type { TargetedKeyboardEvent } from 'preact';
import type { IconRect, InventoryView, UiBridge } from './bridge';
import { recipeRows, stationName } from './craftingHelpers';
import { ItemIcon, pointerGuard } from './ItemIcon';

/** Typing in the search box must not move the player or close the panel (E). */
function keepKeys(e: TargetedKeyboardEvent<HTMLInputElement>): void {
  e.stopPropagation();
  if (e.key === 'Escape') e.currentTarget.blur();
}

/**
 * Crafting panel (plan 5): recipes whose station is in reach, a search box, and (optionally)
 * every recipe with the station it needs. Click Craft for one; Shift-click for as many as the
 * materials allow.
 */
export function Crafting({
  bridge,
  view,
  icons,
  onHover,
}: {
  bridge: UiBridge;
  view: InventoryView;
  icons: readonly (IconRect | null)[];
  onHover: (itemId: number | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(
    () => recipeRows(view.slots, view.stations, query, showAll),
    [view.slots, view.stations, query, showAll],
  );
  const stations = view.stations.map(stationName).join(', ');

  return (
    <div class="crafting-panel interactive" {...pointerGuard(bridge)}>
      <div class="panel-header">
        <span class="panel-title">Crafting</span>
        <label class="panel-toggle">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.currentTarget.checked)}
          />
          All
        </label>
      </div>
      <input
        class="crafting-search"
        type="search"
        placeholder="Search recipes"
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={keepKeys}
        onKeyUp={(e) => e.stopPropagation()}
        aria-label="Search recipes"
      />
      <div class="crafting-stations">Near: {stations || 'nothing (hand crafting)'}</div>
      <ul class="recipe-list">
        {rows.length === 0 && <li class="recipe-empty">No recipes</li>}
        {rows.map((row) => {
          const { recipe } = row;
          const ready = row.craftable > 0;
          return (
            <li key={recipe.key} class={`recipe${ready ? ' ready' : ''}`}>
              <span
                class="recipe-output"
                onMouseEnter={() => onHover(recipe.output.itemId)}
                onMouseLeave={() => onHover(null)}
              >
                <ItemIcon itemId={recipe.output.itemId} icons={icons} />
                {recipe.output.count > 1 && <span class="count">{recipe.output.count}</span>}
              </span>
              <span class="recipe-body">
                <span class="recipe-name">{row.name}</span>
                <span class="recipe-inputs">
                  {recipe.inputs.map((input, k) => {
                    const have = row.have[k] ?? 0;
                    return (
                      <span
                        key={input.itemId}
                        class={`recipe-input${have >= input.count ? '' : ' missing'}`}
                        onMouseEnter={() => onHover(input.itemId)}
                        onMouseLeave={() => onHover(null)}
                      >
                        <ItemIcon itemId={input.itemId} icons={icons} />
                        {have}/{input.count}
                      </span>
                    );
                  })}
                  {!row.stationOk && recipe.station && (
                    <span class="recipe-station">needs {stationName(recipe.station)}</span>
                  )}
                </span>
              </span>
              <button
                class="panel-button"
                disabled={!ready}
                title={ready ? `Shift-click: craft ${row.craftable}` : undefined}
                onClick={(e) =>
                  bridge.commands.emit('craft', {
                    recipe: recipe.key,
                    times: e.shiftKey ? row.craftable : 1,
                  })
                }
              >
                Craft
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
