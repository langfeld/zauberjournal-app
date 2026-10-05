import {
  REWE_MAX_PREFERRED,
  type ReweFavoriteRow,
  type ReweMatchRequestItem,
  type ReweMatchResult,
  type ReweProduct,
} from './rewe.ts';
import { activeSorted, changedCells, isActive, type CellValue, type RowWrite } from './rows.ts';
import type { ShoppingListView, ShoppingTables } from './shopping.ts';
import { assignSortKeys } from './sort-keys.ts';

/**
 * REWE-Abgleich einer Einkaufsliste: welche Positionen gesucht werden und wie die Ergebnisse
 * im Store landen. Das Produkt gilt je Lebensmittel, die Packungen je Position. Je Lebensmittel
 * merkt sich der Haushalt Produkte in einer Reihenfolge; der Abgleich nimmt das erste, das der Markt hat.
 */

// ─── Gemerkte Produkte ───

/** Ein gemerktes Produkt für die Anzeige. */
export type ReweFavorite = Pick<ReweFavoriteRow, 'productId' | 'name' | 'imageUrl' | 'price' | 'grammage'>;

/** Was zu einem gemerkten Produkt gespeichert wird, außer der Reihenfolge. */
type FavoriteData = Pick<ReweProduct, 'name' | 'imageUrl' | 'price' | 'grammage'>;

/** Ein Produkt, das neu gemerkt wird, mit seinen Daten. */
export type ReweFavoriteData = FavoriteData & { productId: string };

function favoriteId(foodId: string, productId: string): string {
  return `${foodId}~${productId}`;
}

function favoriteRows(tables: ShoppingTables, foodId: string): [string, ReweFavoriteRow][] {
  return activeSorted(tables.reweFavorites, (favorite) => favorite.foodId === foodId);
}

/** Gemerkte Produkte eines Lebensmittels, die erste Wahl zuerst. */
export function reweFavoritesOf(tables: ShoppingTables, foodId: string): ReweFavorite[] {
  return favoriteRows(tables, foodId).map(([, { productId, name, imageUrl, price, grammage }]) => ({
    productId,
    name,
    imageUrl,
    price,
    grammage,
  }));
}

function favoriteOrder(tables: ShoppingTables, foodId: string): string[] {
  return favoriteRows(tables, foodId).map(([, favorite]) => favorite.productId);
}

function favoriteCells(product: FavoriteData): Record<string, CellValue> {
  return { name: product.name, imageUrl: product.imageUrl, price: product.price, grammage: product.grammage };
}

/**
 * Schreibt die gemerkten Produkte eines Lebensmittels in der Reihenfolge `order`. `added` bringt die
 * Daten neu gemerkter Produkte mit. Sortierschlüssel bleiben, wo die Reihenfolge es zulässt.
 */
function writeFavoriteOrder(
  tables: ShoppingTables,
  foodId: string,
  order: readonly string[],
  added: readonly ReweFavoriteData[] = [],
): RowWrite[] {
  const rows = order.map((productId) => {
    const id = favoriteId(foodId, productId);
    return { id, productId, row: tables.reweFavorites[id] };
  });
  const keys = assignSortKeys(rows.map(({ row }) => (row && isActive(row) ? row.sortKey : undefined)));
  return rows.flatMap(({ id, productId, row }, index) => {
    const data = added.find((product) => product.productId === productId);
    const cells = {
      foodId,
      productId,
      sortKey: keys[index]!,
      deletedAt: null,
      ...(data ? favoriteCells(data) : {}),
    };
    const write = changedCells('reweFavorites', id, row, cells);
    return write ? [write] : [];
  });
}

/** Schiebt ein gemerktes Produkt einen Platz nach vorn (−1) oder nach hinten (1); gilt ab dem nächsten Abgleich. */
export function moveReweFavorite(tables: ShoppingTables, foodId: string, productId: string, delta: -1 | 1): RowWrite[] {
  const order = favoriteOrder(tables, foodId);
  const from = order.indexOf(productId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return [];
  [order[from], order[to]] = [order[to]!, order[from]!];
  return writeFavoriteOrder(tables, foodId, order);
}

/**
 * Merkt sich übernommene Produkte in ihrer Reihenfolge hinter den schon gemerkten, z. B. aus dem alten
 * Zauberjournal. Was schon gemerkt oder ausdrücklich vergessen ist, bleibt, wie es ist.
 */
export function addReweFavorites(tables: ShoppingTables, foodId: string, products: readonly ReweFavoriteData[]): RowWrite[] {
  const added = products.filter(
    (product, index) =>
      !tables.reweFavorites[favoriteId(foodId, product.productId)] &&
      products.findIndex((other) => other.productId === product.productId) === index,
  );
  if (added.length === 0) return [];
  return writeFavoriteOrder(tables, foodId, [...favoriteOrder(tables, foodId), ...added.map((product) => product.productId)], added);
}

/** Vergisst ein gemerktes Produkt. Gilt es gerade für den Einkauf, ist es dort nur noch ein Vorschlag. */
export function forgetReweFavorite(tables: ShoppingTables, foodId: string, productId: string, now: number): RowWrite[] {
  const id = favoriteId(foodId, productId);
  const row = tables.reweFavorites[id];
  return row && isActive(row) ? [{ table: 'reweFavorites', rowId: id, cells: { deletedAt: now } }] : [];
}

// ─── Abgleich ───

/**
 * Positionen, die noch zu kaufen sind und bei REWE gesucht werden sollen, je Lebensmittel eine.
 * Was laut Vorrat da ist oder nicht bei REWE gekauft wird, bleibt draußen.
 */
export function reweMatchItems(tables: ShoppingTables, listId: string): ReweMatchRequestItem[] {
  const items = new Map<string, ReweMatchRequestItem>();
  for (const item of Object.values(tables.shoppingItems)) {
    if (item.listId !== listId || !isActive(item) || item.checked || !item.foodId || items.has(item.foodId)) continue;
    const food = tables.foods[item.foodId];
    if (!food || !isActive(food) || (item.origin === 'plan' && food.stock === 'have')) continue;
    // Deckt der Vorrat mit Menge alles, gibt es nichts zu kaufen.
    if (food.stockUnit && typeof item.stockAmount === 'number' && !item.amount) continue;
    if (tables.reweProducts[item.foodId]?.state === 'skip') continue;
    items.set(item.foodId, {
      id: item.foodId,
      name: food.name || item.name,
      category: food.category,
      amount: item.amount,
      unit: item.unit,
      preferred: favoriteRows(tables, item.foodId)
        .slice(0, REWE_MAX_PREFERRED)
        .map(([, favorite]) => ({ productId: favorite.productId, name: favorite.name })),
    });
  }
  return [...items.values()];
}

function productCells(product: ReweProduct): Record<string, CellValue> {
  return {
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    price: product.price,
    grammage: product.grammage,
    listingId: product.listingId,
  };
}

const NO_PRODUCT = { productId: '', name: '', imageUrl: '', price: 0, grammage: '', listingId: '' };

/** Schreibt das Produkt eines Lebensmittels; wechselt es, gelten wieder die berechneten Packungen. */
function writeProduct(
  tables: ShoppingTables,
  listId: string,
  foodId: string,
  cells: Record<string, CellValue>,
  now: number,
): RowWrite[] {
  const current = tables.reweProducts[foodId];
  const write = changedCells('reweProducts', foodId, current, cells);
  if (!write) return [];
  const writes: RowWrite[] = [{ ...write, cells: { ...write.cells, updatedAt: now } }];
  if ('productId' in cells && cells.productId !== current?.productId) {
    for (const [id, item] of Object.entries(tables.shoppingItems)) {
      if (item.listId === listId && item.foodId === foodId && item.rewePacks !== null && item.rewePacks !== undefined) {
        writes.push({ table: 'shoppingItems', rowId: id, cells: { rewePacks: null } });
      }
    }
  }
  return writes;
}

/**
 * Übernimmt die Ergebnisse des Abgleichs. Ist ein gemerktes Produkt zu finden, gilt es (`chosen`).
 * Sonst gilt der beste Vorschlag; gibt es gemerkte Produkte, nur zum Prüfen (`missing`).
 */
export function applyReweMatches(
  tables: ShoppingTables,
  listId: string,
  results: readonly ReweMatchResult[],
  now: number,
): RowWrite[] {
  return results.flatMap((result) => {
    const best = result.candidates[0];
    const remembered = favoriteRows(tables, result.id).length > 0;
    let cells: Record<string, CellValue>;
    if (result.learned && best) cells = { state: 'chosen', ...productCells(best) };
    else if (remembered) cells = { state: 'missing', ...(best ? productCells(best) : NO_PRODUCT) };
    else if (best) cells = { state: result.confidence === 'sure' ? 'sure' : 'unsure', ...productCells(best) };
    else cells = { state: 'none', ...NO_PRODUCT };
    const writes = writeProduct(tables, listId, result.id, cells, now);
    if (result.learned && best) writes.push(...refreshFavorite(tables, result.id, best));
    return writes;
  });
}

/** Bringt Name, Bild, Preis und Packung eines gemerkten Produkts auf den Stand der Suche. */
function refreshFavorite(tables: ShoppingTables, foodId: string, product: ReweProduct): RowWrite[] {
  const id = favoriteId(foodId, product.id);
  const favorite = tables.reweFavorites[id];
  const write = favorite && isActive(favorite) ? changedCells('reweFavorites', id, favorite, favoriteCells(product)) : null;
  return write ? [write] : [];
}

/**
 * Der Haushalt wählt ein Produkt für das Lebensmittel einer Position und merkt es sich als erste Wahl
 * oder als Ersatz (ans Ende). Für den Einkauf gilt das erste gemerkte Produkt, das es gerade gibt:
 * das gewählte oder das bisherige, wenn es weiter vorn steht.
 */
export function chooseReweProduct(
  tables: ShoppingTables,
  itemId: string,
  product: ReweProduct,
  place: 'first' | 'fallback',
  now: number,
): RowWrite[] {
  const item = tables.shoppingItems[itemId];
  if (!item?.foodId) return [];
  const others = favoriteOrder(tables, item.foodId).filter((productId) => productId !== product.id);
  const order = place === 'first' ? [product.id, ...others] : [...others, product.id];
  const current = tables.reweProducts[item.foodId];
  const currentRank = current?.state === 'chosen' ? order.indexOf(current.productId) : -1;
  const takeNow = currentRank === -1 || order.indexOf(product.id) <= currentRank;
  return [
    ...writeFavoriteOrder(tables, item.foodId, order, [{ ...product, productId: product.id }]),
    ...(takeNow ? writeProduct(tables, item.listId, item.foodId, { state: 'chosen', ...productCells(product) }, now) : []),
  ];
}

/** Der Haushalt merkt sich das vorgeschlagene Produkt, als Ersatz hinter den schon gemerkten. */
export function confirmReweProduct(tables: ShoppingTables, itemId: string, now: number): RowWrite[] {
  const item = tables.shoppingItems[itemId];
  const product = item?.foodId ? tables.reweProducts[item.foodId] : undefined;
  if (!item || !product?.productId || product.state === 'skip') return [];
  const order = favoriteOrder(tables, item.foodId);
  if (!order.includes(product.productId)) order.push(product.productId);
  return [
    ...writeFavoriteOrder(tables, item.foodId, order, [product]),
    ...writeProduct(tables, item.listId, item.foodId, { state: 'chosen' }, now),
  ];
}

/** Das Lebensmittel einer Position wird nicht bei REWE gekauft; ein Produkt wählen hebt das wieder auf. */
export function skipRewe(tables: ShoppingTables, itemId: string, now: number): RowWrite[] {
  const item = tables.shoppingItems[itemId];
  if (!item?.foodId) return [];
  return writeProduct(tables, item.listId, item.foodId, { state: 'skip' }, now);
}

/** Packungen einer Position von Hand; `null` = wieder aus der Menge berechnen. */
export function setRewePacks(itemId: string, packs: number | null): RowWrite[] {
  return [{ table: 'shoppingItems', rowId: itemId, cells: { rewePacks: packs } }];
}

// ─── Auftrag fürs Userscript ───

/** Was das Userscript mit einem Produkt gemacht hat; `present`: lag schon im Warenkorb. */
export const REWE_ORDER_STATUSES = ['pending', 'added', 'present', 'failed'] as const;

export type ReweOrderStatus = (typeof REWE_ORDER_STATUSES)[number];

/** Ein Produkt im Auftrag; Positionen mit demselben Produkt sind zusammengefasst. */
export type ReweOrderProduct = {
  productId: string;
  listingId: string;
  name: string;
  packs: number;
  /** Preis einer Packung in Cent. */
  price: number;
  /** Positionen der Einkaufsliste, für die es gekauft wird. */
  itemIds: string[];
};

/** Was die App an den Server schickt. */
export type ReweOrderRequest = { listId: string; listName: string; marketId: string; products: ReweOrderProduct[] };

/** Der Auftrag auf dem Server, mit Rückmeldung des Userscripts je Produkt. */
export type ReweOrder = Omit<ReweOrderRequest, 'products'> & {
  createdAt: number;
  updatedAt: number;
  products: (ReweOrderProduct & { status: ReweOrderStatus; message: string })[];
};

/** Auftrag aus allem, was noch zu kaufen ist und ein REWE-Produkt hat. */
export function buildReweOrder(view: ShoppingListView, marketId: string): ReweOrderRequest {
  const products = new Map<string, ReweOrderProduct>();
  for (const item of view.sections.flatMap((section) => section.items)) {
    const { rewe } = item;
    if (!rewe?.productId || rewe.state === 'none' || rewe.state === 'skip') continue;
    const existing = products.get(rewe.productId);
    if (existing) {
      existing.packs += rewe.packs;
      existing.itemIds.push(item.id);
    } else {
      products.set(rewe.productId, {
        productId: rewe.productId,
        listingId: rewe.listingId,
        name: rewe.name,
        packs: rewe.packs,
        price: rewe.price,
        itemIds: [item.id],
      });
    }
  }
  return { listId: view.id, listName: view.name, marketId, products: [...products.values()] };
}

/** Stand des Auftrags für die Anzeige: wie viele Produkte in welchem Zustand. */
export function countReweOrder(order: ReweOrder): Record<ReweOrderStatus, number> {
  const counts: Record<ReweOrderStatus, number> = { pending: 0, added: 0, present: 0, failed: 0 };
  for (const product of order.products) counts[product.status] += 1;
  return counts;
}
