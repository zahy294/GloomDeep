import { DIALOGUE, type DialogueCondition } from '../../data/dialogue';
import type { Npc } from '../entities/Npc';

/** What dialogue conditions are checked against (src/data/dialogue/index.ts). */
export interface DialogueContext {
  hasFlag: (flag: string) => boolean;
  /** Share of the world's starting Gloam cleansed, 0..1. */
  cleansed: number;
  night: boolean;
  /** The speaker's town festival is on. */
  festival: boolean;
  /** A Dimming night is on (M12). */
  dimming: boolean;
}

export function conditionHolds(
  when: DialogueCondition | undefined,
  npc: Npc,
  ctx: DialogueContext,
): boolean {
  if (!when) return true;
  if (when.flags && !when.flags.every((f) => ctx.hasFlag(f))) return false;
  if (when.notFlags?.some((f) => ctx.hasFlag(f))) return false;
  if (when.cleansedMin !== undefined && ctx.cleansed < when.cleansedMin) return false;
  if (when.night !== undefined && when.night !== ctx.night) return false;
  if (when.scared !== undefined && when.scared !== npc.scared) return false;
  if (when.festival !== undefined && when.festival !== ctx.festival) return false;
  if (when.dimming !== undefined && when.dimming !== ctx.dimming) return false;
  return true;
}

/**
 * Data-driven dialogue (plan 3.4 DialogueSystem): the last entry for this person whose condition
 * holds gives their lines; each talk says the next one, starting over when the entry changes.
 * Returns '' if they have nothing to say.
 */
export function nextLine(npc: Npc, ctx: DialogueContext): string {
  let entry = -1;
  DIALOGUE.forEach((e, i) => {
    if (e.npc === npc.key && conditionHolds(e.when, npc, ctx)) entry = i;
  });
  const lines = DIALOGUE[entry]?.lines;
  if (!lines || lines.length === 0) return '';
  if (npc.lineEntry !== entry) {
    npc.lineEntry = entry;
    npc.line = 0;
  }
  const text = lines[npc.line % lines.length] ?? '';
  npc.line++;
  return text;
}
