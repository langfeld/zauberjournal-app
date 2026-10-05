import { formatShortDate } from './dates.ts';
import { FOOD_CATEGORIES, type FoodCategory } from './food-catalog.ts';
import { createFoodResolver, type FoodResolver, type FoodStock } from './foods.ts';
import { parseIngredientLine } from './ingredient-line.ts';
import { buildPlanEntry, createDietLookup, type PlanTables } from './plan.ts';
import { formatAmount, roundScaledAmount } from './quantity.ts';
import type { IngredientItem } from './recipe.ts';
import { packsFor, parsePackSize, type ReweProductRow, type ReweState } from './rewe.ts';
import { changedCells, isActive, type RowWrite, type Table } from './rows.ts';
import { unitLabel } from './units.ts';

export type ShoppingListStatus = 'open' | 'done';
export type ShoppingListRow = { name: string; status: ShoppingListStatus; createdAt: number; deletedAt: number | null };

/** Herkunft einer Position: aus dem Plan, aus dem Vorrat („nachkaufen“) oder von Hand eingetragen. */
export type ShoppingItemOrigin = 'plan' | 'pantry' | 'manual';

export type ShoppingItemRow = {
  listId: string;
  foodId: string;
  name: string;
  amount: number | null;
  unit: string;
  checked: boolean;
  origin: ShoppingItemOrigin;
  /** Packungen bei REWE, von Hand geändert; `null` = aus der Menge berechnet. */
  rewePacks: number | null;
  createdAt: number;
  deletedAt: number | null;
};

export type ShoppingTables = PlanTables & {
  shoppingLists: Table<ShoppingListRow>;
  shoppingItems: Table<ShoppingItemRow>;
  reweProducts: Table<ReweProductRow>;
};

// ─── Einheiten zusammenfassen ───

type UnitGroup = { group: string; factor: number };

/** Einheiten, die sich ineinander umrechnen lassen; alles andere bleibt für sich (Dose, Bund, Zehe …). */
const UNIT_GROUPS: Record<string, UnitGroup> = {
  g: { group: 'mass', factor: 1 },
  kg: { group: 'mass', factor: 1000 },
  ml: { group: 'volume', factor: 1 },
  cl: { group: 'volume', factor: 10 },
  dl: { group: 'volume', factor: 100 },
  l: { group: 'volume', factor: 1000 },
  TL: { group: 'spoon', factor: 1 },
  EL: { group: 'spoon', factor: 3 },
  '': { group: 'piece', factor: 1 },
  Stück: { group: 'piece', factor: 1 },
};

function unitGroup(unit: string): UnitGroup {
  return UNIT_GROUPS[unit] ?? { group: unit, factor: 1 };
}

/** Summe in einer gut lesbaren Einheit: bei nur einer Einheit diese, sonst g/kg, ml/l, TL/EL. */
function displayAmount(group: string, base: number, units: ReadonlySet<string>): { amount: number; unit: string } {
  if (units.size === 1) {
    const [unit] = units as Set<string>;
    return { amount: base / unitGroup(unit!).factor, unit: unit! };
  }
  switch (group) {
    case 'mass':
      return base >= 1000 ? { amount: base / 1000, unit: 'kg' } : { amount: base, unit: 'g' };
    case 'volume':
      return base >= 1000 ? { amount: base / 1000, unit: 'l' } : { amount: base, unit: 'ml' };
    case 'spoon':
      return base >= 3 ? { amount: base / 3, unit: 'EL' } : { amount: base, unit: 'TL' };
    case 'piece':
      return { amount: base, unit: 'Stück' };
    default:
      return { amount: base, unit: group };
  }
}

// ─── Bedarf aus dem Plan ───

export type NeedSource = { entryId: string; date: string; title: string };

export type ShoppingNeed = {
  /** Lebensmittel und Einheitengruppe, z. B. „food:mehl~mass“. */
  key: string;
  foodId: string;
  name: string;
  category: FoodCategory;
  amount: number | null;
  unit: string;
  sources: NeedSource[];
};

const NO_AMOUNT = 'none';

/**
 * Bedarf für die gewählten Planeinträge, je Lebensmittel und Einheitengruppe summiert.
 * Die Basiszutaten zählen für alle Portionen, die Zutaten einer Option nur für die Portionen,
 * die diese Option bekommen. Bei Spannen („2–3“) zählt die Obergrenze.
 * Zutaten ohne Menge („Salz“) erscheinen nur, wenn das Lebensmittel nicht schon mit Menge gebraucht wird.
 */
export function computeShoppingNeeds(tables: PlanTables, entryIds: readonly string[], resolver: FoodResolver): ShoppingNeed[] {
  const dietOf = createDietLookup(tables);
  type Sum = Omit<ShoppingNeed, 'amount' | 'unit' | 'sources'> & {
    group: string;
    base: number;
    units: Set<string>;
    sources: Map<string, NeedSource>;
  };
  const sums = new Map<string, Sum>();

  for (const entryId of entryIds) {
    const entry = buildPlanEntry(tables, entryId, dietOf);
    const recipe = entry?.recipe;
    if (!entry || !recipe || entry.servings <= 0) continue;

    const add = (item: IngredientItem, factor: number) => {
      if (item.kind !== 'ingredient' || factor <= 0) return;
      const food = resolver.resolve(item.name);
      if (!food) return;
      const amount = item.amountMax ?? item.amount;
      const { group, factor: unitFactor } = amount === null ? { group: NO_AMOUNT, factor: 1 } : unitGroup(item.unit);
      const key = `${food.id}~${group}`;
      let sum = sums.get(key);
      if (!sum) {
        sum = { key, foodId: food.id, name: food.name, category: food.category, group, base: 0, units: new Set(), sources: new Map() };
        sums.set(key, sum);
      }
      if (amount !== null) {
        sum.base += amount * factor * unitFactor;
        sum.units.add(item.unit);
      }
      sum.sources.set(entryId, { entryId, date: entry.date, title: entry.title });
    };

    recipe.ingredients.forEach((item) => add(item, entry.servings / recipe.servings));
    for (const group of recipe.groups) {
      for (const option of group.options) {
        const count = entry.distribution[group.id]?.[option.id] ?? 0;
        option.ingredients.forEach((item) => add(item, count / recipe.servings));
      }
    }
  }

  const withAmount = new Set([...sums.values()].filter((sum) => sum.group !== NO_AMOUNT).map((sum) => sum.foodId));
  const order = new Map(FOOD_CATEGORIES.map((category, index) => [category.id as string, index]));

  return [...sums.values()]
    .filter((sum) => sum.group !== NO_AMOUNT || !withAmount.has(sum.foodId))
    .map((sum): ShoppingNeed => {
      const { amount, unit } =
        sum.group === NO_AMOUNT ? { amount: null, unit: '' } : displayAmount(sum.group, sum.base, sum.units);
      return {
        key: sum.key,
        foodId: sum.foodId,
        name: sum.name,
        category: sum.category,
        amount,
        unit: unit === '' && amount !== null ? 'Stück' : unit,
        sources: [...sum.sources.values()].sort((a, b) => a.date.localeCompare(b.date)),
      };
    })
    .sort(
      (a, b) =>
        (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
        a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
    );
}

/** Planeinträge einer Einkaufsliste. */
export function listEntryIds(tables: PlanTables, listId: string): string[] {
  return Object.entries(tables.planEntries)
    .filter(([, entry]) => isActive(entry) && entry.shoppingListId === listId)
    .map(([id]) => id);
}

/** Positionen aus Plan und Vorrat haben feste IDs, damit zwei Geräte dieselbe Zeile pflegen. */
function derivedItemId(listId: string, key: string): string {
  return `${listId}~${key}`;
}

/**
 * Gleicht die Positionen einer Liste mit Plan und Vorrat ab und liefert nur echte Änderungen.
 * - Bedarf aus den Planeinträgen der Liste wird angelegt oder angepasst.
 * - Lebensmittel mit „nachkaufen“ im Vorrat kommen dazu, falls kein Rezept sie braucht.
 * - Was nicht mehr gebraucht wird, verschwindet, außer es ist schon abgehakt.
 * - Von Hand eingetragene Positionen bleiben, wie sie sind.
 */
export function syncShoppingList(tables: ShoppingTables, listId: string, now: number): RowWrite[] {
  const list = tables.shoppingLists[listId];
  if (!list || !isActive(list) || list.status !== 'open') return [];
  const resolver = createFoodResolver(tables);
  const needs = computeShoppingNeeds(tables, listEntryIds(tables, listId), resolver);

  const desired = new Map<string, Omit<ShoppingItemRow, 'checked' | 'rewePacks' | 'createdAt'>>();
  for (const need of needs) {
    desired.set(derivedItemId(listId, need.key), {
      listId,
      foodId: need.foodId,
      name: need.name,
      amount: need.amount,
      unit: need.unit,
      origin: 'plan',
      deletedAt: null,
    });
  }
  const needed = new Set(needs.map((need) => need.foodId));
  for (const [foodId, food] of Object.entries(tables.foods)) {
    if (!isActive(food) || food.stock !== 'buy' || needed.has(foodId)) continue;
    desired.set(derivedItemId(listId, `${foodId}~pantry`), {
      listId,
      foodId,
      name: food.name,
      amount: null,
      unit: '',
      origin: 'pantry',
      deletedAt: null,
    });
  }

  const writes = resolver.newFoodWrites();
  for (const [id, cells] of desired) {
    const existing = tables.shoppingItems[id];
    const write = changedCells('shoppingItems', id, existing, existing ? cells : { ...cells, checked: false, createdAt: now });
    if (write) writes.push(write);
  }
  for (const [id, item] of Object.entries(tables.shoppingItems)) {
    const derived = item.origin === 'plan' || item.origin === 'pantry';
    if (item.listId === listId && derived && isActive(item) && !item.checked && !desired.has(id)) {
      writes.push({ table: 'shoppingItems', rowId: id, cells: { deletedAt: now } });
    }
  }
  return writes;
}

// ─── Ansicht ───

export type ShoppingItemView = {
  id: string;
  foodId: string;
  name: string;
  /** z. B. „500 g“ oder „2 Zehen“; leer ohne Menge. */
  amount: string;
  checked: boolean;
  origin: ShoppingItemOrigin;
  /** Für welche Gerichte, jedes einmal in der Reihenfolge des Plans. */
  dishes: ShoppingItemDish[];
  /** Dasselbe als Text, z. B. „2× Curry, Lasagne“. */
  sources: string;
  stock: FoodStock;
  category: FoodCategory;
  /** REWE-Produkt des Lebensmittels; `null`, solange es nicht abgeglichen ist. */
  rewe: ShoppingItemRewe | null;
};

/** REWE-Produkt einer Position, mit den Packungen für ihre Menge. */
export type ShoppingItemRewe = {
  state: ReweState;
  productId: string;
  name: string;
  imageUrl: string;
  grammage: string;
  /** Preis einer Packung in Cent. */
  price: number;
  packs: number;
  /** Packungen von Hand geändert. */
  manualPacks: boolean;
};

/** Stand des REWE-Abgleichs für alles, was noch zu kaufen ist. */
export type ShoppingListRewe = {
  /** Positionen mit Produkt und ihr Preis zusammen, in Cent. */
  products: number;
  total: number;
  /** Bitte prüfen: unsichere Vorschläge, nicht gefundene und solche ohne Treffer. */
  toCheck: number;
  /** Noch nicht abgeglichen, z. B. neu hinzugekommen. */
  pending: number;
};

/** Ein Gericht, für das eine Zutat gebraucht wird; `count` zählt, wie oft es auf der Liste steht. */
export type ShoppingItemDish = { title: string; photo: string; count: number };

export type ShoppingSection = { category: FoodCategory; label: string; items: ShoppingItemView[] };

/** Ein Gericht auf der Liste, mit dem Foto seines Rezepts (leer, wenn es keins gibt). */
export type ShoppingListEntry = NeedSource & { photo: string };

export type ShoppingListView = {
  id: string;
  name: string;
  status: ShoppingListStatus;
  createdAt: number;
  entries: ShoppingListEntry[];
  /** Noch zu kaufen, nach Warengruppen. */
  sections: ShoppingSection[];
  /** Lebensmittel, die laut Vorrat da sind: vor dem Einkauf prüfen. */
  pantry: ShoppingItemView[];
  /** Abgehakt. */
  done: ShoppingItemView[];
  rewe: ShoppingListRewe;
};

function itemRewe(item: ShoppingItemRow, category: FoodCategory, product: ReweProductRow | undefined): ShoppingItemRewe | null {
  if (!product) return null;
  const manualPacks = item.rewePacks !== null && item.rewePacks !== undefined;
  return {
    state: product.state,
    productId: product.productId,
    name: product.name,
    imageUrl: product.imageUrl,
    grammage: product.grammage,
    price: product.price,
    packs: manualPacks
      ? item.rewePacks!
      : packsFor(item.amount, item.unit, parsePackSize(product.grammage, product.name), category),
    manualPacks,
  };
}

/** Zählt Produkte, Preis und Offenes des Abgleichs. */
function summarizeRewe(items: readonly ShoppingItemView[]): ShoppingListRewe {
  const summary: ShoppingListRewe = { products: 0, total: 0, toCheck: 0, pending: 0 };
  for (const { foodId, rewe } of items) {
    if (!rewe) {
      if (foodId) summary.pending += 1;
      continue;
    }
    if (rewe.state === 'unsure' || rewe.state === 'missing' || rewe.state === 'none') summary.toCheck += 1;
    if (rewe.state !== 'none' && rewe.state !== 'skip' && rewe.productId) {
      summary.products += 1;
      summary.total += rewe.packs * rewe.price;
    }
  }
  return summary;
}

/** Fasst die Planeinträge einer Zutat zu Gerichten zusammen: jedes einmal, mehrfach geplante mit Anzahl. */
export function groupDishes(sources: readonly NeedSource[], photoOf: (entryId: string) => string): ShoppingItemDish[] {
  const dishes = new Map<string, ShoppingItemDish>();
  for (const source of sources) {
    const dish = dishes.get(source.title);
    if (dish) dish.count += 1;
    else dishes.set(source.title, { title: source.title, photo: photoOf(source.entryId), count: 1 });
  }
  return [...dishes.values()];
}

/** z. B. „3× Curry, Salat“. Die Tage stehen schon bei den Gerichten der Liste. */
export function describeDishes(dishes: readonly ShoppingItemDish[]): string {
  return dishes.map(({ title, count }) => (count > 1 ? `${count}× ${title}` : title)).join(', ');
}

export function formatItemAmount(amount: number | null, unit: string): string {
  if (amount === null) return '';
  const rounded = roundScaledAmount(amount, unit);
  return [formatAmount(rounded, null, unit), unit ? unitLabel(unit, rounded > 1) : ''].filter(Boolean).join(' ');
}

/** Offene Listen, die neueste zuerst. */
export function listOpenShoppingLists(tables: ShoppingTables): { id: string; name: string; createdAt: number }[] {
  return Object.entries(tables.shoppingLists)
    .filter(([, list]) => isActive(list) && list.status === 'open')
    .map(([id, list]) => ({ id, name: list.name, createdAt: list.createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function buildShoppingListView(tables: ShoppingTables, listId: string): ShoppingListView | undefined {
  const list = tables.shoppingLists[listId];
  if (!list || !isActive(list)) return undefined;
  const resolver = createFoodResolver(tables);
  const entryIds = listEntryIds(tables, listId);
  const needs = new Map(
    computeShoppingNeeds(tables, entryIds, resolver).map((need) => [derivedItemId(listId, need.key), need]),
  );
  const dietOf = createDietLookup(tables);
  const entries = entryIds
    .flatMap((id) => {
      const entry = buildPlanEntry(tables, id, dietOf);
      return entry ? [{ entryId: id, date: entry.date, title: entry.title, photo: entry.recipe?.photo ?? '' }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const photos = new Map(entries.map((entry) => [entry.entryId, entry.photo]));
  const photoOf = (entryId: string) => photos.get(entryId) ?? '';

  const items = Object.entries(tables.shoppingItems)
    .filter(([, item]) => item.listId === listId && isActive(item))
    .map(([id, item]): ShoppingItemView => {
      const food = tables.foods[item.foodId];
      const dishes = item.origin === 'plan' ? groupDishes(needs.get(id)?.sources ?? [], photoOf) : [];
      const category = food && isActive(food) ? food.category : 'other';
      return {
        id,
        foodId: item.foodId,
        name: item.name,
        amount: formatItemAmount(item.amount, item.unit),
        checked: item.checked,
        origin: item.origin,
        dishes,
        sources: describeDishes(dishes),
        stock: food && isActive(food) ? (food.stock ?? '') : '',
        category,
        rewe: item.foodId ? itemRewe(item, category, tables.reweProducts[item.foodId]) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));

  const open = items.filter((item) => !item.checked);
  const toBuy = open.filter((item) => !(item.origin === 'plan' && item.stock === 'have'));
  return {
    id: listId,
    name: list.name,
    status: list.status,
    createdAt: list.createdAt,
    entries,
    sections: FOOD_CATEGORIES.map((category) => ({
      category: category.id,
      label: category.label,
      items: toBuy.filter((item) => item.category === category.id),
    })).filter((section) => section.items.length > 0),
    pantry: open.filter((item) => item.origin === 'plan' && item.stock === 'have'),
    done: items.filter((item) => item.checked),
    rewe: summarizeRewe(toBuy),
  };
}

// ─── Schreiben ───

/** Legt eine Liste für die gewählten Planeinträge an; die Positionen folgen mit `syncShoppingList`. */
export function createShoppingList(
  tables: ShoppingTables,
  entryIds: readonly string[],
  today: string,
  now: number,
  createId: () => string,
): { listId: string; writes: RowWrite[] } {
  const listId = createId();
  const writes: RowWrite[] = [
    {
      table: 'shoppingLists',
      rowId: listId,
      cells: { name: `Einkauf ${formatShortDate(today)}`, status: 'open', createdAt: now, deletedAt: null },
    },
  ];
  for (const entryId of entryIds) {
    if (tables.planEntries[entryId]) writes.push({ table: 'planEntries', rowId: entryId, cells: { shoppingListId: listId } });
  }
  return { listId, writes };
}

/** Setzt, welche Planeinträge zu einer Liste gehören. */
export function setShoppingListEntries(tables: ShoppingTables, listId: string, entryIds: readonly string[]): RowWrite[] {
  const wanted = new Set(entryIds);
  const writes: RowWrite[] = [];
  for (const [id, entry] of Object.entries(tables.planEntries)) {
    if (!isActive(entry)) continue;
    if (wanted.has(id) && entry.shoppingListId !== listId) {
      writes.push({ table: 'planEntries', rowId: id, cells: { shoppingListId: listId } });
    } else if (!wanted.has(id) && entry.shoppingListId === listId) {
      writes.push({ table: 'planEntries', rowId: id, cells: { shoppingListId: '' } });
    }
  }
  return writes;
}

/** Trägt eine Position von Hand ein, z. B. „2 l Milch“. */
export function addManualItem(
  tables: ShoppingTables,
  listId: string,
  text: string,
  now: number,
  createId: () => string,
): RowWrite[] {
  const parsed = parseIngredientLine(text);
  if (!parsed?.name) return [];
  const resolver = createFoodResolver(tables);
  const food = resolver.resolve(parsed.name);
  return [
    ...resolver.newFoodWrites(),
    {
      table: 'shoppingItems',
      rowId: createId(),
      cells: {
        listId,
        foodId: food?.id ?? '',
        name: parsed.name,
        amount: parsed.amountMax ?? parsed.amount,
        unit: parsed.unit,
        checked: false,
        origin: 'manual',
        createdAt: now,
        deletedAt: null,
      },
    },
  ];
}

/** Hakt eine Position ab oder wieder an. Abgehakte Lebensmittel aus dem Vorrat gelten danach als da. */
export function checkShoppingItem(tables: ShoppingTables, itemId: string, checked: boolean): RowWrite[] {
  const item = tables.shoppingItems[itemId];
  if (!item) return [];
  const writes: RowWrite[] = [{ table: 'shoppingItems', rowId: itemId, cells: { checked } }];
  const food = tables.foods[item.foodId];
  if (checked && food && isActive(food) && food.stock === 'buy') {
    writes.push({ table: 'foods', rowId: item.foodId, cells: { stock: 'have' } });
  }
  return writes;
}

export function removeShoppingItem(itemId: string, now: number): RowWrite[] {
  return [{ table: 'shoppingItems', rowId: itemId, cells: { deletedAt: now } }];
}

/** Schließt den Einkauf ab: Die Liste ist erledigt, ihre geplanten Gerichte gelten als eingekauft. */
export function completeShoppingList(tables: ShoppingTables, listId: string): RowWrite[] {
  const writes: RowWrite[] = [{ table: 'shoppingLists', rowId: listId, cells: { status: 'done' } }];
  for (const id of listEntryIds(tables, listId)) {
    if (tables.planEntries[id]?.status === 'planned') {
      writes.push({ table: 'planEntries', rowId: id, cells: { status: 'shopped' } });
    }
  }
  return writes;
}
