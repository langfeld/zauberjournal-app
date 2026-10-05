import type { ReweMatchRequestItem, ReweMatchResult, ReweProduct, ReweProductRow } from './rewe.ts';
import { changedCells, isActive, type CellValue, type RowWrite } from './rows.ts';
import type { ShoppingListView, ShoppingTables } from './shopping.ts';

/**
 * REWE-Abgleich einer Einkaufsliste: welche Positionen gesucht werden und wie die Ergebnisse
 * im Store landen. Das Produkt gilt je Lebensmittel, die Packungen je Position.
 */

/** Gewählte Produkte bleiben bei jedem Abgleich, auch wenn sie einmal nicht zu finden sind. */
function isChosen(product: ReweProductRow | undefined): product is ReweProductRow {
  return (product?.state === 'chosen' || product?.state === 'missing') && product.productId !== '';
}

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
    const product = tables.reweProducts[item.foodId];
    if (product?.state === 'skip') continue;
    items.set(item.foodId, {
      id: item.foodId,
      name: food.name || item.name,
      category: food.category,
      amount: item.amount,
      unit: item.unit,
      preferred: isChosen(product) ? { productId: product.productId, name: product.name } : null,
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
 * Übernimmt die Ergebnisse des Abgleichs. Vorschläge ersetzen frühere Vorschläge; gewählte Produkte
 * bleiben und heißen `missing`, solange sie im Markt nicht zu finden sind.
 */
export function applyReweMatches(
  tables: ShoppingTables,
  listId: string,
  results: readonly ReweMatchResult[],
  now: number,
): RowWrite[] {
  return results.flatMap((result) => {
    const best = result.candidates[0];
    let cells: Record<string, CellValue>;
    if (result.learned && best) cells = { state: 'chosen', ...productCells(best) };
    else if (isChosen(tables.reweProducts[result.id])) cells = { state: 'missing' };
    else if (best) cells = { state: result.confidence === 'sure' ? 'sure' : 'unsure', ...productCells(best) };
    else cells = { state: 'none', ...NO_PRODUCT };
    return writeProduct(tables, listId, result.id, cells, now);
  });
}

/** Der Haushalt wählt ein Produkt für das Lebensmittel einer Position; es gilt auch bei späteren Einkäufen. */
export function chooseReweProduct(tables: ShoppingTables, itemId: string, product: ReweProduct, now: number): RowWrite[] {
  const item = tables.shoppingItems[itemId];
  if (!item?.foodId) return [];
  return writeProduct(tables, item.listId, item.foodId, { state: 'chosen', ...productCells(product) }, now);
}

/** Der Haushalt bestätigt das vorgeschlagene Produkt; es gilt dann auch bei späteren Einkäufen. */
export function confirmReweProduct(tables: ShoppingTables, itemId: string, now: number): RowWrite[] {
  const item = tables.shoppingItems[itemId];
  const product = item?.foodId ? tables.reweProducts[item.foodId] : undefined;
  if (!item || !product?.productId || product.state === 'skip') return [];
  return writeProduct(tables, item.listId, item.foodId, { state: 'chosen' }, now);
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
