import { mergeFoods } from './foods.ts';
import { addReweFavorites, reweFavoritesOf } from './rewe-shopping.ts';
import { isActive, type RowWrite } from './rows.ts';
import type { ShoppingTables } from './shopping.ts';

/** Vorschlag, Lebensmittel zusammenzuführen, z. B. von der KI: Alle in `foodIds` werden zu `keepId`. */
export type FoodDuplicateGroup = { keepId: string; foodIds: string[]; reason: string };

/**
 * Führt Lebensmittel mit `keepId` zusammen, ohne etwas zu verlieren: Ihre Namen zeigen danach auf das
 * bleibende, gemerkte REWE-Produkte reihen sich hinter dessen eigenen ein, Vorratsbuchungen und eigene
 * Positionen der Einkaufslisten ziehen um. REWE-Produkt und Nährwerte gehen nur über, wo das bleibende keine hat.
 */
export function mergeFoodGroup(tables: ShoppingTables, keepId: string, foodIds: readonly string[], now: number): RowWrite[] {
  const keep = tables.foods[keepId];
  if (!keep || !isActive(keep)) return [];
  const fromIds = [...new Set(foodIds)].filter((id) => {
    const food = tables.foods[id];
    return id !== keepId && food !== undefined && isActive(food);
  });
  if (fromIds.length === 0) return [];
  const writes = fromIds.flatMap((id) => mergeFoods(tables, id, keepId, now));
  const merged = new Set(fromIds);

  // Ohne eigene Vorratseinheit übernimmt das bleibende die erste vorhandene; Buchungen in einer anderen zählen nicht.
  const unit = fromIds.map((id) => tables.foods[id]?.stockUnit).find(Boolean);
  if (!keep.stockUnit && unit) writes.push({ table: 'foods', rowId: keepId, cells: { stockUnit: unit } });
  for (const [id, booking] of Object.entries(tables.pantryBookings)) {
    if (isActive(booking) && merged.has(booking.foodId)) writes.push({ table: 'pantryBookings', rowId: id, cells: { foodId: keepId } });
  }
  // Positionen aus Plan und Vorrat entstehen beim nächsten Abgleich der Liste neu.
  for (const [id, item] of Object.entries(tables.shoppingItems)) {
    if (item.origin === 'manual' && isActive(item) && merged.has(item.foodId)) {
      writes.push({ table: 'shoppingItems', rowId: id, cells: { foodId: keepId } });
    }
  }

  writes.push(...addReweFavorites(tables, keepId, fromIds.flatMap((id) => reweFavoritesOf(tables, id))));
  const product = fromIds.map((id) => tables.reweProducts[id]).find((row) => row && row.state !== 'none');
  const ownProduct = tables.reweProducts[keepId];
  if (product && (!ownProduct || ownProduct.state === 'none')) writes.push({ table: 'reweProducts', rowId: keepId, cells: { ...product } });
  // Nährwerte zählen nur mit Werten aus BLS oder Open Food Facts, nicht als „nichts gefunden“.
  const hasValues = (row: ShoppingTables['foodNutrition'][string] | undefined) => row?.source === 'bls' || row?.source === 'off';
  const nutrition = fromIds.map((id) => tables.foodNutrition[id]).find(hasValues);
  if (nutrition && !hasValues(tables.foodNutrition[keepId])) writes.push({ table: 'foodNutrition', rowId: keepId, cells: { ...nutrition } });
  return writes;
}
