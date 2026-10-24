import { addDays, compareDates, dayOf, formatShortDate, formatTime } from './dates.ts';
import type { StockUnit } from './foods.ts';
import { foodsInRecipes, recipeStockUnits } from './pantry.ts';
import { bookPurchase, boughtAmount, countsForPantry } from './pantry-bookings.ts';
import { changedCells, isActive, type RowWrite } from './rows.ts';
import type { ReweOrder, RewePlacement } from './rewe-shopping.ts';
import {
  buildShoppingListView,
  completeShoppingList,
  isPantryCheck,
  listEntryIds,
  listOpenShoppingLists,
  type ShoppingItemView,
  type ShoppingListRow,
  type ShoppingTables,
} from './shopping.ts';

/**
 * Bestellung bei REWE übernehmen: Nach dem Bestellen meldet das Userscript, was bestellt wurde. Die App hakt das
 * auf der Liste des Auftrags ab, bucht es ab der Abholung in den Vorrat und schließt die Liste ab; was fehlt,
 * kommt auf die nächste Liste. Kommt die Meldung einer geänderten Bestellung, gleicht dieselbe Rechnung alles an;
 * feste IDs sorgen dafür, dass dabei nichts doppelt entsteht.
 */

/** Feste ID einer Position, die auf die nächste Liste wandert, und der neuen Liste dafür. */
function movedItemId(itemId: string): string {
  return `${itemId}~rest`;
}

function restListId(listId: string): string {
  return `${listId}~rest`;
}

/** Wovon ein bestelltes Produkt eine Packung ist; `name` hilft, wenn die Packungsangabe fehlt („Zwiebeln 1,5kg“). */
type ProductPack = { grammage: string; name: string };

type PlacementMatch = {
  /** Positionen, deren Produkt aus dem Auftrag bestellt wurde */
  items: Set<string>;
  /** Bestellte Packungen je Lebensmittel */
  foods: Map<string, ProductPack & { packs: number }>;
  /** Bestellte Produkte, die zu keinem Lebensmittel gehören */
  extras: string[];
};

/** REWE-Produkte, die der Haushalt einem Lebensmittel zugeordnet oder gemerkt hat, nach Produkt-ID. */
function knownProducts(tables: ShoppingTables): Map<string, ProductPack & { foodId: string }> {
  const known = new Map<string, ProductPack & { foodId: string }>();
  for (const [foodId, product] of Object.entries(tables.reweProducts)) {
    if (product.productId) known.set(product.productId, { foodId, grammage: product.grammage, name: product.name });
  }
  for (const favorite of Object.values(tables.reweFavorites)) {
    if (!isActive(favorite) || known.has(favorite.productId)) continue;
    known.set(favorite.productId, { foodId: favorite.foodId, grammage: favorite.grammage, name: favorite.name });
  }
  return known;
}

/** Alle Positionen einer Liste, wie die Einkaufsliste sie zeigt. */
function listItems(tables: ShoppingTables, listId: string): ShoppingItemView[] {
  const view = buildShoppingListView(tables, listId);
  return view ? [...view.sections.flatMap((section) => section.items), ...view.pantry, ...view.done] : [];
}

/**
 * Ordnet die Bestellung der Liste zu. Ein Produkt aus dem Auftrag gilt für seine Positionen; die bestellten Packungen
 * verteilen sich der Reihe nach auf sie, was übrig ist, bekommt die letzte. Andere Produkte gehören zu dem
 * Lebensmittel, dem der Haushalt sie zugeordnet oder gemerkt hat (z. B. im Warenkorb getauscht), sonst sind sie
 * „außerdem bestellt“. Ohne die Positionen der Bestellung gilt, was das Userscript in den Warenkorb gelegt hat.
 */
function matchPlacement(
  tables: ShoppingTables,
  order: ReweOrder,
  placement: RewePlacement,
  items: readonly ShoppingItemView[],
): PlacementMatch {
  const quantities = new Map<string, { quantity: number; name: string }>();
  if (placement.items) {
    for (const { productId, name, quantity } of placement.items) {
      const entry = quantities.get(productId);
      if (entry) entry.quantity += quantity;
      else quantities.set(productId, { quantity, name });
    }
  } else {
    for (const product of order.products) {
      if (product.status === 'added' || product.status === 'present') {
        quantities.set(product.productId, { quantity: product.packs, name: product.name });
      }
    }
  }

  const known = knownProducts(tables);
  const byId = new Map(items.map((item) => [item.id, item]));
  const match: PlacementMatch = { items: new Set(), foods: new Map(), extras: [] };
  const add = (foodId: string, packs: number, pack: ProductPack) => {
    const food = tables.foods[foodId];
    if (!food || !isActive(food) || packs <= 0) return;
    const entry = match.foods.get(foodId);
    if (entry) entry.packs += packs;
    else match.foods.set(foodId, { ...pack, packs });
  };

  for (const product of order.products) {
    const ordered = quantities.get(product.productId);
    const onList = product.itemIds.flatMap((id) => byId.get(id) ?? []).filter((item) => item.foodId);
    // Stehen die Positionen nicht mehr auf der Liste, zählt das Produkt wie jedes andere.
    if (!ordered || onList.length === 0) continue;
    quantities.delete(product.productId);
    const pack = { grammage: known.get(product.productId)?.grammage ?? '', name: product.name };
    let left = ordered.quantity;
    onList.forEach((item, index) => {
      match.items.add(item.id);
      const packs = index === onList.length - 1 ? left : Math.min(left, item.rewe?.packs ?? 0);
      left -= packs;
      add(item.foodId, packs, pack);
    });
  }
  for (const [productId, { quantity, name }] of quantities) {
    const product = known.get(productId);
    const food = product ? tables.foods[product.foodId] : undefined;
    if (product && food && isActive(food)) add(product.foodId, quantity, { grammage: product.grammage, name: product.name || name });
    else match.extras.push(name);
  }
  return match;
}

/** Schreibt nur, was sich gegenüber dem Store ändert; so ändert eine zweite Übernahme derselben Meldung nichts. */
function onlyChanges(tables: ShoppingTables, writes: readonly RowWrite[]): RowWrite[] {
  const rows = tables as unknown as Record<string, Record<string, Readonly<Record<string, unknown>>> | undefined>;
  return writes.flatMap((write) => changedCells(write.table, write.rowId, rows[write.table]?.[write.rowId], write.cells) ?? []);
}

function isOrdered(match: PlacementMatch, item: ShoppingItemView): boolean {
  return match.items.has(item.id) || match.foods.has(item.foodId);
}

/**
 * Ob die gemeldete Bestellung zur Liste des Auftrags passt: Mindestens eine Position muss bestellt sein. Sonst war
 * es wohl eine andere Bestellung, und die App schließt nichts ab.
 */
export function reweOrderFits(tables: ShoppingTables, order: ReweOrder): boolean {
  if (!order.placed) return false;
  const items = listItems(tables, order.listId);
  const match = matchPlacement(tables, order, order.placed, items);
  return items.some((item) => isOrdered(match, item));
}

/**
 * Übernimmt die Bestellung bei REWE in die Liste des Auftrags:
 * - Bestelltes wird abgehakt und in den Vorrat gebucht, mit den bestellten Packungen und zum Beginn der Abholung.
 * - Was der Haushalt selbst abgehakt hat, ist anderswo gekauft; es kommt wie beim Abschließen von Hand in den Vorrat.
 * - Die Liste ist erledigt, ihre Gerichte gelten als eingekauft.
 * - Was fehlt, kommt auf die neueste andere offene Liste oder eine neue; „Vorrat prüfen“ und was nur nachgekauft
 *   wird, weil es immer im Haus sein soll, nicht: Das ergibt die nächste Liste von selbst.
 * Von Hand abgeschlossene Listen bleiben, wie sie sind, ebenso alles, wenn die Bestellung nicht zur Liste passt.
 */
export function applyReweOrder(tables: ShoppingTables, order: ReweOrder, now: number): RowWrite[] {
  const { placed: placement, listId } = order;
  const list = tables.shoppingLists[listId];
  if (!placement || !list || !isActive(list) || (list.status !== 'open' && !list.reweOrderId)) return [];
  const items = listItems(tables, listId);
  const match = matchPlacement(tables, order, placement, items);
  const ordered = items.filter((item) => isOrdered(match, item));
  if (ordered.length === 0) return [];
  const writes: RowWrite[] = [];

  const elsewhere: ShoppingItemView[] = [];
  const missing: ShoppingItemView[] = [];
  for (const item of items) {
    const byOrder = tables.shoppingItems[item.id]!.reweOrdered === true;
    if (isOrdered(match, item)) {
      writes.push({ table: 'shoppingItems', rowId: item.id, cells: { checked: true, reweOrdered: true } });
      continue;
    }
    // Hatte eine frühere Meldung es abgehakt, ist es jetzt doch nicht bestellt.
    if (byOrder) writes.push({ table: 'shoppingItems', rowId: item.id, cells: { checked: false, reweOrdered: false } });
    if (isPantryCheck(item)) continue;
    if (item.checked && !byOrder) elsewhere.push(item);
    else if (item.origin !== 'pantry') missing.push(item);
  }

  // Vorrat
  const recipeFoods = foodsInRecipes(tables);
  const recipeUnits = recipeStockUnits(tables);
  const fromList = new Set(items.filter((item) => item.origin !== 'manual').map((item) => item.foodId));
  const counts = (foodId: string) => countsForPantry(tables.foods[foodId], fromList.has(foodId), recipeFoods.has(foodId));
  const entries: { foodId: string; amount: number; unit: StockUnit }[] = [];
  for (const [foodId, { grammage, name, packs }] of match.foods) {
    if (!counts(foodId)) continue;
    const { unit, amount } = boughtAmount({ food: tables.foods[foodId]!, rewe: { grammage, name, packs }, rows: [] }, recipeUnits.get(foodId) ?? null);
    if (amount) entries.push({ foodId, amount, unit });
  }
  const elsewhereByFood = new Map<string, ShoppingItemView[]>();
  for (const item of elsewhere) {
    if (item.foodId) elsewhereByFood.set(item.foodId, [...(elsewhereByFood.get(item.foodId) ?? []), item]);
  }
  for (const [foodId, foodItems] of elsewhereByFood) {
    if (!counts(foodId)) continue;
    const rows = foodItems.map((item) => tables.shoppingItems[item.id]!);
    const { unit, amount } = boughtAmount({ food: tables.foods[foodId]!, rewe: null, rows }, recipeUnits.get(foodId) ?? null);
    if (amount) entries.push({ foodId, amount, unit });
  }
  writes.push(...bookPurchase(tables, listId, entries, placement.pickupStart ?? now));
  const booked = new Set(entries.map((entry) => entry.foodId));
  for (const [id, booking] of Object.entries(tables.pantryBookings)) {
    if (booking.listId === listId && booking.reason === 'purchase' && isActive(booking) && !booked.has(booking.foodId)) {
      writes.push({ table: 'pantryBookings', rowId: id, cells: { deletedAt: now } });
    }
  }

  // Liste und Gerichte
  writes.push(...completeShoppingList(tables, listId), {
    table: 'shoppingLists',
    rowId: listId,
    cells: {
      reweOrderId: placement.orderId,
      reweReportedAt: placement.reportedAt,
      reweOrderedAt: placement.orderedAt ?? placement.reportedAt,
      rewePickupStart: placement.pickupStart,
      rewePickupEnd: placement.pickupEnd,
    },
  });

  // Fehlendes auf die nächste Liste; schon Übertragenes bleibt, wo es ist. Was jetzt doch bestellt ist, verschwindet
  // dort wieder, solange es nicht abgehakt ist.
  for (const item of ordered) {
    const copy = tables.shoppingItems[movedItemId(item.id)];
    if (copy && isActive(copy) && !copy.checked) writes.push({ table: 'shoppingItems', rowId: movedItemId(item.id), cells: { deletedAt: now } });
  }
  const toMove = missing.filter((item) => {
    const copy = tables.shoppingItems[movedItemId(item.id)];
    return !copy || !isActive(copy);
  });
  // Eine neue Liste nur, wenn es keine andere offene gibt; war die fürs Fehlende entfernt (z. B. mit „Rückgängig“),
  // kommt sie wieder. Hat der Haushalt sie schon abgeschlossen, bleibt das Fehlende auf der bestellten Liste stehen.
  const rest = restListId(listId);
  const restList = tables.shoppingLists[rest];
  const target =
    toMove.length === 0
      ? null
      : (listOpenShoppingLists(tables).find((entry) => entry.id !== listId)?.id ?? (restList && isActive(restList) ? null : rest));
  if (target === rest) {
    writes.push({
      table: 'shoppingLists',
      rowId: rest,
      cells: { name: `Einkauf ${formatShortDate(dayOf(now))}`, status: 'open', createdAt: now, deletedAt: null },
    });
  }
  if (target) {
    for (const item of toMove) {
      const row = tables.shoppingItems[item.id]!;
      writes.push({
        table: 'shoppingItems',
        rowId: movedItemId(item.id),
        cells: {
          listId: target,
          foodId: row.foodId,
          name: row.name,
          amount: row.amount,
          unit: row.unit,
          checked: false,
          origin: 'manual',
          rewePacks: row.rewePacks ?? null,
          stockAmount: null,
          reweOrdered: false,
          createdAt: now,
          deletedAt: null,
        },
      });
    }
  }
  return onlyChanges(tables, writes);
}

/**
 * Nimmt die Übernahme zurück: Die Liste ist wieder offen, ihre Gerichte wieder geplant, die Buchungen entfallen,
 * und was auf die nächste Liste gewandert ist, verschwindet dort, solange es nicht abgehakt ist. Dieselbe Meldung
 * übernimmt die App danach nicht noch einmal.
 */
export function undoReweOrder(tables: ShoppingTables, listId: string, now: number): RowWrite[] {
  const list = tables.shoppingLists[listId];
  if (!list || !isActive(list) || !list.reweOrderId) return [];
  const writes: RowWrite[] = [
    {
      table: 'shoppingLists',
      rowId: listId,
      cells: { status: 'open', reweOrderId: '', reweOrderedAt: null, rewePickupStart: null, rewePickupEnd: null },
    },
  ];
  for (const entryId of listEntryIds(tables, listId)) {
    if (tables.planEntries[entryId]?.status === 'shopped') writes.push({ table: 'planEntries', rowId: entryId, cells: { status: 'planned' } });
  }
  const removed = new Set<string>();
  for (const [id, item] of Object.entries(tables.shoppingItems)) {
    if (item.listId !== listId || !isActive(item)) continue;
    if (item.reweOrdered) writes.push({ table: 'shoppingItems', rowId: id, cells: { checked: false, reweOrdered: false } });
    const copy = tables.shoppingItems[movedItemId(id)];
    if (copy && isActive(copy) && !copy.checked) {
      writes.push({ table: 'shoppingItems', rowId: movedItemId(id), cells: { deletedAt: now } });
      removed.add(movedItemId(id));
    }
  }
  for (const [id, booking] of Object.entries(tables.pantryBookings)) {
    if (booking.listId === listId && booking.reason === 'purchase' && isActive(booking)) {
      writes.push({ table: 'pantryBookings', rowId: id, cells: { deletedAt: now } });
    }
  }
  // Die neue Liste fürs Fehlende verschwindet wieder, wenn sonst nichts darauf steht.
  const rest = restListId(listId);
  const restList = tables.shoppingLists[rest];
  const inUse =
    listEntryIds(tables, rest).length > 0 ||
    Object.entries(tables.shoppingItems).some(([id, item]) => item.listId === rest && item.origin === 'manual' && isActive(item) && !removed.has(id));
  if (restList && isActive(restList) && restList.status === 'open' && !inUse) {
    writes.push({ table: 'shoppingLists', rowId: rest, cells: { deletedAt: now } });
  }
  return writes;
}

/** Die zuletzt über REWE bestellte Liste, für die Meldung im Einkauf. */
export type ReweOrderSummary = {
  listId: string;
  orderId: string;
  pickupStart: number | null;
  pickupEnd: number | null;
  /** Positionen, die die Bestellung abgehakt hat */
  ordered: number;
  /** Was fehlte und jetzt auf einer anderen Liste steht, mit deren Namen */
  moved: number;
  movedTo: string;
};

/** Bis zum Tag der Abholung; ohne Abholzeit bis zum Tag nach der Bestellung. */
export function recentReweOrder(tables: ShoppingTables, today: string): ReweOrderSummary | null {
  let latest: [string, ShoppingListRow] | null = null;
  for (const entry of Object.entries(tables.shoppingLists)) {
    const list = entry[1];
    if (!isActive(list) || list.status !== 'done' || !list.reweOrderId) continue;
    if (!latest || (list.reweOrderedAt ?? 0) > (latest[1].reweOrderedAt ?? 0)) latest = entry;
  }
  if (!latest) return null;
  const [listId, list] = latest;
  const pickup = list.rewePickupEnd ?? list.rewePickupStart ?? null;
  const lastDay = pickup !== null ? dayOf(pickup) : addDays(dayOf(list.reweOrderedAt ?? 0), 1);
  if (compareDates(today, lastDay) > 0) return null;

  const summary: ReweOrderSummary = {
    listId,
    orderId: list.reweOrderId ?? '',
    pickupStart: list.rewePickupStart ?? null,
    pickupEnd: list.rewePickupEnd ?? null,
    ordered: 0,
    moved: 0,
    movedTo: '',
  };
  for (const [id, item] of Object.entries(tables.shoppingItems)) {
    if (item.listId !== listId || !isActive(item)) continue;
    if (item.reweOrdered) summary.ordered += 1;
    const copy = tables.shoppingItems[movedItemId(id)];
    const target = copy && isActive(copy) ? tables.shoppingLists[copy.listId] : undefined;
    if (target && isActive(target)) {
      summary.moved += 1;
      summary.movedTo ||= target.name;
    }
  }
  return summary;
}

/** Bestellte Produkte, die zu keinem Lebensmittel gehören, z. B. ein Angebot, das noch in den Warenkorb kam. */
export function reweOrderExtras(tables: ShoppingTables, order: ReweOrder): string[] {
  return order.placed ? matchPlacement(tables, order, order.placed, listItems(tables, order.listId)).extras : [];
}

/** Abholfenster, z. B. „heute, 17:00–18:00 Uhr“ oder „Mi 26.10., ab 17:00 Uhr“; leer ohne Abholzeit. */
export function formatPickup(start: number | null, end: number | null, today: string): string {
  if (start === null) return '';
  const day = dayOf(start);
  const label = day === today ? 'heute' : day === addDays(today, 1) ? 'morgen' : formatShortDate(day);
  return end !== null && end > start ? `${label}, ${formatTime(start)}–${formatTime(end)} Uhr` : `${label}, ab ${formatTime(start)} Uhr`;
}
