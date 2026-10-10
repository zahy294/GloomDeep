/**
 * Festivals (plan 1.7: "after each boss: lantern release into the sky, music, fireworks, special
 * stalls for one in-game night"). Once the `after` flag is set, the town celebrates from the next
 * dusk to the following dawn (FESTIVAL in config). A town holds its festivals one night at a
 * time, in this order.
 */

export interface FestivalDef {
  readonly key: string;
  readonly name: string;
  readonly town: string;
  /** Story flag that earns it (each boss sets `boss:<key>`). */
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
  {
    key: 'still_water',
    name: 'the Night of Still Water',
    town: 'canopyhold',
    after: 'boss:mire_sovereign',
    gather: 'plaza',
  },
  {
    key: 'prism_night',
    name: 'the Prism Night',
    town: 'canopyhold',
    after: 'boss:hollow_warden',
    gather: 'plaza',
  },
  {
    key: 'heartlight_festival',
    name: 'the Festival of the Heartlight',
    town: 'canopyhold',
    after: 'boss:gloam_heart',
    gather: 'plaza',
  },
];
