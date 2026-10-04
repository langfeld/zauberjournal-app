import { describe, expect, it } from 'vitest';

import { formatAmount, formatNumber, scaleAmount } from './quantity.ts';

describe('formatNumber', () => {
  it.each([
    [1.5, '1½'],
    [0.25, '¼'],
    [0.75, '¾'],
    [2, '2'],
    [0.999, '1'],
    [1 / 3, '⅓'],
    [0.4, '0,4'],
  ])('zeigt %s als Bruch: %s', (value, expected) => {
    expect(formatNumber(value, 'fraction')).toBe(expected);
  });

  it('zeigt Dezimalzahlen mit Komma und höchstens zwei Stellen', () => {
    expect(formatNumber(0.125, 'decimal')).toBe('0,13');
    expect(formatNumber(250, 'decimal')).toBe('250');
  });
});

describe('scaleAmount', () => {
  it('lässt Mengen bei Faktor 1 unverändert', () => {
    expect(scaleAmount(125, 1, 'g')).toBe(125);
  });

  it('rundet Gramm je nach Größe auf 1, 5 oder 10', () => {
    expect(scaleAmount(12, 1.5, 'g')).toBe(18);
    expect(scaleAmount(125, 0.5, 'g')).toBe(65);
    expect(scaleAmount(300, 1.5, 'g')).toBe(450);
    expect(scaleAmount(333, 1.5, 'g')).toBe(500);
  });

  it('rundet Stückmengen auf Viertel, Halbe oder ganze Zahlen', () => {
    expect(scaleAmount(1, 0.5, 'Zehe')).toBe(0.5);
    expect(scaleAmount(1, 0.1, '')).toBe(0.25);
    expect(scaleAmount(3, 1.5, 'EL')).toBe(4.5);
    expect(scaleAmount(7, 1.5, '')).toBe(11);
  });

  it('rundet kg und Liter auf zwei Nachkommastellen', () => {
    expect(scaleAmount(0.5, 1.5, 'kg')).toBe(0.75);
  });
});

describe('formatAmount', () => {
  it('formatiert Spannen und leere Mengen', () => {
    expect(formatAmount(2, 3, 'Zehe')).toBe('2–3');
    expect(formatAmount(null, null, '')).toBe('');
    expect(formatAmount(2.5, null, 'g')).toBe('2,5');
  });
});
