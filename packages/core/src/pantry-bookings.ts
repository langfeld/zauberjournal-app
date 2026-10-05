import type { FoodCategory } from './food-catalog.ts';
import { createFoodResolver, type StockUnit } from './foods.ts';
import { bookingId, foodsInRecipes, pantryBooking, stockUnitFromRecipes, stockUnitOf, toStockAmount } from './pantry.ts';
import { planUpdateEntry, type PlanStatus } from './plan.ts';
import { isLooseCategory, parsePackSize, type PackSize } from './rewe.ts';
import { isActive, type RowWrite } from './rows.ts';
import { buildShoppingListView, computeShoppingNeeds, isPantryCheck, type ShoppingItemRow, type ShoppingItemView, type ShoppingTables } from './shopping.ts';

/**
 * Buchungen aus Einkauf und Küche: Nach dem Einkauf kommt das Gekaufte in den Vorrat, beim Kochen geht ab,
 * was die geplanten Portionen brauchen. Was sich nicht sicher umrechnen lässt, wird nicht gebucht.
 */

// ─── Einkauf ───

/** Vorschlag zum Einbuchen eines Lebensmittels; `amount` in `unit`, `null` = unbekannt. */
export type PurchaseSuggestion = {
  foodId: string;
  name: string;
  unit: StockUnit;
  amount: number | null;
  /**
   * Vorausgewählt, wenn die Menge bekannt ist. Ist mindestens die Hälfte der Liste abgehakt, gilt das als
   * Einkauf im Laden: Dann ist nur Abgehaktes vorausgewählt. Einzelnes, z. B. Spülmittel aus der Drogerie,
   * ändert an einer Abholung nichts.
   */
  selected: boolean;
};

/**
 * Inhalt der Packungen in `unit`. Gramm und Milliliter gelten dabei als gleich. Abgepackte Ware zählt als
 * Stück je Packung; bei Obst, Gemüse, Fleisch und Fisch sind Stück einzelne Früchte oder Filets.
 */
function packContent(pack: PackSize | null, packs: number, unit: StockUnit, category: FoodCategory): number | null {
  const loose = isLooseCategory(category);
  if (!pack) return unit === 'Stück' && !loose ? packs : null;
  if (pack.unit === 'Stück') {
    if (unit === 'Stück') return packs * pack.amount;
    return unit === 'g' && pack.approxGrams ? packs * pack.amount * pack.approxGrams : null;
  }
  if (unit === 'Stück') return loose ? null : packs;
  return packs * pack.amount;
}

/** Einheit einer Packungsangabe: Liter und Milliliter zählen in ml, sonst Gramm bzw. Stück. */
function naturalPackUnit(pack: PackSize | null, grammage: string, name: string): StockUnit | null {
  if (!pack) return null;
  if (pack.unit === 'Stück') return 'Stück';
  const text = `${grammage.split('(')[0]} ${name}`.toLocaleLowerCase('de');
  return /\d\s*(ml|cl|l)\b/.test(text) ? 'ml' : 'g';
}

function listContent(rows: readonly ShoppingItemRow[], unit: StockUnit): number | null {
  let total: number | null = null;
  for (const row of rows) {
    if (row.amount === null) continue;
    const amount = toStockAmount(row.amount, row.unit, unit);
    if (amount !== null) total = (total ?? 0) + amount;
  }
  return total;
}

/**
 * Was nach dem Einkauf in den Vorrat kommt, je Lebensmittel: alles, was gekauft werden sollte und ein Rezept
 * braucht oder immer im Haus sein soll. Die Menge kommt aus den REWE-Packungen, sonst aus der Liste. Wer noch
 * keine Vorratseinheit hat, bekommt die der Rezepte, wenn der Einkauf dazu passt, sonst die der Packung.
 */
export function purchaseSuggestions(tables: ShoppingTables, listId: string): PurchaseSuggestion[] {
  const view = buildShoppingListView(tables, listId);
  if (!view) return [];
  const recipeFoods = foodsInRecipes(tables);
  // Was unter „Vorrat prüfen“ abgehakt wurde, war da und wurde nicht gekauft.
  const items = [...view.sections.flatMap((section) => section.items), ...view.done].filter((item) => {
    const food = tables.foods[item.foodId];
    return !isPantryCheck(item) && food && isActive(food) && (item.origin !== 'manual' || recipeFoods.has(item.foodId) || food.stock);
  });
  const inStore = items.length > 0 && items.filter((item) => item.checked).length * 2 >= items.length;

  const byFood = new Map<string, ShoppingItemView[]>();
  for (const item of items) byFood.set(item.foodId, [...(byFood.get(item.foodId) ?? []), item]);

  const suggestions: PurchaseSuggestion[] = [];
  for (const [foodId, foodItems] of byFood) {
    const food = tables.foods[foodId]!;
    const withProduct = foodItems.filter((item) => item.rewe?.productId && item.rewe.state !== 'none' && item.rewe.state !== 'skip');
    const rewe = withProduct[0]?.rewe ?? null;
    const packs = withProduct.reduce((sum, item) => sum + (item.rewe?.packs ?? 0), 0);
    const pack = rewe ? parsePackSize(rewe.grammage, rewe.name) : null;
    const rows = foodItems.flatMap((item) => tables.shoppingItems[item.id] ?? []);
    const contentIn = (unit: StockUnit) => (rewe ? packContent(pack, packs, unit, food.category) : listContent(rows, unit));

    let unit: StockUnit;
    if (food.stockUnit) unit = food.stockUnit;
    else {
      const natural = rewe
        ? naturalPackUnit(pack, rewe.grammage, rewe.name)
        : (rows.map((row) => (row.amount === null ? null : stockUnitOf(row.unit))).find(Boolean) ?? null);
      // Gramm und Milliliter gelten als gleich; dann zeigt der Vorrat die Einheit der Packung („1000 g Zucker“).
      const fromRecipes = stockUnitFromRecipes(tables, foodId);
      const metric = (unit: StockUnit | null) => unit === 'g' || unit === 'ml';
      const first = metric(natural) && metric(fromRecipes) ? [natural, fromRecipes] : [fromRecipes, natural];
      const candidates = [...first, 'g', 'ml', 'Stück'] as (StockUnit | null)[];
      unit = candidates.find((candidate): candidate is StockUnit => candidate !== null && contentIn(candidate) !== null) ?? natural ?? 'g';
    }
    const content = contentIn(unit);
    const amount = content === null ? null : Math.round(content * 1000) / 1000;
    suggestions.push({
      foodId,
      name: food.name,
      unit,
      amount,
      selected: amount !== null && amount > 0 && (!inStore || foodItems.some((item) => item.checked)),
    });
  }
  return suggestions.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
}

/**
 * Bucht das Gekaufte in den Vorrat, eine Buchung je Liste und Lebensmittel. Wer noch keine Vorratseinheit
 * hat, bekommt die des Vorschlags; „nachkaufen“ ist damit erledigt.
 */
export function bookPurchase(
  tables: ShoppingTables,
  listId: string,
  entries: readonly { foodId: string; amount: number; unit: StockUnit }[],
  now: number,
): RowWrite[] {
  return entries.flatMap(({ foodId, amount, unit }) => {
    const food = tables.foods[foodId];
    if (!food || !(amount > 0) || (food.stockUnit && food.stockUnit !== unit)) return [];
    const writes: RowWrite[] = [];
    const cells = { ...(food.stockUnit ? {} : { stockUnit: unit }), ...(food.stock === 'buy' ? { stock: 'have' } : {}) };
    if (Object.keys(cells).length > 0) writes.push({ table: 'foods', rowId: foodId, cells });
    writes.push(pantryBooking(bookingId(listId, foodId), { foodId, amount, unit, reason: 'purchase', listId, createdAt: now }));
    return writes;
  });
}

// ─── Küche ───

/** Nimmt die Abbuchung eines Planeintrags zurück, z. B. wenn er doch nicht gekocht oder gelöscht wurde. */
export function removeCookedBookings(tables: ShoppingTables, entryId: string, now: number): RowWrite[] {
  return Object.entries(tables.pantryBookings)
    .filter(([, booking]) => booking.entryId === entryId && booking.reason === 'cooked' && isActive(booking))
    .map(([id]): RowWrite => ({ table: 'pantryBookings', rowId: id, cells: { deletedAt: now } }));
}

/**
 * Setzt den Status eines Planeintrags. „Gekocht“ bucht die Zutaten der geplanten Portionen ab, genau
 * einmal und je Lebensmittel mit fester ID; wer den Status zurücknimmt, nimmt auch die Abbuchung zurück.
 */
export function planSetStatus(tables: ShoppingTables, entryId: string, status: PlanStatus, now: number): RowWrite[] {
  if (!tables.planEntries[entryId]) return [];
  const writes = planUpdateEntry(tables, entryId, { status });
  if (status !== 'cooked') return [...writes, ...removeCookedBookings(tables, entryId, now)];
  const booked = Object.values(tables.pantryBookings).some(
    (booking) => booking.entryId === entryId && booking.reason === 'cooked' && isActive(booking),
  );
  if (booked) return writes;

  const used = new Map<string, { amount: number; unit: StockUnit }>();
  for (const need of computeShoppingNeeds(tables, [entryId], createFoodResolver(tables))) {
    const food = tables.foods[need.foodId];
    if (!food || !isActive(food) || !food.stockUnit || need.amount === null) continue;
    const amount = toStockAmount(need.amount, need.unit, food.stockUnit);
    if (amount) used.set(need.foodId, { amount: (used.get(need.foodId)?.amount ?? 0) + amount, unit: food.stockUnit });
  }
  for (const [foodId, { amount, unit }] of used) {
    // Eine angebrochene Dose oder Zwiebel kommt nicht in den Vorrat zurück: ganze Stück abbuchen.
    const total = unit === 'Stück' ? Math.ceil(Math.round(amount * 100) / 100) : Math.round(amount * 1000) / 1000;
    writes.push(pantryBooking(bookingId(entryId, foodId), { foodId, amount: -total, unit, reason: 'cooked', entryId, createdAt: now }));
  }
  return writes;
}

/**
 * Eingekaufte Gerichte, deren Tag vorbei ist, gelten als gekocht und werden abgebucht. Gebucht wird jetzt,
 * also immer nach dem Einkauf, auch wenn die Liste erst Tage später abgeschlossen wurde. Wer ein Gericht
 * nicht gekocht hat, stellt es auf „geplant“ zurück.
 */
export function planAutoCook(tables: ShoppingTables, today: string, now: number): RowWrite[] {
  const writes: RowWrite[] = [];
  for (const [entryId, entry] of Object.entries(tables.planEntries)) {
    if (!isActive(entry) || !entry.recipeId || entry.status !== 'shopped' || entry.date >= today) continue;
    writes.push(...planSetStatus(tables, entryId, 'cooked', now));
  }
  return writes;
}
