import { classifyNormalizedFood, hasLookalike, stemVariants, type FoodCategory, type FoodDiet } from './food-catalog.ts';
import { changedCells, isActive, type CellValue, type RowWrite, type Table } from './rows.ts';

/** Einfacher Vorrat: leer = nicht geführt, `have` = da, `buy` = nachkaufen. */
export type FoodStock = '' | 'have' | 'buy';

/** Einheit, in der ein genau geführtes Lebensmittel im Vorrat gezählt wird. */
export const STOCK_UNITS = ['g', 'ml', 'Stück'] as const;

export type StockUnit = (typeof STOCK_UNITS)[number];

export type FoodRow = {
  name: string;
  category: FoodCategory;
  diet: FoodDiet;
  stock: FoodStock;
  /** Genau geführt: Bestand in dieser Einheit, als Summe der Buchungen; leer = einfach oder gar nicht geführt. */
  stockUnit: StockUnit | '';
  deletedAt: number | null;
};

/** Zuordnung eines Zutatennamens; die Zeilen-ID ist der normalisierte Name. */
export type FoodAliasRow = { foodId: string };

export type FoodTables = { foods: Table<FoodRow>; foodAliases: Table<FoodAliasRow> };

/** Füllwörter, die nichts am Lebensmittel ändern: „2 große Zwiebeln“ sind Zwiebeln. */
const FILLER_WORDS = new Set([
  'frisch', 'frische', 'frischer', 'frisches', 'frischen',
  'groß', 'große', 'großer', 'großes', 'großen', 'gross', 'grosse', 'grosser', 'grosses', 'grossen',
  'klein', 'kleine', 'kleiner', 'kleines', 'kleinen',
  'mittelgroß', 'mittelgroße', 'mittelgroßer', 'mittelgroßes', 'mittelgroßen',
  'reif', 'reife', 'reifer', 'reifes', 'reifen',
  'bio', 'etwas', 'einige', 'evtl', 'eventuell', 'optional', 'ca', 'circa', 'ggf',
]);
/** Ab diesen Wörtern beschreibt der Rest die Verwendung: „Öl zum Braten“, „Butter für die Form“. */
const CUT_WORDS = new Set(['zum', 'zur', 'für', 'nach', 'oder', 'als']);

/** Lebensmittelname aus einem Zutatennamen, ohne Klammern und Füllwörter, z. B. „große Zwiebel“ → „Zwiebel“. */
export function cleanFoodName(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    const lower = word.toLocaleLowerCase('de');
    if (CUT_WORDS.has(lower) && kept.length > 0) break;
    if (!FILLER_WORDS.has(lower)) kept.push(word);
  }
  const cleaned = kept.join(' ');
  // Ein einzelnes Wort ist ein Hauptwort: groß schreiben („zwiebel“ → „Zwiebel“).
  return kept.length === 1 ? cleaned.charAt(0).toLocaleUpperCase('de') + cleaned.slice(1) : cleaned;
}

/** Suchschlüssel eines Lebensmittelnamens: klein geschrieben, Bindestriche als Leerzeichen. */
export function normalizeFoodName(name: string): string {
  return cleanFoodName(name).toLocaleLowerCase('de').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Vergleichsformen eines Suchschlüssels: die Wörter vor dem letzten, dazu je eine Grundform des letzten
 * („rote zwiebeln“ → „rote zwiebeln“, „rote zwiebel“). Gleiche Formen heißen gleiches Lebensmittel.
 */
function matchForms(key: string): string[] {
  const head = key.slice(0, key.lastIndexOf(' ') + 1);
  return stemVariants(key.slice(head.length)).map((variant) => head + variant);
}

/**
 * Prüft, ob zwei Suchschlüssel dasselbe Lebensmittel meinen: gleiche Wörter, nur das letzte darf
 * in Einzahl oder Mehrzahl stehen („zwiebeln“ = „zwiebel“, „rote zwiebel“ ≠ „zwiebel“).
 */
export function foodKeysMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const forms = new Set(matchForms(a));
  return matchForms(b).some((form) => forms.has(form));
}

/** Warengruppe und Ernährungsklasse für einen Namen, solange das Lebensmittel nicht im Katalog steht. */
export function classifyFood(name: string): { category: FoodCategory; diet: FoodDiet } {
  return classifyNormalizedFood(normalizeFoodName(name));
}

const FOOD_ID_PREFIX = 'food:';

/**
 * Automatisch angelegte Lebensmittel haben eine feste ID aus ihrem Suchschlüssel.
 * So legen zwei Geräte, die offline dieselbe Zutat sehen, dasselbe Lebensmittel an statt zwei.
 */
export function foodIdForKey(key: string): string {
  return `${FOOD_ID_PREFIX}${key}`;
}

export type ResolvedFood = {
  id: string;
  name: string;
  category: FoodCategory;
  diet: FoodDiet;
  stock: FoodStock;
  /** Steht noch nicht im Katalog; wird mit den Schreiboperationen angelegt. */
  isNew: boolean;
};

export type FoodResolver = {
  resolve: (ingredientName: string) => ResolvedFood | null;
  /** Schreiboperationen für alle Lebensmittel, die beim Zuordnen neu entstanden sind. */
  newFoodWrites: () => RowWrite[];
};

/**
 * Ordnet Zutatennamen Lebensmitteln zu:
 * 1. gemerkte Zuordnung (`foodAliases`),
 * 2. ein Lebensmittel mit gleichem oder ähnlichem Namen; bei mehreren gewinnt die kleinste ID, damit alle Geräte gleich entscheiden,
 * 3. sonst ein neues Lebensmittel mit Warengruppe und Ernährungsklasse aus dem Katalog.
 */
export function createFoodResolver(tables: FoodTables): FoodResolver {
  /** Lebensmittel je Vergleichsform (`matchForms`), damit nicht jeder Name mit allen verglichen werden muss */
  const byForm = new Map<string, string[]>();
  const addCandidate = (key: string, foodId: string) => {
    for (const form of matchForms(key)) {
      const ids = byForm.get(form);
      if (ids) ids.push(foodId);
      else byForm.set(form, [foodId]);
    }
  };
  const known = new Map<string, Omit<ResolvedFood, 'id' | 'isNew'>>();
  for (const [id, food] of Object.entries(tables.foods)) {
    if (!isActive(food)) continue;
    known.set(id, { name: food.name, category: food.category, diet: food.diet, stock: food.stock ?? '' });
    addCandidate(normalizeFoodName(food.name), id);
    if (id.startsWith(FOOD_ID_PREFIX)) addCandidate(id.slice(FOOD_ID_PREFIX.length), id);
  }
  for (const [key, alias] of Object.entries(tables.foodAliases)) {
    if (known.has(alias.foodId)) addCandidate(key, alias.foodId);
  }

  const created = new Map<string, ResolvedFood>();
  const cache = new Map<string, ResolvedFood | null>();

  const resolve = (ingredientName: string): ResolvedFood | null => {
    const key = normalizeFoodName(ingredientName);
    if (!key) return null;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    let result: ResolvedFood;
    const aliasId = tables.foodAliases[key]?.foodId;
    const matches = matchForms(key).flatMap((form) => byForm.get(form) ?? []);
    const foodId = aliasId && known.has(aliasId) ? aliasId : matches.sort()[0];
    if (foodId) {
      result = created.get(foodId) ?? { id: foodId, isNew: false, ...known.get(foodId)! };
    } else {
      const id = foodIdForKey(key);
      result = { id, name: cleanFoodName(ingredientName), ...classifyNormalizedFood(key), stock: '', isNew: true };
      created.set(id, result);
      addCandidate(key, id);
    }
    cache.set(key, result);
    return result;
  };

  const newFoodWrites = (): RowWrite[] =>
    [...created.values()].flatMap((food) => {
      const write = changedCells('foods', food.id, tables.foods[food.id], {
        name: food.name,
        category: food.category,
        diet: food.diet,
        deletedAt: null,
      });
      return write ? [write] : [];
    });

  return { resolve, newFoodWrites };
}

// ─── Katalog bearbeiten ───

export type FoodView = {
  id: string;
  name: string;
  category: FoodCategory;
  diet: FoodDiet;
  stock: FoodStock;
  stockUnit: StockUnit | '';
};

/** Aktive Lebensmittel, alphabetisch. */
export function listFoods(tables: FoodTables): FoodView[] {
  return Object.entries(tables.foods)
    .filter(([, food]) => isActive(food))
    .map(([id, food]) => ({
      id,
      name: food.name,
      category: food.category,
      diet: food.diet,
      stock: food.stock ?? '',
      stockUnit: food.stockUnit ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
}

export function updateFood(tables: FoodTables, foodId: string, cells: Partial<Omit<FoodRow, 'deletedAt'>>): RowWrite[] {
  const write = changedCells('foods', foodId, tables.foods[foodId], cells);
  return write ? [write] : [];
}

/**
 * Bessert die Ernährungsklasse gespeicherter Lebensmittel nach, wenn die Schlüsselwörter dazugelernt haben:
 * „unbekannt“ bekommt die Klasse, die sie jetzt kennen, und was nur nach Fleisch oder Fisch aussieht
 * („Limette“), verliert diese Klasse. Alle anderen Klassen bleiben, weil sie von Hand gewählt sein können.
 */
export function repairFoodDiets(tables: Pick<FoodTables, 'foods'>): RowWrite[] {
  return Object.entries(tables.foods).flatMap(([id, food]) => {
    if (!isActive(food)) return [];
    const key = normalizeFoodName(food.name);
    const { category, diet } = classifyNormalizedFood(key);
    let cells: Record<string, CellValue> | null = null;
    if (!food.diet && diet) cells = food.category === 'other' ? { diet, category } : { diet };
    const animal = (value: string) => value === 'meat' || value === 'fish';
    if (animal(food.diet) && !animal(diet) && hasLookalike(key)) {
      // Die Warengruppe stimmte dann meist auch nicht („Fruchtfleisch“ unter Fleisch & Wurst).
      cells = animal(food.category) ? { diet, category } : { diet };
    }
    const write = cells ? changedCells('foods', id, food, cells) : null;
    return write ? [write] : [];
  });
}

/** Legt ein Lebensmittel nach Namen an oder findet es; z. B. beim Hinzufügen zum Vorrat. */
export function ensureFood(tables: FoodTables, name: string): { foodId: string; writes: RowWrite[] } | null {
  const resolver = createFoodResolver(tables);
  const food = resolver.resolve(name);
  return food ? { foodId: food.id, writes: resolver.newFoodWrites() } : null;
}

/**
 * Führt ein Lebensmittel mit einem anderen zusammen, z. B. „Lauchzwiebeln“ mit „Frühlingszwiebeln“.
 * Alle Namen des alten zeigen danach auf das neue; das alte wird weich gelöscht.
 */
export function mergeFoods(tables: FoodTables, fromId: string, intoId: string, now: number): RowWrite[] {
  const from = tables.foods[fromId];
  const into = tables.foods[intoId];
  if (!from || !into || fromId === intoId) return [];
  const keys = new Set([normalizeFoodName(from.name)]);
  if (fromId.startsWith(FOOD_ID_PREFIX)) keys.add(fromId.slice(FOOD_ID_PREFIX.length));
  for (const [key, alias] of Object.entries(tables.foodAliases)) if (alias.foodId === fromId) keys.add(key);

  const writes: RowWrite[] = [...keys].filter(Boolean).map((key) => ({ table: 'foodAliases', rowId: key, cells: { foodId: intoId } }));
  if (!into.stock && from.stock) writes.push({ table: 'foods', rowId: intoId, cells: { stock: from.stock } });
  writes.push({ table: 'foods', rowId: fromId, cells: { deletedAt: now } });
  return writes;
}
