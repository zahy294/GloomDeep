/**
 * Festivals (plan 1.7: "after each boss: lantern release into the sky, music, fireworks, special
 * stalls for one in-game night"). Once the `after` flag is set, the town celebrates from the next
 * dusk to the following dawn (FESTIVAL in config).
 */

export interface FestivalDef {
  readonly key: string;
  readonly name: string;
  readonly town: string;
  /** Story flag that earns it (bosses set `boss:<key>` in M12). */
  readonly after: string;
  /** Where the town's folk gather while it is on (a waypoint tag). */
  readonly gather: string;
}

export const FESTIVALS: readonly FestivalDef[] = [
  {
    key: 'lantern_festival',
    name: 'the Festival of Lanterns',
    town: 'canopyhold',
    after: 'boss:moth_matriarch',
    gather: 'plaza',
  },
];
