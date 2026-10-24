import { describe, expect, it } from 'vitest';

import { timeOfDay } from './dates.ts';
import { ensureFood } from './foods.ts';
import fixtures from './fixtures/rewe-products.json' with { type: 'json' };
import { addMember } from './members.ts';
import { setStaple, stockBookings, stockOf } from './pantry.ts';
import { planAddEntry } from './plan.ts';
import { rateProduct, type ReweProduct } from './rewe.ts';
import {
  applyReweOrder,
  formatPickup,
  recentReweOrder,
  reweOrderExtras,
  reweOrderFits,
  undoReweOrder,
} from './rewe-purchase.ts';
import {
  addReweFavorites,
  applyReweMatches,
  buildReweOrder,
  type RewePlacedItem,
  type RewePlacementReport,
  type ReweOrder,
  type ReweOrderStatus,
} from './rewe-shopping.ts';
import {
  addManualItem,
  buildShoppingListView,
  checkShoppingItem,
  completeShoppingList,
  createShoppingList,
  listOpenShoppingLists,
  syncShoppingList,
  type ShoppingItemView,
} from './shopping.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

const searches: Record<string, ReweProduct[]> = fixtures;

function product(search: string, name: string): ReweProduct {
  const found = searches[search]?.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`${name} fehlt in den Testdaten`);
  return found;
}

const onion = product('Zwiebeln', 'Zwiebel gelb ca. 100g');
const coconutMilk = product('Kokosmilch', 'REWE Beste Wahl Kokosmilch cremig 400ml');
const organicCoconutMilk = product('Kokosmilch', 'REWE Bio Kokosmilch 400ml');
const milk = product('Milch', 'Thüringer Land Frische Fettarme Milch 1,5% 1l');

const at = (day: string, hour = 12) => timeOfDay(day, hour);
const PICKUP_START = at('2026-10-07', 17);
const PICKUP_END = at('2026-10-07', 18);
const NOW = at('2026-10-06', 9);

const line = (item: ReweProduct, quantity: number): RewePlacedItem => ({ productId: item.id, name: item.name, quantity, price: item.price });

function setUp() {
  const test = createTestStore();
  const ids = counterIds('x');
  test.apply(addMember(test.tables(), 'Marco', 'omnivore', ids).writes);
  test.apply(addMember(test.tables(), 'Anna', 'vegetarian', ids).writes);
  const curry = test.addRecipe('Curry', 2, ['3 Zwiebeln', '600 ml Kokosmilch', 'Salz', '2 Zehen Knoblauch']);
  const planned = planAddEntry(test.tables(), { date: '2026-10-08', meal: 'dinner', recipeId: curry, text: '' }, 1000, ids);
  test.apply(planned.writes);
  const list = createShoppingList(test.tables(), [planned.entryId], '2026-10-05', 1000, ids);
  test.apply(list.writes);
  const listId = list.listId;
  test.apply(syncShoppingList(test.tables(), listId, 2000));
  test.apply(addManualItem(test.tables(), listId, 'Spülmittel', 2000, ids));

  const view = () => buildShoppingListView(test.tables(), listId)!;
  const items = (id = listId) => {
    const shown = buildShoppingListView(test.tables(), id)!;
    return [...shown.sections.flatMap((section) => section.items), ...shown.pantry, ...shown.done];
  };
  const item = (name: string, id = listId): ShoppingItemView => {
    const found = items(id).find((entry) => entry.name === name);
    if (!found) throw new Error(`${name} fehlt auf der Liste`);
    return found;
  };
  const rated = (name: string, candidate: ReweProduct) => {
    const { amount, unit } = test.tables().shoppingItems[item(name).id]!;
    return { id: item(name).foodId, confidence: 'sure' as const, learned: false, candidates: [rateProduct({ amount, unit, category: item(name).category }, candidate)] };
  };
  test.apply(
    applyReweMatches(
      test.tables(),
      listId,
      [rated('Zwiebeln', onion), rated('Kokosmilch', coconutMilk), { id: item('Knoblauch').foodId, confidence: 'none', learned: false, candidates: [] }],
      2500,
    ),
  );

  /** Der Auftrag, wie ihn das Userscript abgearbeitet hat; ohne Angabe liegt alles im Warenkorb. */
  const request = buildReweOrder(view(), '1234567');
  const order = (report: Partial<RewePlacementReport> | null, statuses: Record<string, ReweOrderStatus> = {}, reportedAt = 5000): ReweOrder => ({
    ...request,
    createdAt: 3000,
    updatedAt: 4000,
    products: request.products.map((entry) => ({ ...entry, status: statuses[entry.productId] ?? 'added', message: '' })),
    placed: report && {
      orderId: '4711',
      orderedAt: at('2026-10-05', 20),
      pickupStart: PICKUP_START,
      pickupEnd: PICKUP_END,
      total: 3 * onion.price + 2 * coconutMilk.price,
      items: [line(onion, 3), line(coconutMilk, 2)],
      ...report,
      reportedAt,
      claimedBy: 'handy-a',
    },
  });
  const level = (name: string, day = '2026-10-07') => stockOf(test.tables(), item(name).foodId, day);
  return { test, ids, listId, entryId: planned.entryId, view, items, item, order, level };
}

describe('Bestellung bei REWE übernehmen', () => {
  it('hakt Bestelltes ab, bucht es ab der Abholung ein und schließt die Liste ab', () => {
    const { test, listId, entryId, item, items, order, level } = setUp();
    const placed = order({});
    expect(reweOrderFits(test.tables(), placed)).toBe(true);
    test.apply(applyReweOrder(test.tables(), placed, NOW));

    expect(test.tables().shoppingLists[listId]).toMatchObject({
      status: 'done',
      reweOrderId: '4711',
      reweReportedAt: 5000,
      reweOrderedAt: at('2026-10-05', 20),
      rewePickupStart: PICKUP_START,
      rewePickupEnd: PICKUP_END,
    });
    expect(test.tables().planEntries[entryId]?.status).toBe('shopped');
    expect(items().filter((entry) => entry.checked).map((entry) => entry.name)).toEqual(['Kokosmilch', 'Zwiebeln']);
    expect(test.tables().shoppingItems[item('Zwiebeln').id]?.reweOrdered).toBe(true);

    // Gebucht wird zum Beginn der Abholung, gezählt aber schon jetzt; Spülmittel braucht kein Rezept.
    expect(level('Zwiebeln')).toBe(3);
    expect(level('Kokosmilch', '2026-10-06')).toBe(800);
    expect(stockBookings(test.tables(), item('Zwiebeln').foodId)).toEqual([
      expect.objectContaining({ id: `${listId}~${item('Zwiebeln').foodId}`, reason: 'purchase', createdAt: PICKUP_START }),
    ]);
    expect(stockBookings(test.tables(), item('Spülmittel').foodId)).toEqual([]);

    // Was fehlt, steht auf einer neuen Liste; Salz und Knoblauch hatten kein Produkt, Spülmittel kam nicht dazu.
    const [next] = listOpenShoppingLists(test.tables());
    expect(next).toMatchObject({ id: `${listId}~rest`, name: 'Einkauf Di 6.10.' });
    expect(items(next!.id).map((entry) => [entry.name, entry.amount, entry.origin])).toEqual([
      ['Knoblauch', '2 Zehen', 'manual'],
      ['Salz', '', 'manual'],
      ['Spülmittel', '', 'manual'],
    ]);

    // Dieselbe Meldung noch einmal ändert nichts.
    expect(applyReweOrder(test.tables(), placed, NOW + 1000)).toEqual([]);
  });

  it('zählt, was tatsächlich bestellt wurde, auch getauschte und zusätzliche Produkte', () => {
    const { test, item, order, level } = setUp();
    // Bio-Kokosmilch ist als Ersatz gemerkt; Milch soll immer im Haus sein und hat ein gemerktes Produkt.
    test.apply(addReweFavorites(test.tables(), item('Kokosmilch').foodId, [{ ...organicCoconutMilk, productId: organicCoconutMilk.id }]));
    const dairy = ensureFood(test.tables(), 'Milch')!;
    test.apply(dairy.writes);
    test.apply(setStaple(test.tables(), dairy.foodId, true));
    test.apply(addReweFavorites(test.tables(), dairy.foodId, [{ ...milk, productId: milk.id }]));
    const sweets = { productId: '424242', name: 'Haribo Goldbären 175g', quantity: 1, price: 119 };
    const placed = order({ items: [line(onion, 2), line(organicCoconutMilk, 2), line(milk, 2), sweets] });
    test.apply(applyReweOrder(test.tables(), placed, NOW));

    expect(level('Zwiebeln')).toBe(2);
    expect(item('Kokosmilch').checked).toBe(true);
    expect(level('Kokosmilch')).toBe(800);
    expect(stockOf(test.tables(), dairy.foodId, '2026-10-07')).toBe(2000);
    expect(test.tables().foods[dairy.foodId]?.stockUnit).toBe('ml');
    expect(reweOrderExtras(test.tables(), placed)).toEqual(['Haribo Goldbären 175g']);
  });

  it('nimmt ohne Bestelldaten, was das Userscript in den Warenkorb gelegt hat', () => {
    const { test, item, items, order, level } = setUp();
    const placed = order({ items: null, pickupStart: null, pickupEnd: null }, { [coconutMilk.id]: 'failed' });
    test.apply(applyReweOrder(test.tables(), placed, NOW));

    expect(item('Zwiebeln').checked).toBe(true);
    expect(item('Kokosmilch').checked).toBe(false);
    // Ohne Abholzeit gilt der Einkauf ab jetzt.
    expect(stockBookings(test.tables(), item('Zwiebeln').foodId)[0]).toMatchObject({ amount: 3, createdAt: NOW });
    expect(level('Kokosmilch')).toBe(0);
    const [next] = listOpenShoppingLists(test.tables());
    expect(items(next!.id).map((entry) => [entry.name, entry.amount])).toEqual([
      ['Knoblauch', '2 Zehen'],
      ['Kokosmilch', '600 ml'],
      ['Salz', ''],
      ['Spülmittel', ''],
    ]);
  });

  it('setzt Fehlendes auf eine andere offene Liste und bucht anderswo Gekauftes ein', () => {
    const { test, ids, listId, item, items, order, level } = setUp();
    const other = createShoppingList(test.tables(), [], '2026-10-06', 4500, ids);
    test.apply(other.writes);
    // Knoblauch gab es auf dem Markt; abgehakt ist er gekauft, ohne Menge in Stück aber nicht zu buchen.
    test.apply(checkShoppingItem(test.tables(), item('Knoblauch').id, true));
    test.apply(addManualItem(test.tables(), listId, '500 g Reis', 4600, ids));
    test.apply(checkShoppingItem(test.tables(), item('Reis').id, true));
    test.apply(applyReweOrder(test.tables(), order({}), NOW));

    expect(listOpenShoppingLists(test.tables()).map((list) => list.id)).toEqual([other.listId]);
    expect(items(other.listId).map((entry) => entry.name)).toEqual(['Salz', 'Spülmittel']);
    // Reis braucht kein Rezept und soll nicht immer im Haus sein: Er kommt wie beim Abschließen von Hand nicht in den Vorrat.
    expect(stockBookings(test.tables(), item('Reis').foodId)).toEqual([]);
    expect(level('Zwiebeln')).toBe(3);
  });

  it('schließt nichts ab, wenn die Bestellung nicht passt oder die Liste schon abgeschlossen ist', () => {
    const { test, listId, order } = setUp();
    const other = order({ items: [{ productId: '424242', name: 'Haribo Goldbären 175g', quantity: 1, price: 119 }] });
    expect(reweOrderFits(test.tables(), other)).toBe(false);
    expect(applyReweOrder(test.tables(), other, NOW)).toEqual([]);
    expect(applyReweOrder(test.tables(), order(null), NOW)).toEqual([]);

    test.apply(completeShoppingList(test.tables(), listId));
    expect(applyReweOrder(test.tables(), order({}), NOW)).toEqual([]);
  });

  it('gleicht eine geänderte Bestellung an', () => {
    const { test, listId, item, items, order, level } = setUp();
    test.apply(applyReweOrder(test.tables(), order({ items: [line(onion, 3)] }), NOW));
    const restId = `${listId}~rest`;
    expect(items(restId).map((entry) => entry.name)).toEqual(['Knoblauch', 'Kokosmilch', 'Salz', 'Spülmittel']);

    // Kokosmilch kam noch dazu, die Zwiebeln flogen raus.
    test.apply(applyReweOrder(test.tables(), order({ items: [line(coconutMilk, 1)] }, {}, 6000), NOW + 1000));
    expect(item('Kokosmilch').checked).toBe(true);
    expect(item('Zwiebeln')).toMatchObject({ checked: false });
    expect(level('Kokosmilch')).toBe(400);
    expect(level('Zwiebeln')).toBe(0);
    expect(items(restId).map((entry) => entry.name)).toEqual(['Knoblauch', 'Zwiebeln', 'Salz', 'Spülmittel']);
    expect(test.tables().shoppingLists[listId]?.reweReportedAt).toBe(6000);
  });

  it('nimmt die Übernahme zurück', () => {
    const { test, ids, listId, entryId, item, items, order, level } = setUp();
    test.apply(applyReweOrder(test.tables(), order({}), NOW));
    test.apply(undoReweOrder(test.tables(), listId, NOW + 1000));

    expect(test.tables().shoppingLists[listId]).toMatchObject({ status: 'open', reweOrderId: '', reweReportedAt: 5000, rewePickupStart: null });
    expect(test.tables().planEntries[entryId]?.status).toBe('planned');
    expect(items().filter((entry) => entry.checked)).toEqual([]);
    expect(level('Zwiebeln')).toBe(0);
    expect(test.tables().shoppingLists[`${listId}~rest`]?.deletedAt).toBe(NOW + 1000);
    expect(listOpenShoppingLists(test.tables()).map((list) => list.id)).toEqual([listId]);
    expect(undoReweOrder(test.tables(), listId, NOW + 2000)).toEqual([]);

    // Steht auf der neuen Liste schon anderes, bleibt sie; Abgehaktes darauf auch.
    test.apply(applyReweOrder(test.tables(), order({}, {}, 6000), NOW + 3000));
    const restId = `${listId}~rest`;
    expect(test.tables().shoppingLists[restId]).toMatchObject({ status: 'open', deletedAt: null });
    test.apply(checkShoppingItem(test.tables(), item('Salz', restId).id, true));
    test.apply(addManualItem(test.tables(), restId, '2 l Milch', NOW + 3500, ids));
    test.apply(undoReweOrder(test.tables(), listId, NOW + 4000));
    expect(items(restId).map((entry) => [entry.name, entry.checked])).toEqual([
      ['Milch', false],
      ['Salz', true],
    ]);
    expect(test.tables().shoppingLists[restId]?.deletedAt).toBeNull();
  });

  it('zeigt die Bestellung bis zum Tag der Abholung', () => {
    const { test, listId, order } = setUp();
    expect(recentReweOrder(test.tables(), '2026-10-06')).toBeNull();
    test.apply(applyReweOrder(test.tables(), order({}), NOW));

    expect(recentReweOrder(test.tables(), '2026-10-07')).toEqual({
      listId,
      orderId: '4711',
      pickupStart: PICKUP_START,
      pickupEnd: PICKUP_END,
      ordered: 2,
      moved: 3,
      movedTo: 'Einkauf Di 6.10.',
    });
    expect(recentReweOrder(test.tables(), '2026-10-08')).toBeNull();

    expect(formatPickup(PICKUP_START, PICKUP_END, '2026-10-07')).toBe('heute, 17:00–18:00 Uhr');
    expect(formatPickup(PICKUP_START, PICKUP_END, '2026-10-06')).toBe('morgen, 17:00–18:00 Uhr');
    expect(formatPickup(PICKUP_START, null, '2026-10-05')).toBe('Mi 7.10., ab 17:00 Uhr');
    expect(formatPickup(null, null, '2026-10-05')).toBe('');
  });
});
