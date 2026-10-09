import { useEffect, useState } from 'preact/hooks';
import type { TargetedMouseEvent } from 'preact';
import type { IconRect, InventoryView, StackView, UiBridge } from './bridge';
import { Crafting } from './Crafting';
import { itemTooltip } from './craftingHelpers';
import { ItemIcon, pointerGuard } from './ItemIcon';
import type { SlotButton } from '../sim/inventory/Inventory';

interface SlotProps {
  slot: StackView | null;
  index: number;
  selected: boolean;
  icons: readonly (IconRect | null)[];
  onMouseDown?: (e: TargetedMouseEvent<HTMLElement>) => void;
  onMouseUp?: (e: TargetedMouseEvent<HTMLElement>) => void;
  onClick?: () => void;
  onHover?: (itemId: number | null) => void;
}

function SlotView({ slot, index, selected, icons, ...on }: SlotProps) {
  return (
    <button
      class={`slot${selected ? ' selected' : ''}`}
      aria-label={`Slot ${index + 1}`}
      onMouseDown={on.onMouseDown}
      onMouseUp={on.onMouseUp}
      onClick={on.onClick}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => on.onHover?.(slot ? slot.itemId : null)}
      onMouseLeave={() => on.onHover?.(null)}
    >
      {slot && <ItemIcon itemId={slot.itemId} icons={icons} />}
      {slot && slot.count > 1 && <span class="count">{slot.count}</span>}
      {index < 10 && <span class="slot-key">{(index + 1) % 10}</span>}
    </button>
  );
}

export function Hotbar({
  bridge,
  view,
  icons,
}: {
  bridge: UiBridge;
  view: InventoryView;
  icons: readonly (IconRect | null)[];
}) {
  return (
    <div class="hotbar interactive" {...pointerGuard(bridge)}>
      {view.slots.slice(0, view.hotbarSize).map((slot, i) => (
        <SlotView
          key={i}
          slot={slot}
          index={i}
          selected={i === view.selected}
          icons={icons}
          onClick={() => bridge.commands.emit('selectSlot', { slot: i })}
        />
      ))}
    </div>
  );
}

/** The mouse position inside the overlay, in CSS pixels (for the held stack and tooltips). */
function useMouse(): { x: number; y: number } {
  const [pos, setPos] = useState({ x: -1000, y: -1000 });
  useEffect(() => {
    const overlay = document.getElementById('ui');
    const move = (e: MouseEvent) => {
      const r = overlay?.getBoundingClientRect();
      setPos({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) });
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, []);
  return pos;
}

function Tooltip({ itemId, x, y }: { itemId: number; x: number; y: number }) {
  const [title, ...rest] = itemTooltip(itemId);
  return (
    <div class="tooltip" style={{ left: `${x}px`, top: `${y}px` }}>
      <div class="tooltip-title">{title}</div>
      {rest.map((line, i) => (
        <div key={i} class="tooltip-line">
          {line}
        </div>
      ))}
    </div>
  );
}

/**
 * The inventory screen (E): the 40-slot grid and the crafting panel. Drag and drop: pressing a
 * slot picks its stack up onto the cursor (right button: half), releasing over another slot puts
 * it down (merge, swap); click-and-click works the same way. Shift-click moves a stack between
 * hotbar and bag. Releasing the held stack outside the panels throws it into the world.
 */
export function InventoryScreen({
  bridge,
  view,
  icons,
}: {
  bridge: UiBridge;
  view: InventoryView;
  icons: readonly (IconRect | null)[];
}) {
  const mouse = useMouse();
  const [hover, setHover] = useState<number | null>(null);
  const [downSlot, setDownSlot] = useState<number | null>(null);
  // Unmounting under the cursor fires no mouseleave; release the pointer guard explicitly.
  useEffect(() => () => bridge.commands.emit('pointerOverUi', { over: false }), [bridge]);

  const button = (e: MouseEvent): SlotButton => (e.button === 2 ? 'secondary' : 'primary');
  const down = (i: number) => (e: TargetedMouseEvent<HTMLElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    setDownSlot(i);
    bridge.commands.emit('slotClick', { slot: i, button: button(e), quick: e.shiftKey });
  };
  const up = (i: number) => (e: TargetedMouseEvent<HTMLElement>) => {
    // A press on one slot and a release on another is a drag: drop the stack here.
    if (downSlot !== null && downSlot !== i && e.button === 0 && !e.shiftKey) {
      bridge.commands.emit('slotClick', { slot: i, button: 'primary', quick: false });
    }
    setDownSlot(null);
  };

  return (
    <>
      <div class="inventory-screen">
        <div class="inventory-panel interactive" {...pointerGuard(bridge)}>
          <div class="panel-header">
            <span class="panel-title">Inventory</span>
            <button
              class="panel-button"
              onClick={() => bridge.commands.emit('sortInventory', {})}
              title="Sort the bag (the hotbar stays as it is)"
            >
              Sort
            </button>
          </div>
          <div
            class="inventory-grid"
            style={{ gridTemplateColumns: `repeat(${view.hotbarSize}, auto)` }}
          >
            {view.slots.map((slot, i) => (
              <SlotView
                key={i}
                slot={slot}
                index={i}
                selected={i === view.selected}
                icons={icons}
                onMouseDown={down(i)}
                onMouseUp={up(i)}
                onHover={setHover}
              />
            ))}
          </div>
          <div class="panel-hint">
            Drag to move · right-click: half / one · Shift-click: hotbar ↔ bag
          </div>
        </div>
        <Crafting bridge={bridge} view={view} icons={icons} onHover={setHover} />
      </div>
      {view.cursor && (
        <div class="held-stack" style={{ left: `${mouse.x}px`, top: `${mouse.y}px` }}>
          <ItemIcon itemId={view.cursor.itemId} icons={icons} />
          {view.cursor.count > 1 && <span class="count">{view.cursor.count}</span>}
        </div>
      )}
      {!view.cursor && hover !== null && <Tooltip itemId={hover} x={mouse.x} y={mouse.y} />}
    </>
  );
}
