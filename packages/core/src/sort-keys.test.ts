import { describe, expect, it } from 'vitest';

import { assignSortKeys } from './sort-keys.ts';

function isStrictlyIncreasing(keys: string[]): boolean {
  return keys.every((key, index) => index === 0 || keys[index - 1]! < key);
}

describe('assignSortKeys', () => {
  it('vergibt neue Schlüssel für eine neue Liste', () => {
    const keys = assignSortKeys([undefined, undefined, undefined]);
    expect(keys).toHaveLength(3);
    expect(isStrictlyIncreasing(keys)).toBe(true);
  });

  it('behält Schlüssel bei unveränderter Reihenfolge', () => {
    const initial = assignSortKeys([undefined, undefined, undefined]);
    expect(assignSortKeys(initial)).toEqual(initial);
  });

  it('fügt neue Einträge zwischen bestehende ein, ohne diese zu ändern', () => {
    const [a, b] = assignSortKeys([undefined, undefined]) as [string, string];
    const keys = assignSortKeys([a, undefined, b]);
    expect(keys[0]).toBe(a);
    expect(keys[2]).toBe(b);
    expect(isStrictlyIncreasing(keys)).toBe(true);
  });

  it('vergibt nur dem verschobenen Eintrag einen neuen Schlüssel', () => {
    const [a, b, c, d] = assignSortKeys([undefined, undefined, undefined, undefined]) as string[];
    // d wird an den Anfang verschoben
    const keys = assignSortKeys([d, a, b, c]);
    expect(keys.slice(1)).toEqual([a, b, c]);
    expect(keys[0]).not.toBe(d);
    expect(isStrictlyIncreasing(keys)).toBe(true);
  });

  it('löst doppelte Schlüssel auf, z. B. nach gleichzeitigem Einfügen auf zwei Geräten', () => {
    const [a] = assignSortKeys([undefined]) as [string];
    const keys = assignSortKeys([a, a]);
    expect(isStrictlyIncreasing(keys)).toBe(true);
  });
});
