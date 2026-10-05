import { createFoodResolver, type FoodStock, type FoodTables, type StockUnit } from './foods.ts';
import { formatNumber } from './quantity.ts';
import type { RecipeTables } from './recipe.ts';
import { changedCells, isActive, type RowWrite, type Table } from './rows.ts';
import { unitLabel } from './units.ts';

/**
 * Vorrat mit Mengen (M6). Ein Lebensmittel ist entweder gar nicht, einfach („da“ oder „nachkaufen“)
 * oder genau geführt. Genau geführte haben eine Vorratseinheit; ihr Bestand ist die Summe ihrer Buchungen
 * (Einkauf +, gekocht −, Korrektur ±). So gehen beim Sync keine gleichzeitigen Änderungen verloren.
 */

export const PANTRY_REASONS = ['purchase', 'cooked', 'correction'] as const;

export type PantryReason = (typeof PANTRY_REASONS)[number];

export type PantryBookingRow = {
  foodId: string;
  /** Zugang positiv, Abgang negativ, in `unit`. */
  amount: number;
  /** Vorratseinheit beim Buchen; die Buchung zählt nur, solange das Lebensmittel in dieser Einheit geführt wird. */
  unit: StockUnit;
  reason: PantryReason;
  /** Einkaufsliste bzw. Planeintrag, auf den sich die Buchung bezieht; leer = keiner. */
  listId: string;
  entryId: string;
  createdAt: number;
  deletedAt: number | null;
};

export type PantryTables = FoodTables & { pantryBookings: Table<PantryBookingRow> };

/** Wie ein Lebensmittel im Vorrat geführt wird. */
export type StockMode = 'none' | 'simple' | 'exact';

export function stockModeOf(food: { stock: FoodStock; stockUnit: StockUnit | '' }): StockMode {
  if (food.stockUnit) return 'exact';
  return food.stock ? 'simple' : 'none';
}

// ─── Umrechnen ───

/**
 * Rezept-Einheiten, die sich sicher in eine Vorratseinheit umrechnen lassen. Messlöffel haben feste
 * Größen; eine Packung (Dose, Becher …) zählt als ein Stück. Alles andere (Prise, Zehe, Bund …) bleibt
 * außen vor: lieber nicht abziehen als falsch rechnen.
 */
const STOCK_FACTORS: Record<string, { unit: StockUnit; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'ml', factor: 1 },
  cl: { unit: 'ml', factor: 10 },
  dl: { unit: 'ml', factor: 100 },
  l: { unit: 'ml', factor: 1000 },
  EL: { unit: 'ml', factor: 15 },
  TL: { unit: 'ml', factor: 5 },
  '': { unit: 'Stück', factor: 1 },
  Stück: { unit: 'Stück', factor: 1 },
  Dose: { unit: 'Stück', factor: 1 },
  'Pck.': { unit: 'Stück', factor: 1 },
  Becher: { unit: 'Stück', factor: 1 },
  Glas: { unit: 'Stück', factor: 1 },
  Flasche: { unit: 'Stück', factor: 1 },
  Beutel: { unit: 'Stück', factor: 1 },
  Kopf: { unit: 'Stück', factor: 1 },
  Knolle: { unit: 'Stück', factor: 1 },
  Stange: { unit: 'Stück', factor: 1 },
  Würfel: { unit: 'Stück', factor: 1 },
};

/** Menge in der Vorratseinheit, z. B. 1,5 kg → 1500 g; `null`, wenn sich das nicht sicher umrechnen lässt. */
export function toStockAmount(amount: number, unit: string, stockUnit: StockUnit): number | null {
  const conversion = STOCK_FACTORS[unit];
  return conversion?.unit === stockUnit ? amount * conversion.factor : null;
}

/** Menge aus einer Eingabe: „1,5“ und „1.5“ → 1,5, „1.500“ → 1500; leer, negativ oder Unsinn → `null`. */
export function parseStockAmount(text: string): number | null {
  let value = text.replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d*)?$/.test(value)) value = value.replace(/\./g, '');
  const amount = Number(value.replace(',', '.'));
  return value && Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/** Bestand oder Buchung zum Anzeigen, ungerundet: „1500 g“, „2 Stück“. */
export function formatStock(amount: number, unit: StockUnit): string {
  return `${formatNumber(amount, 'decimal')} ${unitLabel(unit, amount !== 1)}`;
}

/**
 * Vorratseinheit, in der die Rezepte ein Lebensmittel meistens angeben, z. B. Stück für Zwiebeln;
 * ohne passende Angabe Gramm.
 */
export function suggestStockUnit(tables: PantryTables & Pick<RecipeTables, 'recipeIngredients'>, foodId: string): StockUnit {
  const resolver = createFoodResolver(tables);
  const counts = new Map<StockUnit, number>();
  for (const row of Object.values(tables.recipeIngredients)) {
    if (!isActive(row) || row.kind !== 'ingredient' || typeof row.amount !== 'number') continue;
    const unit = STOCK_FACTORS[row.unit]?.unit;
    if (!unit || resolver.resolve(row.name)?.id !== foodId) continue;
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  let best: StockUnit = 'g';
  for (const [unit, count] of counts) if (count > (counts.get(best) ?? 0)) best = unit;
  return best;
}

// ─── Bestand ───

/** Bestand aller genau geführten Lebensmittel in ihrer Vorratseinheit; kann durch Schätzfehler negativ sein. */
export function stockLevels(tables: PantryTables): Map<string, number> {
  const levels = new Map<string, number>();
  for (const [id, food] of Object.entries(tables.foods)) {
    if (isActive(food) && food.stockUnit) levels.set(id, 0);
  }
  for (const booking of Object.values(tables.pantryBookings)) {
    const level = levels.get(booking.foodId);
    if (level === undefined || !isActive(booking) || tables.foods[booking.foodId]?.stockUnit !== booking.unit) continue;
    levels.set(booking.foodId, level + booking.amount);
  }
  // Gegen Rundungsreste aus Kommazahlen
  for (const [id, level] of levels) levels.set(id, Math.round(level * 1000) / 1000);
  return levels;
}

export function stockOf(tables: PantryTables, foodId: string): number {
  return stockLevels(tables).get(foodId) ?? 0;
}

/** Buchungen eines Lebensmittels in seiner Vorratseinheit, die neueste zuerst. */
export function stockBookings(tables: PantryTables, foodId: string): (PantryBookingRow & { id: string })[] {
  const unit = tables.foods[foodId]?.stockUnit;
  return Object.entries(tables.pantryBookings)
    .filter(([, booking]) => booking.foodId === foodId && booking.unit === unit && isActive(booking))
    .map(([id, booking]) => ({ id, ...booking }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function pantryBooking(
  createId: () => string,
  cells: Omit<PantryBookingRow, 'listId' | 'entryId' | 'deletedAt'> & Partial<Pick<PantryBookingRow, 'listId' | 'entryId'>>,
): RowWrite {
  return { table: 'pantryBookings', rowId: createId(), cells: { listId: '', entryId: '', ...cells, deletedAt: null } };
}

/**
 * Legt fest, wie ein Lebensmittel im Vorrat geführt wird. Wer auf „einfach“ wechselt, hat es erst einmal
 * „da“; für „genau“ trägt man danach den Bestand ein.
 */
export function setStockMode(tables: PantryTables, foodId: string, mode: StockMode, unit: StockUnit = 'g'): RowWrite[] {
  const food = tables.foods[foodId];
  if (!food) return [];
  const cells =
    mode === 'exact'
      ? { stock: '', stockUnit: unit }
      : mode === 'simple'
        ? { stock: food.stock || 'have', stockUnit: '' }
        : { stock: '', stockUnit: '' };
  const write = changedCells('foods', foodId, food, cells);
  return write ? [write] : [];
}

/** Setzt den Bestand eines genau geführten Lebensmittels: Die Differenz wird als Korrektur gebucht. */
export function correctStock(tables: PantryTables, foodId: string, amount: number, now: number, createId: () => string): RowWrite[] {
  const unit = tables.foods[foodId]?.stockUnit;
  if (!unit || !Number.isFinite(amount)) return [];
  const difference = Math.round((Math.max(0, amount) - stockOf(tables, foodId)) * 1000) / 1000;
  return difference === 0 ? [] : [pantryBooking(createId, { foodId, amount: difference, unit, reason: 'correction', createdAt: now })];
}
