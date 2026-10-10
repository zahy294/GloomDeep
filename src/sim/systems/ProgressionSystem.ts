import type { EventBus, SimEvents } from '../events';

const flagPayload = { flag: '' };

/**
 * Story flags (plan 3.4 ProgressionSystem): plain strings set by quests, reclaimed districts, lit
 * roads and (M12) bosses — `recipe:<key>`, `district:<key>`, `road:<key>`, `boss:<key>`, ...
 * Dialogue, quests, recipes, residents and festivals read them. Saved with the world.
 */
export class ProgressionSystem {
  readonly flags = new Set<string>();

  constructor(private readonly events: EventBus<SimEvents>) {}

  has(flag: string): boolean {
    return this.flags.has(flag);
  }

  /** Sets a flag (once); `flagSet` fires the first time. */
  set(flag: string): void {
    if (this.flags.has(flag)) return;
    this.flags.add(flag);
    flagPayload.flag = flag;
    this.events.emit('flagSet', flagPayload);
  }

  restore(flags: readonly string[]): void {
    for (const f of flags) this.flags.add(f);
  }
}
