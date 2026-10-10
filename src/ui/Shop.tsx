import { ITEMS } from '../data/items';
import type { IconRect, ShopView, UiBridge } from './bridge';
import { ItemIcon, pointerGuard } from './ItemIcon';

const itemName = (id: number): string => ITEMS[id]?.name ?? '?';

/** M11 trader's stall: buy what they offer now, sell whole stacks you carry. */
export function Shop({
  bridge,
  shop,
  icons,
}: {
  bridge: UiBridge;
  shop: ShopView;
  icons: readonly (IconRect | null)[];
}) {
  return (
    <div class="shop-panel interactive" {...pointerGuard(bridge)}>
      <div class="panel-header">
        <span class="panel-title">
          {shop.name} <span class="hud-dim">· {shop.role}</span>
        </span>
        <button class="panel-button" onClick={() => bridge.commands.emit('closePanel', {})}>
          Close
        </button>
      </div>
      <div class="shop-terms">{shop.terms}</div>
      <div class="shop-purse">
        <span class="coin" aria-hidden="true" /> {shop.glimmer} glimmer
      </div>
      <div class="shop-heading">Buy</div>
      {shop.offers.length === 0 && <div class="panel-hint">Nothing for sale right now.</div>}
      {shop.offers.map((o) => (
        <button
          key={o.index}
          class="panel-button shop-row"
          disabled={!o.affordable}
          onClick={() => bridge.commands.emit('buy', { npcId: shop.npcId, offer: o.index })}
        >
          <ItemIcon itemId={o.itemId} icons={icons} />
          <span class="shop-name">
            {itemName(o.itemId)}
            {o.count > 1 && <span class="hud-dim"> ×{o.count}</span>}
            {o.festival && <span class="shop-badge">Festival</span>}
          </span>
          <span class="shop-price">
            <span class="coin" aria-hidden="true" /> {o.price}
          </span>
        </button>
      ))}
      <div class="shop-heading">Sell</div>
      {shop.sells.length === 0 && <div class="panel-hint">Nothing they would buy.</div>}
      {shop.sells.map((s) => (
        <button
          key={s.itemId}
          class="panel-button shop-row"
          onClick={() =>
            bridge.commands.emit('sell', { npcId: shop.npcId, item: s.itemId, count: s.have })
          }
        >
          <ItemIcon itemId={s.itemId} icons={icons} />
          <span class="shop-name">
            {itemName(s.itemId)} <span class="hud-dim">×{s.have}</span>
          </span>
          <span class="shop-price">
            <span class="coin" aria-hidden="true" /> {s.price}
          </span>
        </button>
      ))}
      <div class="panel-hint">Esc to close</div>
    </div>
  );
}
