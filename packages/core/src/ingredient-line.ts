import { formatAmount } from './quantity.ts';
import { findUnit, unitLabel } from './units.ts';

export type ParsedIngredient = {
  amount: number | null;
  /** Obergrenze bei Spannen wie „2–3 Zehen“. */
  amountMax: number | null;
  unit: string;
  name: string;
  note: string;
};

const FRACTION_VALUES: Record<string, number> = {
  '½': 1 / 2,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const FRACTION_CHARS = Object.keys(FRACTION_VALUES).join('');

const MIXED_FRACTION = /^(\d+)\s+(\d+)\/(\d+)/;
const SIMPLE_FRACTION = /^(\d+)\/(\d+)/;
const THOUSANDS = /^(\d{1,3}(?:\.\d{3})+)(?![\d,])/;
const DECIMAL = new RegExp(`^(\\d+(?:[.,]\\d+)?)(?:\\s?([${FRACTION_CHARS}]))?`);
const FRACTION_ONLY = new RegExp(`^([${FRACTION_CHARS}])`);
const RANGE_SEPARATOR = /^\s*(?:-|–|bis)\s*/;
const UNIT_TOKEN = /^([A-Za-zÄÖÜäöüß]+\.?)(?=\s|,|$)/;

function readNumber(text: string): { value: number; length: number } | null {
  const mixed = MIXED_FRACTION.exec(text);
  if (mixed) {
    const [match, whole, numerator, denominator] = mixed;
    if (Number(denominator) > 0 && Number(numerator) < Number(denominator)) {
      return { value: Number(whole) + Number(numerator) / Number(denominator), length: match.length };
    }
  }
  const fraction = SIMPLE_FRACTION.exec(text);
  if (fraction && Number(fraction[2]) > 0) {
    return { value: Number(fraction[1]) / Number(fraction[2]), length: fraction[0].length };
  }
  const thousands = THOUSANDS.exec(text);
  if (thousands) {
    return { value: Number(thousands[1]!.replace(/\./g, '')), length: thousands[0].length };
  }
  const decimal = DECIMAL.exec(text);
  if (decimal) {
    const fractionPart = decimal[2] ? (FRACTION_VALUES[decimal[2]] ?? 0) : 0;
    return { value: Number(decimal[1]!.replace(',', '.')) + fractionPart, length: decimal[0].length };
  }
  const fractionOnly = FRACTION_ONLY.exec(text);
  if (fractionOnly) {
    return { value: FRACTION_VALUES[fractionOnly[1]!] ?? 0, length: fractionOnly[0].length };
  }
  return null;
}

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Zerlegt eine Zutatenzeile wie „2–3 Zehen Knoblauch, fein gehackt“ in Menge, Einheit, Name und Zusatz.
 * Gibt `null` zurück, wenn die Zeile leer ist.
 */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  let rest = collapseSpaces(line);
  if (!rest) return null;

  let amount: number | null = null;
  let amountMax: number | null = null;
  let unit = '';

  const first = readNumber(rest);
  if (first) {
    amount = first.value;
    rest = rest.slice(first.length);

    const separator = RANGE_SEPARATOR.exec(rest);
    if (separator) {
      const second = readNumber(rest.slice(separator[0].length));
      if (second && second.value > amount) {
        amountMax = second.value;
        rest = rest.slice(separator[0].length + second.length);
      }
    }

    rest = rest.trimStart();
    const token = UNIT_TOKEN.exec(rest);
    const found = token ? findUnit(token[1]!) : undefined;
    if (token && found) {
      unit = found.id;
      rest = rest.slice(token[0].length);
    }
  }

  const notes: string[] = [];
  rest = rest.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    if (inner.trim()) notes.push(inner.trim());
    return ' ';
  });

  const commaIndex = rest.indexOf(',');
  let name = rest;
  if (commaIndex >= 0) {
    name = rest.slice(0, commaIndex);
    const afterComma = collapseSpaces(rest.slice(commaIndex + 1));
    if (afterComma) notes.unshift(afterComma);
  }

  return { amount, amountMax, unit, name: collapseSpaces(name), note: notes.join(', ') };
}

/** Baut aus den Feldern wieder eine Zeile zum Bearbeiten, z. B. „1½ EL Olivenöl, kaltgepresst“. */
export function formatIngredientLine(ingredient: ParsedIngredient): string {
  const plural = (ingredient.amountMax ?? ingredient.amount ?? 0) > 1;
  const parts = [
    formatAmount(ingredient.amount, ingredient.amountMax, ingredient.unit),
    ingredient.unit ? unitLabel(ingredient.unit, plural) : '',
    ingredient.name,
  ];
  const main = parts.filter(Boolean).join(' ');
  return ingredient.note ? `${main}, ${ingredient.note}` : main;
}
