import type { IconRect, UiBridge } from './bridge';

/** An item icon cut from a pack image with CSS, scaled by whole game pixels (--px). */
export function ItemIcon({
  itemId,
  icons,
}: {
  itemId: number;
  icons: readonly (IconRect | null)[];
}) {
  const icon = icons[itemId];
  if (!icon) return <span class="item-icon" />;
  return (
    <span
      class="item-icon"
      style={{
        backgroundImage: `url(${icon.url})`,
        backgroundPosition: `calc(var(--px) * ${-icon.x}) calc(var(--px) * ${-icon.y})`,
        backgroundSize: `calc(var(--px) * ${icon.sheetWidth}) calc(var(--px) * ${icon.sheetHeight})`,
      }}
    />
  );
}

/** Events that tell the game the pointer is over UI, so clicks don't mine behind the panel. */
export function pointerGuard(bridge: UiBridge) {
  return {
    onMouseEnter: () => bridge.commands.emit('pointerOverUi', { over: true }),
    onMouseLeave: () => bridge.commands.emit('pointerOverUi', { over: false }),
  };
}
