import { createFoodResolver, type StockUnit } from './foods.ts';
import { pantryBooking, toStockAmount } from './pantry.ts';
import { planUpdateEntry, type PlanStatus } from './plan.ts';
import { parsePackSize, type PackSize } from './rewe.ts';
import { isActive, type RowWrite } from './rows.ts';
import { buildShoppingListView, computeShoppingNeeds, isPantryCheck, type ShoppingTables } from './shopping.ts';

/**
 * Buchungen aus Einkauf und Küche, nur für genau geführte Lebensmittel: Nach dem Einkauf kommt das
 * Gekaufte in den Vorrat, beim Kochen geht ab, was die geplanten Portionen brauchen. Was sich nicht
 * sicher umrechnen lässt, wird nicht gebucht.
 */

// ─── Einkauf ───

/** Vorschlag zum Einbuchen einer Position; `amount` in der Vorratseinheit, `null` = unbekannt. */
export type PurchaseSuggestion = {
  itemId: string;
  foodId: string;
  name: string;
  unit: StockUnit;
  amount: number | null;
  /**
   * Vorausgewählt, wenn die Menge bekannt ist und die Position abgehakt ist oder gar keine dieser Positionen
   * (Einkauf über REWE). Was sonst abgehakt ist, z. B. Spülmittel aus der Drogerie, zählt dafür nicht.
   */
  selected: boolean;
};

/** Inhalt aller Packungen in der Vorratseinheit; eine Packung nach Gewicht zählt bei „Stück“ als ein Stück. */
function packContent(pack: PackSize | null, packs: number, unit: StockUnit): number | null {
  if (!pack) return unit === 'Stück' ? packs : null;
  if (pack.unit === 'g') return unit === 'Stück' ? packs : packs * pack.amount;
  if (unit === 'Stück') return packs * pack.amount;
  return pack.approxGrams && unit === 'g' ? packs * pack.amount * pack.approxGrams : null;
}

/**
 * Was nach dem Einkauf in den Vorrat kommt: Positionen genau geführter Lebensmittel, die gekauft werden
 * sollten. Die Menge kommt aus den REWE-Packungen, sonst aus der Liste.
 */
export function purchaseSuggestions(tables: ShoppingTables, listId: string): PurchaseSuggestion[] {
  const view = buildShoppingListView(tables, listId);
  if (!view) return [];
  // Was unter „Vorrat prüfen“ abgehakt wurde, war da und wurde nicht gekauft.
  const items = [...view.sections.flatMap((section) => section.items), ...view.done].filter(
    (item) => !isPantryCheck(item) && tables.foods[item.foodId]?.stockUnit && tables.shoppingItems[item.id],
  );
  const anyChecked = items.some((item) => item.checked);
  return items.flatMap((item) => {
    const unit = tables.foods[item.foodId]?.stockUnit;
    const row = tables.shoppingItems[item.id];
    if (!unit || !row) return [];
    const rewe = item.rewe;
    const amount =
      rewe?.productId && rewe.state !== 'none' && rewe.state !== 'skip'
        ? packContent(parsePackSize(rewe.grammage, rewe.name), rewe.packs, unit)
        : row.amount !== null
          ? toStockAmount(row.amount, row.unit, unit)
          : null;
    return [{ itemId: item.id, foodId: item.foodId, name: item.name, unit, amount, selected: amount !== null && (item.checked || !anyChecked) }];
  });
}

/** Bucht das Gekaufte in den Vorrat; `entries` sind die bestätigten Mengen in der Vorratseinheit. */
export function bookPurchase(
  tables: ShoppingTables,
  listId: string,
  entries: readonly { foodId: string; amount: number }[],
  now: number,
  createId: () => string,
): RowWrite[] {
  return entries.flatMap(({ foodId, amount }) => {
    const unit = tables.foods[foodId]?.stockUnit;
    if (!unit || !(amount > 0)) return [];
    return [pantryBooking(createId, { foodId, amount, unit, reason: 'purchase', listId, createdAt: now })];
  });
}

// ─── Küche ───

/**
 * Setzt den Status eines Planeintrags. „Gekocht“ bucht die Zutaten der geplanten Portionen ab, genau
 * einmal; wer den Status zurücknimmt, nimmt auch die Abbuchung zurück.
 */
export function planSetStatus(
  tables: ShoppingTables,
  entryId: string,
  status: PlanStatus,
  now: number,
  createId: () => string,
): RowWrite[] {
  if (!tables.planEntries[entryId]) return [];
  const writes = planUpdateEntry(tables, entryId, { status });
  const booked = Object.entries(tables.pantryBookings).filter(
    ([, booking]) => booking.entryId === entryId && booking.reason === 'cooked' && isActive(booking),
  );
  if (status !== 'cooked') {
    return [...writes, ...booked.map(([id]): RowWrite => ({ table: 'pantryBookings', rowId: id, cells: { deletedAt: now } }))];
  }
  if (booked.length > 0) return writes;
  for (const need of computeShoppingNeeds(tables, [entryId], createFoodResolver(tables))) {
    const food = tables.foods[need.foodId];
    if (!food || !isActive(food) || !food.stockUnit || need.amount === null) continue;
    let amount = toStockAmount(need.amount, need.unit, food.stockUnit);
    // Eine angebrochene Dose oder Zwiebel kommt nicht in den Vorrat zurück: ganze Stück abbuchen.
    if (amount && food.stockUnit === 'Stück') amount = Math.ceil(Math.round(amount * 100) / 100);
    if (amount) {
      writes.push(pantryBooking(createId, { foodId: need.foodId, amount: -amount, unit: food.stockUnit, reason: 'cooked', entryId, createdAt: now }));
    }
  }
  return writes;
}
