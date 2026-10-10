import { ESCORT, TOWN } from '../config';
import { ITEMS, itemId } from '../data/items';
import { npcDef } from '../data/npcs';
import { QUESTS } from '../data/quests';
import { SELL_VALUE } from '../data/shops';
import type { Simulation } from '../sim/Simulation';
import { RESOLVED_RECIPES, recipeKnown } from '../sim/systems/CraftingSystem';
import { buyPrice, openOffers, sellPrice } from '../sim/systems/TradeSystem';
import type { Town } from '../sim/systems/TownSystem';
import type { EscortView, JournalView, ShopView, TownView, UiBridge } from '../ui/bridge';

/** The journal's story section (M12, BossPresenter.story). */
export type StorySource = () => JournalView['story'];

const GLIMMER = itemId('glimmer');
/** Percent shown for a price factor's difference from 1. */
const PERCENT = 100;

/**
 * M11 on the UI side: turns town, quest and trade state into bridge views — the trader's stall,
 * the quest journal, the town and escort parts of the HUD, banners and notices for town events.
 * The UI sends commands back through GameScene; nothing here changes the simulation.
 */
export class TownPresenter {
  private shopNpc = -1;
  private journalOpen = false;
  private bannerId = 0;
  /** The town the player was last in (a banner shows on entering one). */
  private lastTown = '';
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly sim: Simulation,
    private readonly bridge: UiBridge,
    private readonly notify: (text: string) => void,
    private readonly story: StorySource = () => [],
  ) {
    const { events } = sim;
    this.offs.push(
      events.on('questStarted', ({ title }) => this.notify(`New quest: ${title}`)),
      events.on('questCompleted', ({ title }) => this.banner('Quest complete', title)),
      events.on('questProgress', ({ text }) => this.notify(text)),
      events.on('escortFled', ({ text }) => this.notify(text)),
      events.on('useBlocked', ({ need }) => this.notify(`Needs ${need}`)),
      events.on('lampRefuelled', () => this.notify('The lamp burns bright again')),
      events.on('beaconRelit', ({ name }) =>
        this.notify(`The beacon of ${name} wakes! Its light burns into the Gloam…`),
      ),
      events.on('districtReclaimed', ({ name }) =>
        this.banner(`${capitalise(name)} reclaimed`, 'Its people are coming home'),
      ),
      events.on('festivalStarted', ({ name }) =>
        this.banner(capitalise(name), 'Tonight, every lantern burns'),
      ),
      events.on('festivalEnded', ({ name }) =>
        this.notify(`${capitalise(name)} is over until next time`),
      ),
      events.on('roadProgress', ({ name, lit, total }) =>
        this.notify(`${capitalise(name)}: ${lit} of ${total} stretches lit`),
      ),
      events.on('roadLit', ({ name }) =>
        this.banner(`${capitalise(name)} is lit`, 'The caravans will roll again'),
      ),
      events.on('caravanArrived', ({ place }) => {
        const town = sim.towns.townByKey(place);
        if (town && this.lastTown === place) this.notify(`A caravan has reached ${town.def.name}`);
      }),
      events.on('traded', () => this.refreshShop()),
      events.on('inventoryChanged', () => this.refreshShop()),
      events.on('flagSet', () => this.refreshJournal()),
      events.on('questStarted', () => this.refreshJournal()),
      events.on('questCompleted', () => this.refreshJournal()),
    );
  }

  destroy(): void {
    for (const off of this.offs) off();
  }

  /** Recipes taught by folk and not learned yet (hidden from the crafting list). */
  lockedRecipes(): string[] {
    return RESOLVED_RECIPES.filter((r) => !recipeKnown(r, this.sim.progression.flags)).map(
      (r) => r.key,
    );
  }

  get panelOpen(): boolean {
    return this.shopNpc >= 0 || this.journalOpen;
  }

  openShop(npcId: number): void {
    this.shopNpc = npcId;
    this.refreshShop();
  }

  toggleJournal(): void {
    this.journalOpen = !this.journalOpen;
    this.refreshJournal();
  }

  close(): void {
    this.shopNpc = -1;
    this.journalOpen = false;
    this.bridge.set({ shop: null, journal: null });
  }

  /** A few times a second: the town and escort HUD, the town banner, closing a far shop. */
  update(): void {
    if (this.shopNpc >= 0 && !this.sim.tradeTerms(this.shopNpc)) {
      this.shopNpc = -1;
      this.bridge.set({ shop: null });
    }
    const b = this.sim.player.body;
    const town = this.sim.towns.townAtPixel(b.x + b.width / 2, b.y + b.height - 1);
    const key = town?.def.key ?? '';
    if (key !== this.lastTown) {
      this.lastTown = key;
      if (town) this.banner(town.def.name, townStatus(town));
    }
  }

  /** HUD fields for M11 (merged into the HUD view by GameScene). */
  hud(): { glimmer: number; town: TownView | null; escort: EscortView | null } {
    const b = this.sim.player.body;
    const town = this.sim.towns.townAtPixel(b.x + b.width / 2, b.y + b.height - 1);
    const escortee = this.sim.quests.escortee();
    return {
      glimmer: this.sim.inventory.count(GLIMMER),
      town: town
        ? { name: town.def.name, light: round2(town.light), status: townStatus(town) }
        : null,
      escort: escortee
        ? {
            name: npcDef(escortee.key)?.name ?? escortee.key,
            courage: round2(1 - this.sim.quests.escortFear / ESCORT.fearSeconds),
          }
        : null,
    };
  }

  private refreshShop(): void {
    if (this.shopNpc < 0) return;
    const terms = this.sim.tradeTerms(this.shopNpc);
    if (!terms) return;
    const { npc, factor, festival } = terms;
    const glimmer = this.sim.inventory.count(GLIMMER);
    const def = npcDef(npc.key);
    const seen = new Set<number>();
    const sells: ShopView['sells'][number][] = [];
    for (const slot of this.sim.inventory.slots) {
      if (!slot || seen.has(slot.itemId) || slot.itemId === GLIMMER) continue;
      if (!((ITEMS[slot.itemId]?.key ?? '') in SELL_VALUE)) continue;
      seen.add(slot.itemId);
      const have = this.sim.inventory.count(slot.itemId);
      const price = sellPrice(slot.itemId, have, factor);
      if (price > 0) sells.push({ itemId: slot.itemId, have, price });
    }
    this.bridge.set({
      shop: {
        npcId: npc.id,
        name: def?.name ?? npc.key,
        role: def?.role ?? '',
        glimmer,
        terms: termsText(factor),
        offers: openOffers(npc.key, festival).map(({ offer, index }) => {
          const price = buyPrice(offer, factor);
          return {
            index,
            itemId: itemId(offer.item),
            count: offer.count,
            price,
            affordable: glimmer >= price,
            festival: offer.festival === true,
          };
        }),
        sells,
      },
    });
  }

  private refreshJournal(): void {
    if (!this.journalOpen) {
      if (this.bridge.state.journal) this.bridge.set({ journal: null });
      return;
    }
    const view: JournalView = {
      quests: QUESTS.filter((q) => this.sim.quests.state(q.key) !== 'new').map((q) => ({
        key: q.key,
        title: q.title,
        summary: q.summary,
        done: this.sim.quests.state(q.key) === 'done',
      })),
      story: this.story(),
    };
    this.bridge.set({ journal: view });
  }

  banner(title: string, sub: string): void {
    this.bridge.set({ banner: { title, sub, id: ++this.bannerId } });
  }
}

function townStatus(town: Town): string {
  if (town.festivalPhase === 'on') return 'The festival is on!';
  if (town.districts.length > 0) {
    const n = town.districts.filter((d) => d.reclaimed).length;
    return n === 0 ? 'Lost to the Gloam' : `${n} of ${town.districts.length} districts reclaimed`;
  }
  if (town.light >= 1) return 'Every lamp burning';
  if (town.light >= TOWN.scaredBelow) return 'Some lamps burning low';
  return 'The streets are dark';
}

function termsText(factor: number): string {
  const pct = Math.round(Math.abs(factor - 1) * PERCENT);
  if (pct === 0) return 'Fair prices';
  return factor > 1 ? `Dark streets: prices up ${pct}%` : `Lit roads: prices down ${pct}%`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function round2(v: number): number {
  return Math.round(v * PERCENT) / PERCENT;
}
