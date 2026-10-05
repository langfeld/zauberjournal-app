import { describe, expect, it } from 'vitest';

import { createFoodResolver, ensureFood, type StockUnit } from './foods.ts';
import {
  correctStock,
  formatStock,
  parseStockAmount,
  setStockMode,
  stockBookings,
  stockOf,
  suggestStockUnit,
  toStockAmount,
} from './pantry.ts';
import { bookPurchase, planSetStatus, purchaseSuggestions } from './pantry-bookings.ts';
import { planAddEntry } from './plan.ts';
import { reweMatchItems } from './rewe-shopping.ts';
import {
  buildShoppingListView,
  checkShoppingItem,
  createShoppingList,
  setShoppingListEntries,
  syncShoppingList,
  type ShoppingItemView,
} from './shopping.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

function setUp() {
  const test = createTestStore();
  const ids = counterIds('x');
  // Ohne Personen isst der Plan so viele Portionen, wie das Rezept hat: Der Bedarf ist genau das Rezept.
  const curry = test.addRecipe('Curry', 4, ['300 g Reis', '400 ml Kokosmilch', '2 Zwiebeln', 'Salz', '1 Prise Zucker']);
  const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'dinner', recipeId: curry, text: '' }, 1000, ids);
  test.apply(writes);
  const list = createShoppingList(test.tables(), [entryId], '2026-10-05', 1000, ids);
  test.apply(list.writes);
  const sync = () => test.apply(syncShoppingList(test.tables(), list.listId, 2000));
  sync();

  const foodId = (name: string) => createFoodResolver(test.tables()).resolve(name)!.id;
  // Wie „Hinzufügen“ im Vorrat: Lebensmittel, die kein Rezept braucht, gibt es erst danach.
  const track = (name: string, unit: StockUnit, amount: number) => {
    const food = ensureFood(test.tables(), name)!;
    test.apply(food.writes);
    test.apply(setStockMode(test.tables(), food.foodId, 'exact', unit));
    test.apply(correctStock(test.tables(), food.foodId, amount, 1500, ids));
  };
  const view = () => buildShoppingListView(test.tables(), list.listId)!;
  const item = (name: string): ShoppingItemView => {
    const found = [...view().sections.flatMap((section) => section.items), ...view().pantry, ...view().done].find((entry) => entry.name === name);
    if (!found) throw new Error(`${name} fehlt auf der Liste`);
    return found;
  };
  return { test, ids, entryId, listId: list.listId, sync, foodId, track, view, item };
}

describe('Vorrat mit Mengen', () => {
  it('rechnet Rezept-Einheiten in die Vorratseinheit um, wenn das sicher geht', () => {
    expect(toStockAmount(1.5, 'kg', 'g')).toBe(1500);
    expect(toStockAmount(0.5, 'l', 'ml')).toBe(500);
    expect(toStockAmount(2, 'EL', 'ml')).toBe(30);
    expect(toStockAmount(2, 'Dose', 'Stück')).toBe(2);
    expect(toStockAmount(3, '', 'Stück')).toBe(3);
    expect(toStockAmount(1, 'Prise', 'g')).toBeNull();
    expect(toStockAmount(200, 'g', 'ml')).toBeNull();
    expect(toStockAmount(2, 'EL', 'g')).toBeNull();
    expect(formatStock(1500, 'g')).toBe('1500 g');
    expect(formatStock(0.5, 'Stück')).toBe('0,5 Stück');
  });

  it('liest Mengen aus Eingaben mit Komma, Punkt oder Tausenderpunkt', () => {
    expect(parseStockAmount('1,5')).toBe(1.5);
    expect(parseStockAmount(' 1.5 ')).toBe(1.5);
    expect(parseStockAmount('1.500')).toBe(1500);
    expect(parseStockAmount('2.000,5')).toBe(2000.5);
    expect(parseStockAmount('250')).toBe(250);
    expect(parseStockAmount('0')).toBe(0);
    for (const text of ['', '  ', 'viel', '-2', '1,2,3']) expect(parseStockAmount(text)).toBeNull();
  });

  it('schlägt die Einheit vor, in der die Rezepte ein Lebensmittel meistens angeben', () => {
    const { test, foodId } = setUp();
    test.addRecipe('Zwiebelsuppe', 2, ['500 g Zwiebeln', '1 Zwiebel', '2 Zwiebeln']);
    expect(suggestStockUnit(test.tables(), foodId('Zwiebeln'))).toBe('Stück');
    expect(suggestStockUnit(test.tables(), foodId('Kokosmilch'))).toBe('ml');
    // „Salz“ ohne Menge und „1 Prise Zucker“ verraten keine Einheit.
    expect(suggestStockUnit(test.tables(), foodId('Salz'))).toBe('g');
    expect(suggestStockUnit(test.tables(), foodId('Zucker'))).toBe('g');
  });

  it('führt den Bestand als Summe von Buchungen und korrigiert per Differenz', () => {
    const { test, ids, foodId, track } = setUp();
    track('Reis', 'g', 1000);
    test.apply(correctStock(test.tables(), foodId('Reis'), 750, 1600, ids));
    expect(stockOf(test.tables(), foodId('Reis'))).toBe(750);
    expect(stockBookings(test.tables(), foodId('Reis')).map((booking) => booking.amount)).toEqual([-250, 1000]);
    expect(correctStock(test.tables(), foodId('Reis'), 750, 1700, ids)).toEqual([]);

    // Eine andere Einheit fängt bei null an; zurück in Gramm zählen die alten Buchungen wieder.
    test.apply(setStockMode(test.tables(), foodId('Reis'), 'exact', 'Stück'));
    expect(stockOf(test.tables(), foodId('Reis'))).toBe(0);
    test.apply(setStockMode(test.tables(), foodId('Reis'), 'exact', 'g'));
    expect(stockOf(test.tables(), foodId('Reis'))).toBe(750);

    test.apply(setStockMode(test.tables(), foodId('Reis'), 'simple'));
    expect(test.tables().foods[foodId('Reis')]).toMatchObject({ stock: 'have', stockUnit: '' });
  });

  it('zieht den Vorrat auf der Einkaufsliste ab', () => {
    const { test, listId, sync, foodId, track, view, item } = setUp();
    track('Reis', 'g', 500);
    track('Kokosmilch', 'ml', 250);
    track('Zwiebeln', 'Stück', 0);
    track('Salz', 'g', 100);
    track('Nudeln', 'g', 0);
    sync();

    // Genug da: kommt aus dem Vorrat und steht unter „Vorrat prüfen“.
    expect(item('Reis')).toMatchObject({ covered: true, amount: '300 g', fromStock: 'aus dem Vorrat' });
    expect(item('Salz')).toMatchObject({ covered: true, amount: '', fromStock: 'aus dem Vorrat' });
    // Zu wenig da: nur der Rest steht auf der Liste.
    expect(item('Kokosmilch')).toMatchObject({ covered: false, amount: '150 ml', fromStock: '250 ml aus dem Vorrat' });
    expect(item('Zwiebeln')).toMatchObject({ covered: false, amount: '2 Stück', fromStock: '' });
    // Leer und von keinem Rezept gebraucht: kommt von selbst zum Nachkaufen auf die Liste.
    expect(item('Nudeln')).toMatchObject({ origin: 'pantry', amount: '' });
    expect(view().pantry.map((entry) => entry.name)).toEqual(['Reis', 'Salz']);

    expect(reweMatchItems(test.tables(), listId).map((entry) => [entry.name, entry.amount])).toEqual(
      expect.arrayContaining([
        ['Kokosmilch', 150],
        ['Zwiebeln', 2],
        ['Nudeln', null],
      ]),
    );
    expect(reweMatchItems(test.tables(), listId).map((entry) => entry.name)).not.toContain('Reis');

    // Mehr Bestand: Die Liste passt sich an.
    test.apply(correctStock(test.tables(), foodId('Kokosmilch'), 500, 1800, counterIds('k')));
    sync();
    expect(item('Kokosmilch')).toMatchObject({ covered: true, amount: '400 ml' });
  });

  it('schlägt nach dem Einkauf Mengen aus den REWE-Packungen oder der Liste vor und bucht sie ein', () => {
    const { test, ids, listId, sync, foodId, track } = setUp();
    track('Kokosmilch', 'ml', 250);
    track('Zwiebeln', 'Stück', 0);
    track('Nudeln', 'g', 0);
    sync();
    test.apply([
      {
        table: 'reweProducts',
        rowId: foodId('Kokosmilch'),
        cells: { state: 'sure', productId: '1', name: 'Kokosmilch 400ml', grammage: '400ml (1 l = 3,73 €)', price: 149, listingId: 'l1' },
      },
    ]);

    const suggestions = purchaseSuggestions(test.tables(), listId);
    expect(suggestions.map(({ name, unit, amount, selected }) => [name, amount, unit, selected])).toEqual(
      expect.arrayContaining([
        ['Kokosmilch', 400, 'ml', true],
        ['Zwiebeln', 2, 'Stück', true],
        ['Nudeln', null, 'g', false],
      ]),
    );
    expect(suggestions).toHaveLength(3);

    // Abgehakt unter „Vorrat prüfen“ heißt nur „ist da“, und Reis wird nicht mit Menge geführt: Die Vorauswahl bleibt.
    track('Salz', 'g', 100);
    sync();
    const salt = buildShoppingListView(test.tables(), listId)!.pantry.find((entry) => entry.name === 'Salz')!;
    test.apply(checkShoppingItem(test.tables(), salt.id, true));
    const rice = buildShoppingListView(test.tables(), listId)!.sections.flatMap((section) => section.items).find((entry) => entry.name === 'Reis')!;
    test.apply(checkShoppingItem(test.tables(), rice.id, true));
    expect(purchaseSuggestions(test.tables(), listId).filter((entry) => entry.selected).map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['Kokosmilch', 'Zwiebeln']),
    );

    // Wer abhakt, was zu kaufen war, kauft selbst ein: Dann ist nur Abgehaktes vorausgewählt.
    const onions = suggestions.find((entry) => entry.name === 'Zwiebeln')!;
    test.apply(checkShoppingItem(test.tables(), onions.itemId, true));
    expect(purchaseSuggestions(test.tables(), listId).filter((entry) => entry.selected).map((entry) => entry.name)).toEqual(['Zwiebeln']);

    test.apply(bookPurchase(test.tables(), listId, [{ foodId: foodId('Kokosmilch'), amount: 400 }, { foodId: foodId('Zwiebeln'), amount: 2 }, { foodId: foodId('Nudeln'), amount: 0 }], 3000, ids));
    expect(stockOf(test.tables(), foodId('Kokosmilch'))).toBe(650);
    expect(stockOf(test.tables(), foodId('Zwiebeln'))).toBe(2);
    expect(stockBookings(test.tables(), foodId('Kokosmilch'))[0]).toMatchObject({ reason: 'purchase', listId, amount: 400 });
    // Eine Menge von 0 wird nicht gebucht.
    expect(stockBookings(test.tables(), foodId('Nudeln'))).toEqual([]);
  });

  it('bucht beim Kochen ab, genau einmal, und nimmt es mit dem Status zurück', () => {
    const { test, ids, entryId, foodId, track } = setUp();
    track('Reis', 'g', 500);
    track('Kokosmilch', 'ml', 600);
    track('Zwiebeln', 'Stück', 3);
    track('Zucker', 'g', 1000);

    test.apply(planSetStatus(test.tables(), entryId, 'cooked', 4000, ids));
    expect(test.tables().planEntries[entryId]?.status).toBe('cooked');
    expect(stockOf(test.tables(), foodId('Reis'))).toBe(200);
    expect(stockOf(test.tables(), foodId('Kokosmilch'))).toBe(200);
    expect(stockOf(test.tables(), foodId('Zwiebeln'))).toBe(1);
    // „1 Prise“ lässt sich nicht in Gramm umrechnen: kein Abzug.
    expect(stockOf(test.tables(), foodId('Zucker'))).toBe(1000);

    expect(planSetStatus(test.tables(), entryId, 'cooked', 4100, ids).filter((write) => write.table === 'pantryBookings')).toEqual([]);

    test.apply(planSetStatus(test.tables(), entryId, 'shopped', 5000, ids));
    expect(stockOf(test.tables(), foodId('Reis'))).toBe(500);
    expect(stockOf(test.tables(), foodId('Zwiebeln'))).toBe(3);
  });

  it('braucht auf der Liste nichts mehr für Gekochtes, sonst zählte der Bedarf doppelt', () => {
    const { test, ids, entryId, listId, sync, track, item } = setUp();
    const curry = test.tables().planEntries[entryId]!.recipeId;
    const second = planAddEntry(test.tables(), { date: '2026-10-08', meal: 'dinner', recipeId: curry, text: '' }, 1000, ids);
    test.apply(second.writes);
    test.apply(setShoppingListEntries(test.tables(), listId, [entryId, second.entryId]));
    track('Kokosmilch', 'ml', 500);
    sync();
    expect(item('Kokosmilch')).toMatchObject({ amount: '300 ml', fromStock: '500 ml aus dem Vorrat' });

    // Das erste Curry ist gekocht: 100 ml sind übrig, das zweite braucht 400 ml. Es fehlen 300 ml, nicht 700 ml.
    test.apply(planSetStatus(test.tables(), entryId, 'cooked', 4000, ids));
    sync();
    expect(item('Kokosmilch')).toMatchObject({ amount: '300 ml', fromStock: '100 ml aus dem Vorrat' });
  });

  it('bucht beim Kochen ganze Stück ab, weil Angebrochenes nicht in den Vorrat zurückkommt', () => {
    const { test, ids, track, foodId } = setUp();
    const hummus = test.addRecipe('Hummus', 2, ['1,5 Dosen Kichererbsen']);
    const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-07', meal: 'dinner', recipeId: hummus, text: '' }, 1000, ids);
    test.apply(writes);
    track('Kichererbsen', 'Stück', 4);
    test.apply(planSetStatus(test.tables(), entryId, 'cooked', 4000, ids));
    expect(stockOf(test.tables(), foodId('Kichererbsen'))).toBe(2);
  });
});
