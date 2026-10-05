import { describe, expect, it } from 'vitest';

import { updateFood } from './foods.ts';
import fixtures from './fixtures/rewe-products.json' with { type: 'json' };
import { addMember } from './members.ts';
import { planAddEntry } from './plan.ts';
import { rateProduct, type ReweMatchResult, type ReweProduct } from './rewe.ts';
import {
  applyReweMatches,
  buildReweOrder,
  chooseReweProduct,
  confirmReweProduct,
  forgetReweFavorite,
  moveReweFavorite,
  reweFavoritesOf,
  reweMatchItems,
  setRewePacks,
  skipRewe,
} from './rewe-shopping.ts';
import { addManualItem, buildShoppingListView, createShoppingList, syncShoppingList, type ShoppingItemView } from './shopping.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

const searches: Record<string, ReweProduct[]> = fixtures;

function product(search: string, name: string): ReweProduct {
  const found = searches[search]?.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`${name} fehlt in den Testdaten`);
  return found;
}

const looseOnion = product('Zwiebeln', 'Zwiebel gelb ca. 100g');
const onionBag = product('Zwiebeln', 'Zwiebeln 1,5kg');
const coconutMilk = product('Kokosmilch', 'REWE Beste Wahl Kokosmilch cremig 400ml');
const organicCoconutMilk = product('Kokosmilch', 'REWE Bio Kokosmilch 400ml');

function setUp() {
  const test = createTestStore();
  const ids = counterIds('x');
  test.apply(addMember(test.tables(), 'Marco', 'omnivore', ids).writes);
  test.apply(addMember(test.tables(), 'Anna', 'vegetarian', ids).writes);
  const curry = test.addRecipe('Curry', 2, ['3 Zwiebeln', '600 ml Kokosmilch', 'Salz', '2 Zehen Knoblauch']);
  const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'dinner', recipeId: curry, text: '' }, 1000, ids);
  test.apply(writes);
  const list = createShoppingList(test.tables(), [entryId], '2026-10-05', 1000, ids);
  test.apply(list.writes);
  test.apply(syncShoppingList(test.tables(), list.listId, 2000));
  const listId = list.listId;
  const view = () => buildShoppingListView(test.tables(), listId)!;
  const item = (name: string): ShoppingItemView => {
    const found = [...view().sections.flatMap((section) => section.items), ...view().pantry].find((entry) => entry.name === name);
    if (!found) throw new Error(`${name} fehlt auf der Liste`);
    return found;
  };
  const result = (name: string, candidates: ReweProduct[], confidence: ReweMatchResult['confidence'], learned = false) => {
    const { foodId } = item(name);
    const { amount, unit } = test.tables().shoppingItems[item(name).id]!;
    const need = { amount, unit, category: item(name).category };
    return { id: foodId, confidence, learned, candidates: candidates.map((candidate) => rateProduct(need, candidate)) };
  };
  const favorites = (name: string) => reweFavoritesOf(test.tables(), item(name).foodId).map((favorite) => favorite.name);
  return { test, ids, listId, view, item, result, favorites };
}

describe('REWE-Abgleich der Einkaufsliste', () => {
  it('sucht je Lebensmittel, was noch zu kaufen ist', () => {
    const { test, listId, item } = setUp();
    test.apply(updateFood(test.tables(), item('Salz').foodId, { stock: 'have' }));

    expect(reweMatchItems(test.tables(), listId)).toEqual([
      { id: item('Knoblauch').foodId, name: 'Knoblauch', category: 'produce', amount: 2, unit: 'Zehe', preferred: [] },
      { id: item('Zwiebeln').foodId, name: 'Zwiebeln', category: 'produce', amount: 3, unit: 'Stück', preferred: [] },
      { id: item('Kokosmilch').foodId, name: 'Kokosmilch', category: 'canned', amount: 600, unit: 'ml', preferred: [] },
    ]);
  });

  it('übernimmt Vorschläge und rechnet Packungen und Preis', () => {
    const { test, listId, view, item, result } = setUp();
    const results = [
      result('Zwiebeln', [looseOnion, onionBag], 'sure'),
      result('Kokosmilch', [coconutMilk], 'unsure'),
      result('Knoblauch', [], 'none'),
    ];
    test.apply(applyReweMatches(test.tables(), listId, results, 3000));
    expect(applyReweMatches(test.tables(), listId, results, 4000)).toEqual([]);

    expect(item('Zwiebeln').rewe).toMatchObject({ state: 'sure', name: 'Zwiebel gelb ca. 100g', packs: 3, manualPacks: false });
    expect(item('Kokosmilch').rewe).toMatchObject({ state: 'unsure', packs: 2 });
    expect(item('Knoblauch').rewe).toMatchObject({ state: 'none', productId: '' });
    // Ohne Produkt gibt es nichts zu bestätigen.
    expect(confirmReweProduct(test.tables(), item('Knoblauch').id, 3500)).toEqual([]);
    expect(item('Salz').rewe).toBeNull();
    expect(view().rewe).toEqual({
      products: 2,
      total: 3 * looseOnion.price + 2 * coconutMilk.price,
      toCheck: 2,
      pending: 1,
    });
  });

  it('merkt sich bestätigte Vorschläge', () => {
    const { test, listId, item, result } = setUp();
    test.apply(applyReweMatches(test.tables(), listId, [result('Kokosmilch', [coconutMilk], 'unsure')], 3000));
    test.apply(confirmReweProduct(test.tables(), item('Kokosmilch').id, 4000));

    expect(item('Kokosmilch').rewe).toMatchObject({ state: 'chosen', name: coconutMilk.name, rank: 1 });
    expect(reweMatchItems(test.tables(), listId).find((entry) => entry.name === 'Kokosmilch')?.preferred).toEqual([
      { productId: coconutMilk.id, name: coconutMilk.name },
    ]);
  });

  it('nimmt beim Abgleich das erste gemerkte Produkt, das es gibt', () => {
    const { test, listId, view, item, result, favorites } = setUp();
    test.apply(chooseReweProduct(test.tables(), item('Zwiebeln').id, onionBag, 'first', 3000));
    // Ein Ersatz kommt nach hinten; solange es die erste Wahl gibt, gilt sie.
    test.apply(chooseReweProduct(test.tables(), item('Zwiebeln').id, looseOnion, 'fallback', 3100));
    expect(favorites('Zwiebeln')).toEqual(['Zwiebeln 1,5kg', 'Zwiebel gelb ca. 100g']);
    expect(item('Zwiebeln').rewe).toMatchObject({ state: 'chosen', name: 'Zwiebeln 1,5kg', packs: 1, rank: 1 });
    expect(reweMatchItems(test.tables(), listId).find((entry) => entry.name === 'Zwiebeln')?.preferred).toEqual([
      { productId: onionBag.id, name: onionBag.name },
      { productId: looseOnion.id, name: looseOnion.name },
    ]);

    // Fehlt die erste Wahl, findet der Server den Ersatz; zu prüfen ist dann nichts.
    test.apply(applyReweMatches(test.tables(), listId, [result('Zwiebeln', [looseOnion, onionBag], 'sure', true)], 4000));
    expect(item('Zwiebeln').rewe).toMatchObject({ state: 'chosen', name: 'Zwiebel gelb ca. 100g', packs: 3, rank: 2 });
    expect(view().rewe.toCheck).toBe(0);

    // Gibt es keins, gilt der beste Vorschlag zum Prüfen, auch im Auftrag; gemerkt bleibt alles.
    const redOnions = product('Zwiebeln', 'Zwiebel rot 500g im Netz');
    test.apply(applyReweMatches(test.tables(), listId, [result('Zwiebeln', [redOnions], 'sure')], 5000));
    expect(item('Zwiebeln').rewe).toMatchObject({ state: 'missing', name: 'Zwiebel rot 500g im Netz', rank: null });
    expect(view().rewe.toCheck).toBe(1);
    expect(buildReweOrder(view(), '1234567').products.map((entry) => entry.name)).toEqual(['Zwiebel rot 500g im Netz']);
    expect(favorites('Zwiebeln')).toEqual(['Zwiebeln 1,5kg', 'Zwiebel gelb ca. 100g']);

    // Ohne Vorschlag kommt nichts in den Auftrag.
    test.apply(applyReweMatches(test.tables(), listId, [result('Zwiebeln', [], 'none')], 6000));
    expect(item('Zwiebeln').rewe).toMatchObject({ state: 'missing', productId: '' });
    expect(buildReweOrder(view(), '1234567').products).toEqual([]);
  });

  it('nimmt ein gewähltes Produkt gleich, wenn kein gemerktes davor zu haben ist', () => {
    const { test, listId, item, result, favorites } = setUp();
    const other = product('Kokosmilch', 'Biozentrale Bio Kokosmilch 400ml');
    test.apply(chooseReweProduct(test.tables(), item('Kokosmilch').id, coconutMilk, 'first', 3000));
    test.apply(applyReweMatches(test.tables(), listId, [result('Kokosmilch', [organicCoconutMilk], 'sure')], 4000));
    expect(item('Kokosmilch').rewe).toMatchObject({ state: 'missing', name: organicCoconutMilk.name });

    // „Passt, merken“ stellt den Vorschlag als Ersatz hinter die erste Wahl.
    test.apply(confirmReweProduct(test.tables(), item('Kokosmilch').id, 4500));
    expect(favorites('Kokosmilch')).toEqual([coconutMilk.name, organicCoconutMilk.name]);
    expect(item('Kokosmilch').rewe).toMatchObject({ state: 'chosen', name: organicCoconutMilk.name, rank: 2 });

    // Ein weiterer Ersatz kommt ans Ende und gilt nicht, solange etwas davor zu haben ist.
    test.apply(chooseReweProduct(test.tables(), item('Kokosmilch').id, other, 'fallback', 5000));
    expect(favorites('Kokosmilch')).toEqual([coconutMilk.name, organicCoconutMilk.name, other.name]);
    expect(item('Kokosmilch').rewe).toMatchObject({ name: organicCoconutMilk.name, rank: 2 });

    // Als erste Wahl gilt es sofort; die anderen rücken nach.
    test.apply(chooseReweProduct(test.tables(), item('Kokosmilch').id, other, 'first', 6000));
    expect(favorites('Kokosmilch')).toEqual([other.name, coconutMilk.name, organicCoconutMilk.name]);
    expect(item('Kokosmilch').rewe).toMatchObject({ state: 'chosen', name: other.name, rank: 1 });

    // Fehlt wieder alles, gilt ein gewählter Ersatz sofort.
    test.apply(applyReweMatches(test.tables(), listId, [result('Kokosmilch', [], 'none')], 7000));
    test.apply(chooseReweProduct(test.tables(), item('Kokosmilch').id, coconutMilk, 'fallback', 8000));
    expect(favorites('Kokosmilch')).toEqual([other.name, organicCoconutMilk.name, coconutMilk.name]);
    expect(item('Kokosmilch').rewe).toMatchObject({ state: 'chosen', name: coconutMilk.name, rank: 3 });
  });

  it('ordnet gemerkte Produkte um und vergisst sie', () => {
    const { test, item, favorites } = setUp();
    const foodId = item('Zwiebeln').foodId;
    test.apply(chooseReweProduct(test.tables(), item('Zwiebeln').id, onionBag, 'first', 3000));
    test.apply(chooseReweProduct(test.tables(), item('Zwiebeln').id, looseOnion, 'fallback', 3100));

    test.apply(moveReweFavorite(test.tables(), foodId, looseOnion.id, -1));
    expect(favorites('Zwiebeln')).toEqual(['Zwiebel gelb ca. 100g', 'Zwiebeln 1,5kg']);
    // Die Reihenfolge gilt ab dem nächsten Abgleich; bis dahin bleibt das Produkt, jetzt als Ersatz.
    expect(item('Zwiebeln').rewe).toMatchObject({ name: 'Zwiebeln 1,5kg', rank: 2 });
    expect(moveReweFavorite(test.tables(), foodId, looseOnion.id, -1)).toEqual([]);

    // Vergessen: Was gerade gilt, ist nur noch ein Vorschlag zum Prüfen.
    test.apply(forgetReweFavorite(test.tables(), foodId, onionBag.id, 4000));
    expect(favorites('Zwiebeln')).toEqual(['Zwiebel gelb ca. 100g']);
    expect(item('Zwiebeln').rewe).toMatchObject({ state: 'unsure', name: 'Zwiebeln 1,5kg', rank: null });

    // Wieder gewählt, kommt das vergessene Produkt zurück.
    test.apply(chooseReweProduct(test.tables(), item('Zwiebeln').id, onionBag, 'first', 5000));
    expect(favorites('Zwiebeln')).toEqual(['Zwiebeln 1,5kg', 'Zwiebel gelb ca. 100g']);
    expect(item('Zwiebeln').rewe).toMatchObject({ state: 'chosen', rank: 1 });
  });

  it('prüft beim Abgleich höchstens fünf gemerkte Produkte', () => {
    const { test, listId, item } = setUp();
    const onions = searches['Zwiebeln']!.slice(0, 7);
    for (const onion of onions) test.apply(chooseReweProduct(test.tables(), item('Zwiebeln').id, onion, 'fallback', 3000));

    expect(reweFavoritesOf(test.tables(), item('Zwiebeln').foodId)).toHaveLength(7);
    const preferred = reweMatchItems(test.tables(), listId).find((entry) => entry.name === 'Zwiebeln')?.preferred;
    expect(preferred?.map((entry) => entry.productId)).toEqual(onions.slice(0, 5).map((onion) => onion.id));
  });

  it('zählt von Hand geänderte Packungen, bis ein anderes Produkt kommt', () => {
    const { test, listId, item, result } = setUp();
    test.apply(applyReweMatches(test.tables(), listId, [result('Kokosmilch', [coconutMilk], 'sure')], 3000));
    test.apply(setRewePacks(item('Kokosmilch').id, 4));
    expect(item('Kokosmilch').rewe).toMatchObject({ packs: 4, manualPacks: true });

    const other = product('Kokosmilch', 'REWE Bio Kokosmilch 400ml');
    test.apply(chooseReweProduct(test.tables(), item('Kokosmilch').id, other, 'first', 4000));
    expect(item('Kokosmilch').rewe).toMatchObject({ name: 'REWE Bio Kokosmilch 400ml', packs: 2, manualPacks: false });
  });

  it('lässt Lebensmittel weg, die nicht bei REWE gekauft werden', () => {
    const { test, listId, view, item } = setUp();
    test.apply(skipRewe(test.tables(), item('Knoblauch').id, 3000));

    expect(item('Knoblauch').rewe?.state).toBe('skip');
    expect(reweMatchItems(test.tables(), listId).map((entry) => entry.name)).toEqual(['Zwiebeln', 'Kokosmilch', 'Salz']);
    expect(view().rewe).toEqual({ products: 0, total: 0, toCheck: 0, pending: 3 });

    test.apply(chooseReweProduct(test.tables(), item('Knoblauch').id, product('Knoblauch', 'Frischer Knoblauch ca. 60g'), 'first', 4000));
    expect(item('Knoblauch').rewe).toMatchObject({ state: 'chosen', packs: 1 });
  });

  it('stellt den Auftrag fürs Userscript zusammen', () => {
    const { test, ids, listId, view, item, result } = setUp();
    test.apply(addManualItem(test.tables(), listId, '2 Zwiebeln', 2500, ids));
    test.apply(
      applyReweMatches(
        test.tables(),
        listId,
        [result('Zwiebeln', [looseOnion], 'sure'), result('Kokosmilch', [coconutMilk], 'unsure'), result('Knoblauch', [], 'none')],
        3000,
      ),
    );
    const onionItems = view()
      .sections.flatMap((section) => section.items)
      .filter((entry) => entry.name === 'Zwiebeln')
      .map((entry) => entry.id);

    // Ohne Produkt (Knoblauch) oder ohne Abgleich (Salz) kommt nichts in den Auftrag; gleiche Produkte zählen zusammen.
    expect(buildReweOrder(view(), '1234567')).toEqual({
      listId,
      listName: 'Einkauf Mo 5.10.',
      marketId: '1234567',
      products: [
        {
          productId: looseOnion.id,
          listingId: looseOnion.listingId,
          name: looseOnion.name,
          packs: 5,
          price: looseOnion.price,
          itemIds: onionItems,
        },
        {
          productId: coconutMilk.id,
          listingId: coconutMilk.listingId,
          name: coconutMilk.name,
          packs: 2,
          price: coconutMilk.price,
          itemIds: [item('Kokosmilch').id],
        },
      ],
    });
  });
});
