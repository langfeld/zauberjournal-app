import { generateNKeysBetween } from 'fractional-indexing';

/** Vergleicht Sortierschlüssel nach Zeichencode (nicht nach Sprache), passend zu fractional-indexing. */
export function compareSortKeys(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Vergibt Sortierschlüssel für eine Liste in ihrer neuen Reihenfolge.
 *
 * `existing` enthält pro Eintrag den bisherigen Schlüssel oder `undefined` für neue Einträge.
 * Schlüssel bleiben erhalten, wo die Reihenfolge es zulässt (längste aufsteigende Teilfolge);
 * nur neue oder verschobene Einträge bekommen neue Schlüssel. So ändern sich beim Sync
 * möglichst wenige Zellen, und gleichzeitige Einfügungen auf zwei Geräten kollidieren nicht.
 */
export function assignSortKeys(existing: readonly (string | undefined)[]): string[] {
  const count = existing.length;
  const chainLength = new Array<number>(count).fill(0);
  const previous = new Array<number>(count).fill(-1);
  let chainEnd = -1;

  for (let i = 0; i < count; i++) {
    const key = existing[i];
    if (!key) continue;
    chainLength[i] = 1;
    for (let j = 0; j < i; j++) {
      const earlier = existing[j];
      if (earlier && earlier < key && chainLength[j]! + 1 > chainLength[i]!) {
        chainLength[i] = chainLength[j]! + 1;
        previous[i] = j;
      }
    }
    if (chainEnd === -1 || chainLength[i]! > chainLength[chainEnd]!) chainEnd = i;
  }

  const keep = new Array<boolean>(count).fill(false);
  for (let i = chainEnd; i !== -1; i = previous[i]!) keep[i] = true;

  const result = new Array<string>(count);
  let index = 0;
  while (index < count) {
    if (keep[index]) {
      result[index] = existing[index]!;
      index++;
      continue;
    }
    const start = index;
    while (index < count && !keep[index]) index++;
    const before = start > 0 ? result[start - 1]! : null;
    const after = index < count ? existing[index]! : null;
    generateNKeysBetween(before, after, index - start).forEach((key, offset) => {
      result[start + offset] = key;
    });
  }
  return result;
}
