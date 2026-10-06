import { addDays, dayOf, daysBetween } from './dates.ts';
import { stemVariants, type FoodCategory } from './food-catalog.ts';
import { createFoodResolver, normalizeFoodName, type FoodStock, type FoodTables, type StockUnit } from './foods.ts';
import { parseIngredientLine } from './ingredient-line.ts';
import { formatNumber } from './quantity.ts';
import type { RecipeTables } from './recipe.ts';
import { changedCells, isActive, type RowWrite, type Table } from './rows.ts';
import { unitLabel } from './units.ts';

/**
 * Vorrat (M6): was daheim ist, als Summe von Buchungen je Lebensmittel in seiner Vorratseinheit
 * (Einkauf +, gekocht −, Korrektur ±). So gehen beim Sync keine gleichzeitigen Änderungen verloren.
 * Gekauftes kommt beim Abschließen der Einkaufsliste dazu, Gekochtes geht ab, Reste von Frischem laufen
 * nach einigen Tagen ab. Unabhängig davon kann ein Lebensmittel „immer im Haus“ sein (`foods.stock`):
 * Ist es leer, kommt es von selbst auf die Einkaufsliste.
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

// ─── Haltbarkeit ───

/**
 * So viele Tage nach dem letzten Einkauf zählt ein Rest noch. Warengruppen ohne Angabe halten lange
 * (Nudeln, Konserven, Tiefkühl …); ihr Bestand zählt, bis er aufgebraucht ist.
 */
export const SHELF_LIFE_DAYS: Partial<Record<FoodCategory, number>> = { produce: 7, bakery: 4, dairy: 14, meat: 3, fish: 2 };

/** Gemüse und Obst, das im Keller oder Kühlschrank Wochen hält. */
const LONG_KEEPING = ['zwiebel', 'schalotte', 'knoblauch', 'knoblauchzehe', 'kartoffel', 'möhre', 'karotte', 'ingwer', 'kürbis', 'zitrone', 'limette', 'apfel'];
/** Ausnahmen davon: Frühlingszwiebeln halten nur ein paar Tage. */
const SHORT_KEEPING = ['frühlingszwiebel', 'lauchzwiebel'];
const LONG_KEEPING_DAYS = 28;

/** Tage, die ein Rest nach dem letzten Einkauf zählt; `null` = hält lange (Nudeln, Konserven …). */
export function shelfLifeDays(food: { category: FoodCategory; name: string }): number | null {
  const days = SHELF_LIFE_DAYS[food.category];
  if (days === undefined) return null;
  if (food.category !== 'produce') return days;
  const variants = stemVariants(normalizeFoodName(food.name).split(' ').at(-1) ?? '');
  const has = (words: readonly string[]) => variants.some((variant) => words.some((word) => variant.endsWith(word)));
  return has(LONG_KEEPING) && !has(SHORT_KEEPING) ? LONG_KEEPING_DAYS : days;
}

// ─── Umrechnen ───

/**
 * Rezept-Einheiten, die sich in eine Vorratseinheit umrechnen lassen. Messlöffel haben feste Größen; eine
 * Packung (Dose, Becher …) zählt als ein Stück. Alles andere (Prise, Zehe, Bund …) bleibt außen vor:
 * lieber nicht abziehen als falsch rechnen.
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

/**
 * Menge in der Vorratseinheit, z. B. 1,5 kg → 1500 g; `null`, wenn sich das nicht umrechnen lässt. Gramm und
 * Milliliter gelten als gleich: Für den Vorrat ist das genau genug, und „1 TL Zucker“ geht so vom Zucker in
 * Gramm ab.
 */
export function toStockAmount(amount: number, unit: string, stockUnit: StockUnit): number | null {
  const conversion = STOCK_FACTORS[unit];
  if (!conversion) return null;
  const metric = (value: StockUnit) => value === 'g' || value === 'ml';
  return conversion.unit === stockUnit || (metric(conversion.unit) && metric(stockUnit)) ? amount * conversion.factor : null;
}

/** Vorratseinheit, in die sich eine Rezept-Einheit umrechnen lässt; `null` bei Prise, Zehe & Co. */
export function stockUnitOf(unit: string): StockUnit | null {
  return STOCK_FACTORS[unit]?.unit ?? null;
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
 * `null`, wenn kein Rezept es mit umrechenbarer Menge nennt.
 */
export function stockUnitFromRecipes(tables: FoodTables & Pick<RecipeTables, 'recipeIngredients'>, foodId: string): StockUnit | null {
  const resolver = createFoodResolver(tables);
  const counts = new Map<StockUnit, number>();
  for (const row of Object.values(tables.recipeIngredients)) {
    if (!isActive(row) || row.kind !== 'ingredient' || typeof row.amount !== 'number') continue;
    const unit = stockUnitOf(row.unit);
    if (!unit || resolver.resolve(row.name)?.id !== foodId) continue;
    counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  let best: StockUnit | null = null;
  for (const [unit, count] of counts) if (best === null || count > (counts.get(best) ?? 0)) best = unit;
  return best;
}

/** Lebensmittel, die ein Rezept braucht; nur sie und was „immer im Haus“ ist, kommen in den Vorrat. */
export function foodsInRecipes(tables: FoodTables & Pick<RecipeTables, 'recipeIngredients'>): Set<string> {
  const resolver = createFoodResolver(tables);
  const ids = new Set<string>();
  for (const row of Object.values(tables.recipeIngredients)) {
    if (!isActive(row) || row.kind !== 'ingredient') continue;
    const food = resolver.resolve(row.name);
    if (food) ids.add(food.id);
  }
  return ids;
}

// ─── Bestand ───

export type StockState = {
  level: number;
  unit: StockUnit;
  /** Letzter Tag, an dem ein Rest von Frischem noch zählt; `null` = hält oder ist leer. */
  expiresOn: string | null;
};

/**
 * Bestand aller Lebensmittel mit Vorratseinheit am Tag `today`. Die Buchungen zählen der Reihe nach:
 * Ein Abgang leert höchstens, und ist seit dem letzten Zugang die Haltbarkeit vorbei, ist nichts mehr da.
 */
export function stockStates(tables: PantryTables, today: string): Map<string, StockState> {
  const bookings = new Map<string, PantryBookingRow[]>();
  for (const booking of Object.values(tables.pantryBookings)) {
    const food = tables.foods[booking.foodId];
    if (!food || !isActive(food) || !isActive(booking) || food.stockUnit !== booking.unit) continue;
    const list = bookings.get(booking.foodId);
    if (list) list.push(booking);
    else bookings.set(booking.foodId, [booking]);
  }
  const states = new Map<string, StockState>();
  for (const [id, food] of Object.entries(tables.foods)) {
    if (!isActive(food) || !food.stockUnit) continue;
    const shelfLife = shelfLifeDays(food);
    let level = 0;
    let refilled: string | null = null;
    const expired = (day: string) => shelfLife !== null && refilled !== null && daysBetween(refilled, day) > shelfLife;
    for (const booking of (bookings.get(id) ?? []).sort((a, b) => a.createdAt - b.createdAt)) {
      const day = dayOf(booking.createdAt);
      if (level > 0 && expired(day)) level = 0;
      level = Math.max(0, level + booking.amount);
      if (booking.amount > 0) refilled = day;
    }
    if (level > 0 && expired(today)) level = 0;
    // Gegen Rundungsreste aus Kommazahlen
    level = Math.round(level * 1000) / 1000;
    const expiresOn = shelfLife !== null && refilled !== null && level > 0 ? addDays(refilled, shelfLife) : null;
    states.set(id, { level, unit: food.stockUnit, expiresOn });
  }
  return states;
}

export function stockLevels(tables: PantryTables, today: string): Map<string, number> {
  return new Map([...stockStates(tables, today)].map(([id, state]) => [id, state.level]));
}

export function stockOf(tables: PantryTables, foodId: string, today: string): number {
  return stockStates(tables, today).get(foodId)?.level ?? 0;
}

/** Buchungen eines Lebensmittels in seiner Vorratseinheit, die neueste zuerst. */
export function stockBookings(tables: PantryTables, foodId: string): (PantryBookingRow & { id: string })[] {
  const unit = tables.foods[foodId]?.stockUnit;
  return Object.entries(tables.pantryBookings)
    .filter(([, booking]) => booking.foodId === foodId && booking.unit === unit && isActive(booking))
    .map(([id, booking]) => ({ id, ...booking }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Eintrag im Vorrat: was daheim ist und was „immer im Haus“ sein soll. */
export type PantryEntry = {
  foodId: string;
  name: string;
  category: FoodCategory;
  stock: FoodStock;
  staple: boolean;
  /** Bestand in der Vorratseinheit; `null` ohne Menge („immer im Haus“, noch nie gekauft). */
  level: number | null;
  unit: StockUnit | null;
  /** Immer im Haus, aber leer oder auf „nachkaufen“: kommt auf die nächste Liste. */
  empty: boolean;
  /** Tage, die ein Rest von Frischem noch zählt (0 = heute zum letzten Mal); `null` = hält. */
  daysLeft: number | null;
};

/** Was daheim ist (Bestand über 0) und was immer im Haus sein soll, alphabetisch. */
export function pantryOverview(tables: PantryTables, today: string): PantryEntry[] {
  const states = stockStates(tables, today);
  const entries: PantryEntry[] = [];
  for (const [id, food] of Object.entries(tables.foods)) {
    if (!isActive(food)) continue;
    const state = states.get(id);
    const staple = Boolean(food.stock);
    if (!staple && !(state && state.level > 0)) continue;
    entries.push({
      foodId: id,
      name: food.name,
      category: food.category,
      stock: food.stock ?? '',
      staple,
      level: state ? state.level : null,
      unit: state ? state.unit : null,
      empty: state ? staple && state.level <= 0 : food.stock === 'buy',
      daysLeft: state?.expiresOn ? daysBetween(today, state.expiresOn) : null,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
}

// ─── Schreiben ───

/** Feste IDs für Einkauf (je Liste) und Kochen (je Planeintrag): So bucht kein Gerät doppelt. */
export function bookingId(sourceId: string, foodId: string): string {
  return `${sourceId}~${foodId}`;
}

export function pantryBooking(
  rowId: string,
  cells: Omit<PantryBookingRow, 'listId' | 'entryId' | 'deletedAt'> & Partial<Pick<PantryBookingRow, 'listId' | 'entryId'>>,
): RowWrite {
  return { table: 'pantryBookings', rowId, cells: { listId: '', entryId: '', ...cells, deletedAt: null } };
}

/** „Immer im Haus“: Ist es leer (oder ohne Menge auf „nachkaufen“), kommt es auf die nächste Liste. */
export function setStaple(tables: PantryTables, foodId: string, staple: boolean): RowWrite[] {
  const food = tables.foods[foodId];
  if (!food) return [];
  const write = changedCells('foods', foodId, food, { stock: staple ? food.stock || 'have' : '' });
  return write ? [write] : [];
}

/** Wechselt die Vorratseinheit. Buchungen in der alten Einheit zählen dann nicht mehr, bleiben aber erhalten. */
export function setStockUnit(tables: PantryTables, foodId: string, unit: StockUnit): RowWrite[] {
  const food = tables.foods[foodId];
  if (!food) return [];
  const write = changedCells('foods', foodId, food, { stockUnit: unit });
  return write ? [write] : [];
}

/**
 * „Hinzufügen“ im Vorrat: „1 kg Reis“ bucht 1000 g dazu, „Salz“ ohne Menge kommt als „immer im Haus“ dazu.
 * Passt die Menge nicht zur Vorratseinheit (500 g Zwiebeln, gezählt in Stück), gilt es ebenfalls als immer im Haus.
 */
export function addToPantry(
  tables: PantryTables,
  text: string,
  now: number,
  createId: () => string,
): { foodId: string; writes: RowWrite[] } | null {
  const parsed = parseIngredientLine(text);
  const resolver = createFoodResolver(tables);
  const food = parsed?.name ? resolver.resolve(parsed.name) : null;
  if (!parsed || !food) return null;
  const writes = resolver.newFoodWrites();
  const existing = tables.foods[food.id];
  const unit = existing?.stockUnit || (parsed.amount === null ? null : stockUnitOf(parsed.unit));
  const amount = unit && parsed.amount !== null ? toStockAmount(parsed.amount, parsed.unit, unit) : null;
  if (unit && amount && amount > 0) {
    if (!existing?.stockUnit) writes.push({ table: 'foods', rowId: food.id, cells: { stockUnit: unit } });
    writes.push(pantryBooking(createId(), { foodId: food.id, amount, unit, reason: 'correction', createdAt: now }));
  } else {
    writes.push({ table: 'foods', rowId: food.id, cells: { stock: existing?.stock || 'have' } });
  }
  return { foodId: food.id, writes };
}

/**
 * Trägt den Bestand ein, z. B. nach einem Blick in den Schrank: Die Differenz wird als Korrektur gebucht.
 * Ohne Vorratseinheit bekommt das Lebensmittel `unit`.
 */
export function correctStock(
  tables: PantryTables,
  foodId: string,
  amount: number,
  now: number,
  createId: () => string,
  unit?: StockUnit,
): RowWrite[] {
  const food = tables.foods[foodId];
  const stockUnit = food?.stockUnit || unit;
  if (!food || !stockUnit || !Number.isFinite(amount)) return [];
  const writes: RowWrite[] = food.stockUnit ? [] : [{ table: 'foods', rowId: foodId, cells: { stockUnit } }];
  const current = food.stockUnit ? stockOf(tables, foodId, dayOf(now)) : 0;
  const difference = Math.round((Math.max(0, amount) - current) * 1000) / 1000;
  if (difference !== 0) {
    writes.push(pantryBooking(createId(), { foodId, amount: difference, unit: stockUnit, reason: 'correction', createdAt: now }));
  }
  return writes;
}
