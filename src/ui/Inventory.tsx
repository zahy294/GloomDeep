import { useEffect, useState } from 'preact/hooks';
import { ATLAS_PIXEL_SIZE, framePixelOffset, itemIconFrame } from '../render/itemIcons';
import { AtlasUrl } from '../render/scenes/keys';
import type { InventoryView, UiBridge } from './bridge';

type Slot = InventoryView['slots'][number];

/** An item icon cut from the tile atlas with CSS, scaled by whole game pixels (--px). */
function ItemIcon({ itemId }: { itemId: number }) {
  const frame = itemIconFrame(itemId);
  if (frame < 0) return null;
  const { x, y } = framePixelOffset(frame);
  return (
    <span
      class="item-icon"
      style={{
        backgroundImage: `url(${AtlasUrl.tiles})`,
        backgroundPosition: `calc(var(--px) * ${-x}) calc(var(--px) * ${-y})`,
        backgroundSize: `calc(var(--px) * ${ATLAS_PIXEL_SIZE.width}) calc(var(--px) * ${ATLAS_PIXEL_SIZE.height})`,
      }}
    />
  );
}

function SlotView({
  slot,
  index,
  selected,
  marked,
  onClick,
}: {
  slot: Slot;
  index: number;
  selected: boolean;
  marked?: boolean;
  onClick: () => void;
}) {
  const classes = ['slot', selected ? 'selected' : '', marked ? 'marked' : ''].join(' ');
  return (
    <button
      class={classes}
      title={slot?.name ?? ''}
      onClick={onClick}
      aria-label={`Slot ${index + 1}`}
    >
      {slot && <ItemIcon itemId={slot.itemId} />}
      {slot && slot.count > 1 && <span class="count">{slot.count}</span>}
    </button>
  );
}

/** Events that tell the game the pointer is over UI, so clicks don't mine behind the panel. */
function pointerGuard(bridge: UiBridge) {
  return {
    onMouseEnter: () => bridge.commands.emit('pointerOverUi', { over: true }),
    onMouseLeave: () => bridge.commands.emit('pointerOverUi', { over: false }),
  };
}

export function Hotbar({ bridge, view }: { bridge: UiBridge; view: InventoryView }) {
  return (
    <div class="hotbar interactive" {...pointerGuard(bridge)}>
      {view.slots.slice(0, view.hotbarSize).map((slot, i) => (
        <SlotView
          key={i}
          slot={slot}
          index={i}
          selected={i === view.selected}
          onClick={() => bridge.commands.emit('selectSlot', { slot: i })}
        />
      ))}
    </div>
  );
}

/**
 * Basic inventory panel (full drag-and-drop, sorting and tooltips come in M6): click one slot, then
 * another, to swap them.
 */
export function InventoryPanel({ bridge, view }: { bridge: UiBridge; view: InventoryView }) {
  const [picked, setPicked] = useState<number | null>(null);
  // Unmounting under the cursor fires no mouseleave; release the pointer guard explicitly.
  useEffect(() => () => bridge.commands.emit('pointerOverUi', { over: false }), [bridge]);
  const click = (i: number) => {
    if (picked === null) {
      if (view.slots[i]) setPicked(i);
      return;
    }
    if (picked !== i) bridge.commands.emit('swapSlots', { a: picked, b: i });
    setPicked(null);
  };
  return (
    <div class="inventory-panel interactive" {...pointerGuard(bridge)}>
      <div class="panel-title">Inventory</div>
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
            marked={i === picked}
            onClick={() => click(i)}
          />
        ))}
      </div>
    </div>
  );
}
