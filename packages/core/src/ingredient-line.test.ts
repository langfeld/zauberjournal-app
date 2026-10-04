import { describe, expect, it } from 'vitest';

import { formatIngredientLine, parseIngredientLine } from './ingredient-line.ts';

describe('parseIngredientLine', () => {
  it.each([
    ['200 g Mehl', { amount: 200, amountMax: null, unit: 'g', name: 'Mehl', note: '' }],
    ['200g Mehl', { amount: 200, amountMax: null, unit: 'g', name: 'Mehl', note: '' }],
    ['1½ EL Olivenöl', { amount: 1.5, amountMax: null, unit: 'EL', name: 'Olivenöl', note: '' }],
    ['1 1/2 TL Salz', { amount: 1.5, amountMax: null, unit: 'TL', name: 'Salz', note: '' }],
    ['½ Bund Petersilie', { amount: 0.5, amountMax: null, unit: 'Bund', name: 'Petersilie', note: '' }],
    ['0,5 l Milch', { amount: 0.5, amountMax: null, unit: 'l', name: 'Milch', note: '' }],
    ['1.000 g Kartoffeln', { amount: 1000, amountMax: null, unit: 'g', name: 'Kartoffeln', note: '' }],
    ['2 Esslöffel Honig', { amount: 2, amountMax: null, unit: 'EL', name: 'Honig', note: '' }],
    ['1 Prise Zucker', { amount: 1, amountMax: null, unit: 'Prise', name: 'Zucker', note: '' }],
    [
      '2-3 Zehen Knoblauch, fein gehackt',
      { amount: 2, amountMax: 3, unit: 'Zehe', name: 'Knoblauch', note: 'fein gehackt' },
    ],
    ['1 Dose (400 g) Tomaten', { amount: 1, amountMax: null, unit: 'Dose', name: 'Tomaten', note: '400 g' }],
    ['3 große Eier', { amount: 3, amountMax: null, unit: '', name: 'große Eier', note: '' }],
    ['Salz und Pfeffer', { amount: null, amountMax: null, unit: '', name: 'Salz und Pfeffer', note: '' }],
    ['1 Glasnudeln', { amount: 1, amountMax: null, unit: '', name: 'Glasnudeln', note: '' }],
  ])('erkennt „%s“', (line, expected) => {
    expect(parseIngredientLine(line)).toEqual(expected);
  });

  it('liefert null für leere Zeilen', () => {
    expect(parseIngredientLine('   ')).toBeNull();
  });
});

describe('formatIngredientLine', () => {
  it.each([
    '200 g Mehl',
    '1½ EL Olivenöl, kaltgepresst',
    '2–3 Zehen Knoblauch, fein gehackt',
    '0,5 l Milch',
    'Salz und Pfeffer',
  ])('bleibt beim erneuten Einlesen gleich: „%s“', (line) => {
    const parsed = parseIngredientLine(line);
    expect(parsed).not.toBeNull();
    expect(formatIngredientLine(parsed!)).toBe(line);
  });
});
