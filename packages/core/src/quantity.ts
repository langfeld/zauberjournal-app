import { unitRounding } from './units.ts';

const FRACTION_SYMBOLS: readonly (readonly [number, string])[] = [
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

const TOLERANCE = 0.02;

/** Formatiert eine Zahl für die Anzeige: als Bruch (1½) oder mit Dezimalkomma (0,75). */
export function formatNumber(value: number, style: 'fraction' | 'decimal'): string {
  if (style === 'fraction') {
    let whole = Math.floor(value);
    let rest = value - whole;
    if (rest > 1 - TOLERANCE) {
      whole += 1;
      rest = 0;
    }
    if (rest < TOLERANCE) return String(whole);
    const symbol = FRACTION_SYMBOLS.find(([fraction]) => Math.abs(rest - fraction) < TOLERANCE)?.[1];
    if (symbol) return whole > 0 ? `${whole}${symbol}` : symbol;
  }
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}

/** Rundet eine skalierte Menge passend zur Einheit. */
export function roundScaledAmount(value: number, unitId: string): number {
  switch (unitRounding(unitId)) {
    case 'fine':
      if (value < 1) return Math.round(value * 10) / 10;
      if (value < 20) return Math.round(value);
      if (value < 100) return Math.round(value / 5) * 5;
      return Math.round(value / 10) * 10;
    case 'decimal':
      return Math.round(value * 100) / 100;
    case 'fraction':
      if (value < 3) return Math.max(0.25, Math.round(value * 4) / 4);
      if (value < 10) return Math.round(value * 2) / 2;
      return Math.round(value);
  }
}

/** Skaliert eine Menge; bei Faktor 1 bleibt sie exakt so, wie sie im Rezept steht. */
export function scaleAmount(amount: number, factor: number, unitId: string): number {
  if (factor === 1) return amount;
  return roundScaledAmount(amount * factor, unitId);
}

/** Formatiert eine Menge oder Spanne (1–2) passend zur Einheit. */
export function formatAmount(amount: number | null, amountMax: number | null, unitId: string): string {
  if (amount === null) return '';
  const style = unitRounding(unitId) === 'fraction' ? 'fraction' : 'decimal';
  const text = formatNumber(amount, style);
  return amountMax === null ? text : `${text}–${formatNumber(amountMax, style)}`;
}
