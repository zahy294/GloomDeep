/**
 * Seed text to number: blank means random (null), 32-bit integers are used as-is, anything else
 * (including larger numbers, which would otherwise wrap onto another seed) is hashed (FNV-1a) to a 32-bit int so the same phrase always gives the same world.
 */
export function parseSeed(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    if (n >= -(2 ** 31) && n < 2 ** 31) return n;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "3 days ago". */
export function formatRelativeTime(then: number, now: number): string {
  const diff = Math.max(0, now - then);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour');
  return plural(Math.floor(diff / DAY), 'day');
}

/** Seconds to "1 h 12 min", "5 min" or "< 1 min". */
export function formatPlayTime(seconds: number): string {
  const totalMin = Math.floor(Math.max(0, seconds) / 60);
  if (totalMin < 1) return '< 1 min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** Default name for the new-world form: "Glade N", skipping names already taken. */
export function defaultWorldName(existing: readonly { name: string }[]): string {
  const names = new Set(existing.map((w) => w.name));
  let n = existing.length + 1;
  while (names.has(`Glade ${n}`)) n++;
  return `Glade ${n}`;
}
