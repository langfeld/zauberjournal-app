import { createFoodResolver, type FoodResolver, type FoodTables } from './foods.ts';
import { foodsInRecipes } from './pantry.ts';
import { buildPlanEntry, createDietLookup, type PlanTables } from './plan.ts';
import { buildRecipeView, type IngredientItem, type RecipeTables } from './recipe.ts';
import { parsePackSize, type ReweProductRow } from './rewe.ts';
import { changedCells, isActive, type RowWrite, type Table } from './rows.ts';

/**
 * Nährwerte (M6): je Lebensmittel die Werte der üblichen Nährwerttabelle je 100 g, aus dem
 * Bundeslebensmittelschlüssel (BLS) oder für das REWE-Produkt aus Open Food Facts. Der Server schlägt
 * sie nach; die App merkt sie sich in `foodNutrition` und rechnet daraus Portionen und Personen.
 */

export const NUTRIENTS = ['kcal', 'fat', 'saturatedFat', 'carbs', 'sugar', 'fiber', 'protein', 'salt'] as const;

export type Nutrient = (typeof NUTRIENTS)[number];

export type NutrientValues = Record<Nutrient, number>;

/** Werte je 100 g; `null` = unbekannt. Die Energie ist immer bekannt, ohne sie taugen die Werte nicht. */
export type Per100 = { kcal: number } & Record<Exclude<Nutrient, 'kcal'>, number | null>;

export const NUTRIENT_INFO: Record<Nutrient, { label: string; unit: 'kcal' | 'g' }> = {
  kcal: { label: 'Energie', unit: 'kcal' },
  fat: { label: 'Fett', unit: 'g' },
  saturatedFat: { label: 'davon gesättigte Fettsäuren', unit: 'g' },
  carbs: { label: 'Kohlenhydrate', unit: 'g' },
  sugar: { label: 'davon Zucker', unit: 'g' },
  fiber: { label: 'Ballaststoffe', unit: 'g' },
  protein: { label: 'Eiweiß', unit: 'g' },
  salt: { label: 'Salz', unit: 'g' },
};

export const NUTRITION_SOURCES = ['', 'bls', 'off', 'none'] as const;

/** Leer = noch nicht nachgeschlagen, `none` = nichts gefunden. */
export type NutritionSource = (typeof NUTRITION_SOURCES)[number];

export const NUTRITION_CREDITS: Record<'bls' | 'off', string> = {
  bls: 'Bundeslebensmittelschlüssel 4.0, Max Rubner-Institut (CC BY 4.0)',
  off: 'Open Food Facts (ODbL)',
};

export type FoodNutritionRow = {
  source: NutritionSource;
  /** BLS-Code oder EAN. */
  code: string;
  /** Name des BLS-Eintrags oder Produkts, z. B. „Speisezwiebel roh“. */
  label: string;
  /** EAN, mit der zuletzt nachgeschlagen wurde; wechselt das REWE-Produkt, wird neu nachgeschlagen. */
  ean: string;
  /** Von Hand gewählt: wird nicht mehr automatisch ersetzt. */
  pinned: boolean;
  checkedAt: number;
  /** Gewicht eines Stücks (Zwiebel, Ei, Dose, Zehe …) in Gramm, wie die Rezepte es meinen. */
  gramsPerPiece: number | null;
} & Record<Nutrient, number | null>;

export type NutritionTables = FoodTables & {
  foodNutrition: Table<FoodNutritionRow>;
  reweProducts: Table<ReweProductRow>;
};

/** Was die App zum Nachschlagen schickt; `pieceUnit`: Stück-Einheit der Rezepte, z. B. „Zehe“, leer = keine. */
export type NutritionLookupItem = { id: string; name: string; ean: string; pieceUnit: string };

/** Antwort des Servers je Lebensmittel; `ean` ist die EAN, mit der nachgeschlagen wurde. */
export type NutritionResult = {
  id: string;
  source: 'bls' | 'off' | 'none';
  code: string;
  label: string;
  per100: Per100 | null;
  gramsPerPiece: number | null;
  ean: string;
  /** Nichts gefunden, weil etwas ausfiel (z. B. die KI): nicht merken, später neu nachschlagen. */
  temporary?: boolean;
};

// ─── Mengen in Gramm ───

/** Feste Gewichte; Gramm und Milliliter gelten als gleich. */
const UNIT_GRAMS: Record<string, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  EL: 15,
  TL: 5,
  Tasse: 240,
  Prise: 0.4,
  'Msp.': 0.3,
  Tropfen: 0.05,
  Spritzer: 1,
  Schuss: 10,
  Handvoll: 30,
};

/** Einheiten, deren Gewicht vom Lebensmittel abhängt: ein Stück Zwiebel, eine Dose Kichererbsen, eine Zehe Knoblauch. */
const PIECE_UNITS = new Set(['', 'Stück', 'Dose', 'Pck.', 'Becher', 'Glas', 'Flasche', 'Beutel', 'Kopf', 'Knolle', 'Stange', 'Würfel', 'Zehe', 'Bund', 'Scheibe', 'Zweig', 'Stiel', 'Blatt']);

/** Gramm einer Zutatenmenge; `null`, wenn sich das nicht umrechnen lässt (Stück ohne bekanntes Stückgewicht). */
export function ingredientGrams(amount: number, unit: string, gramsPerPiece: number | null): number | null {
  if (unit in UNIT_GRAMS) return amount * UNIT_GRAMS[unit]!;
  if (PIECE_UNITS.has(unit)) return gramsPerPiece ? amount * gramsPerPiece : null;
  return null;
}

// ─── Rechnen ───

export type NutritionSummary = {
  values: NutrientValues;
  /** Zutaten, die mangels Werten oder Stückgewicht nicht mitzählen. */
  missing: string[];
  /** Werte, die bei einer gezählten Zutat unbekannt sind; die Summe ist dann eine Untergrenze. */
  incomplete: Nutrient[];
};

function emptyValues(): NutrientValues {
  return Object.fromEntries(NUTRIENTS.map((key) => [key, 0])) as NutrientValues;
}

/** Werte je 100 g eines Lebensmittels; `null` ohne Daten. */
export function foodPer100(row: FoodNutritionRow | undefined): Per100 | null {
  if (!row || (row.source !== 'bls' && row.source !== 'off') || typeof row.kcal !== 'number') return null;
  return Object.fromEntries(NUTRIENTS.map((key) => [key, row[key] ?? null])) as Per100;
}

/**
 * Summe für Zutaten mit ihrem Faktor (Portionen ÷ Rezeptportionen). Zutaten ohne Menge („Salz“) zählen nicht
 * und fehlen auch nicht; bei Spannen („2–3“) zählt die Mitte.
 */
function summarize(tables: NutritionTables, items: readonly { item: IngredientItem; factor: number }[], resolver: FoodResolver): NutritionSummary {
  const values = emptyValues();
  const missing = new Set<string>();
  const incomplete = new Set<Nutrient>();
  for (const { item, factor } of items) {
    if (item.kind !== 'ingredient' || item.amount === null || factor <= 0) continue;
    const food = resolver.resolve(item.name);
    const row = food ? tables.foodNutrition[food.id] : undefined;
    const per100 = foodPer100(row);
    const amount = item.amountMax === null ? item.amount : (item.amount + item.amountMax) / 2;
    const grams = ingredientGrams(amount * factor, item.unit, row?.gramsPerPiece ?? null);
    if (!per100 || grams === null) {
      missing.add(item.name);
      continue;
    }
    for (const key of NUTRIENTS) {
      const value = per100[key];
      if (value === null) incomplete.add(key);
      else values[key] += (value * grams) / 100;
    }
  }
  for (const key of NUTRIENTS) values[key] = Math.round(values[key] * 10) / 10;
  return { values, missing: [...missing], incomplete: NUTRIENTS.filter((key) => incomplete.has(key)) };
}

export type EaterNutrition = { eaterId: string; name: string; servings: number; summary: NutritionSummary };

/** Nährwerte eines Planeintrags je Person, passend zu ihren Portionen und Optionen. */
export function planEntryNutrition(tables: PlanTables & NutritionTables, entryId: string): EaterNutrition[] {
  const entry = buildPlanEntry(tables, entryId, createDietLookup(tables));
  const recipe = entry?.recipe;
  if (!entry || !recipe || recipe.servings <= 0) return [];
  const resolver = createFoodResolver(tables);
  return entry.eaters.map((eater) => {
    const factor = eater.servings / recipe.servings;
    const items = recipe.ingredients.map((item) => ({ item, factor }));
    for (const group of recipe.groups) {
      const option = group.options.find((candidate) => candidate.id === eater.choices[group.id]?.optionId);
      for (const item of option?.ingredients ?? []) items.push({ item, factor });
    }
    return { eaterId: eater.id, name: eater.name, servings: eater.servings, summary: summarize(tables, items, resolver) };
  });
}

export type PortionNutrition = { label: string; summary: NutritionSummary };

/**
 * Nährwerte je Portion eines Rezepts. Mit Wahlkomponente je Option der ersten Gruppe („mit Hähnchen“),
 * weitere Gruppen mit ihrer ersten Option.
 */
export function recipeNutrition(tables: RecipeTables & NutritionTables, recipeId: string): PortionNutrition[] {
  const recipe = buildRecipeView(tables, recipeId);
  if (!recipe || recipe.servings <= 0) return [];
  const resolver = createFoodResolver(tables);
  const factor = 1 / recipe.servings;
  const base = recipe.ingredients.map((item) => ({ item, factor }));
  const [first, ...others] = recipe.groups;
  const rest = others.flatMap((group) => (group.options[0]?.ingredients ?? []).map((item) => ({ item, factor })));
  if (!first) return [{ label: '', summary: summarize(tables, [...base, ...rest], resolver) }];
  return first.options.map((option) => ({
    label: `mit ${option.name}`,
    summary: summarize(tables, [...base, ...option.ingredients.map((item) => ({ item, factor })), ...rest], resolver),
  }));
}

// ─── Nachschlagen ───

/** Wie lange „nichts gefunden“ gilt, bis es neu versucht wird. */
const RETRY_NONE = 14 * 24 * 60 * 60 * 1000;

/** EAN des REWE-Produkts, das der Haushalt für das Lebensmittel kauft; leer, wenn keins gilt. */
function currentEan(tables: NutritionTables, foodId: string): string {
  const product = tables.reweProducts[foodId];
  if (!product || product.state === 'none' || product.state === 'skip') return '';
  return product.ean ?? '';
}

/** Stück-Einheit, in der die Rezepte ein Lebensmittel meistens angeben, z. B. „Zehe“; leer = keine. */
function pieceUnits(tables: FoodTables & Pick<RecipeTables, 'recipeIngredients'>): Map<string, string> {
  const resolver = createFoodResolver(tables);
  const counts = new Map<string, Map<string, number>>();
  for (const row of Object.values(tables.recipeIngredients)) {
    if (!isActive(row) || row.kind !== 'ingredient' || typeof row.amount !== 'number' || !PIECE_UNITS.has(row.unit)) continue;
    const food = resolver.resolve(row.name);
    if (!food) continue;
    const unit = row.unit || 'Stück';
    const byUnit = counts.get(food.id) ?? new Map<string, number>();
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + 1);
    counts.set(food.id, byUnit);
  }
  return new Map([...counts].map(([foodId, byUnit]) => [foodId, [...byUnit].sort((a, b) => b[1] - a[1])[0]![0]]));
}

/**
 * Lebensmittel aus Rezepten, deren Nährwerte fehlen oder neu nachzuschlagen sind: noch nie nachgeschlagen, das
 * REWE-Produkt hat gewechselt, oder lange nichts gefunden. Von Hand Gewähltes bleibt.
 */
export function foodsNeedingNutrition(tables: NutritionTables & Pick<RecipeTables, 'recipeIngredients'>, now: number): NutritionLookupItem[] {
  const units = pieceUnits(tables);
  const items: NutritionLookupItem[] = [];
  for (const foodId of foodsInRecipes(tables)) {
    const food = tables.foods[foodId];
    if (!food || !isActive(food)) continue;
    const row = tables.foodNutrition[foodId];
    const ean = currentEan(tables, foodId);
    const due =
      !row || (!row.pinned && (!row.source || (row.ean ?? '') !== ean || (row.source === 'none' && now - row.checkedAt > RETRY_NONE)));
    if (due) items.push({ id: foodId, name: food.name, ean, pieceUnit: units.get(foodId) ?? '' });
  }
  return items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * Stückgewicht aus der Packung des REWE-Produkts, z. B. „1 Stück ca. 100 g“. Es gilt nur, wenn die Rezepte in
 * Stück zählen; bei Zehen hilft das Gewicht einer ganzen Knolle nicht.
 */
function packPieceGrams(tables: NutritionTables, foodId: string, pieceUnit: string): number | null {
  if (pieceUnit !== 'Stück') return null;
  const product = tables.reweProducts[foodId];
  const pack = product?.productId ? parsePackSize(product.grammage, product.name) : null;
  return pack?.unit === 'Stück' && pack.approxGrams ? pack.approxGrams : null;
}

function valueCells(per100: Per100 | null): Record<Nutrient, number | null> {
  return Object.fromEntries(NUTRIENTS.map((key) => [key, per100 ? per100[key] : null])) as Record<Nutrient, number | null>;
}

/**
 * Merkt sich, was der Server gefunden hat. Von Hand Gewähltes bleibt; ein schon bekanntes Stückgewicht auch.
 * Sonst gilt das der REWE-Packung („1 Stück ca. 100 g“) vor der Schätzung der KI.
 */
export function applyNutritionResults(
  tables: NutritionTables & Pick<RecipeTables, 'recipeIngredients'>,
  results: readonly NutritionResult[],
  now: number,
): RowWrite[] {
  const units = pieceUnits(tables);
  return results.flatMap((result) => {
    const row = tables.foodNutrition[result.id];
    if (!tables.foods[result.id] || row?.pinned || result.temporary) return [];
    const gramsPerPiece = row?.gramsPerPiece ?? packPieceGrams(tables, result.id, units.get(result.id) ?? '') ?? result.gramsPerPiece;
    const write = changedCells('foodNutrition', result.id, row, {
      source: result.source,
      code: result.code,
      label: result.label,
      ean: result.ean,
      pinned: false,
      checkedAt: now,
      gramsPerPiece,
      ...valueCells(result.per100),
    });
    return write ? [write] : [];
  });
}

/** Von Hand gewählter BLS-Eintrag; er bleibt, bis man wieder automatisch zuordnen lässt. */
export function chooseFoodNutrition(
  tables: NutritionTables,
  foodId: string,
  choice: { code: string; label: string; per100: Per100 },
  now: number,
): RowWrite[] {
  const row = tables.foodNutrition[foodId];
  const write = changedCells('foodNutrition', foodId, row, {
    source: 'bls',
    code: choice.code,
    label: choice.label,
    pinned: true,
    checkedAt: now,
    ...valueCells(choice.per100),
  });
  return write ? [write] : [];
}

/** Lässt die Nährwerte wieder automatisch nachschlagen. */
export function resetFoodNutrition(tables: NutritionTables, foodId: string): RowWrite[] {
  const row = tables.foodNutrition[foodId];
  return row ? [{ table: 'foodNutrition', rowId: foodId, cells: { pinned: false, source: '' } }] : [];
}

/** Stückgewicht von Hand; `null` = unbekannt. */
export function setGramsPerPiece(tables: NutritionTables, foodId: string, grams: number | null): RowWrite[] {
  const write = changedCells('foodNutrition', foodId, tables.foodNutrition[foodId], { gramsPerPiece: grams && grams > 0 ? grams : null });
  return write ? [write] : [];
}

/** Ob die Rezepte ein Lebensmittel in Stück (Zwiebel, Dose, Zehe …) angeben, und in welcher Einheit. */
export function pieceUnitOf(tables: FoodTables & Pick<RecipeTables, 'recipeIngredients'>, foodId: string): string {
  return pieceUnits(tables).get(foodId) ?? '';
}
