import { describe, expect, it } from 'vitest';

import { timeOfDay } from './dates.ts';
import { classifyFood, createFoodResolver, ensureFood, updateFood, type StockUnit } from './foods.ts';
import {
  addToPantry,
  correctStock,
  formatStock,
  pantryOverview,
  parseStockAmount,
  setStaple,
  setStockUnit,
  shelfLifeDays,
  stockBookings,
  stockOf,
  stockUnitFromRecipes,
  toStockAmount,
} from './pantry.ts';
import { bookPurchase, planAutoCook, planSetStatus, purchaseSuggestions } from './pantry-bookings.ts';
import { planAddEntry } from './plan.ts';
import { reweMatchItems } from './rewe-shopping.ts';
import {
  addManualItem,
  buildShoppingListView,
  checkShoppingItem,
  createShoppingList,
  setShoppingListEntries,
  syncShoppingList,
  type ShoppingItemView,
} from './shopping.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

const MONDAY = '2026-10-05';
const at = (day: string, hour = 12) => timeOfDay(day, hour);

function setUp() {
  const test = createTestStore();
  const ids = counterIds('x');
  // Ohne Personen isst der Plan so viele Portionen, wie das Rezept hat: Der Bedarf ist genau das Rezept.
  const curry = test.addRecipe('Curry', 4, ['300 g Reis', '400 ml Kokosmilch', '2 Zwiebeln', 'Salz', '1 Prise Zucker']);
  const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'dinner', recipeId: curry, text: '' }, 1000, ids);
  test.apply(writes);
  const list = createShoppingList(test.tables(), [entryId], MONDAY, 1000, ids);
  test.apply(list.writes);
  const sync = (day = MONDAY) => test.apply(syncShoppingList(test.tables(), list.listId, at(day)));
  sync();

  const foodId = (name: string) => createFoodResolver(test.tables()).resolve(name)!.id;
  // Wie „Bestand neu eintragen“ im Vorrat: Lebensmittel, die kein Rezept braucht, gibt es erst danach.
  const stock = (name: string, unit: StockUnit, amount: number, day = MONDAY) => {
    const food = ensureFood(test.tables(), name)!;
    test.apply(food.writes);
    test.apply(correctStock(test.tables(), food.foodId, amount, at(day, 9), ids, unit));
  };
  const level = (name: string, day = MONDAY) => stockOf(test.tables(), foodId(name), day);
  const view = () => buildShoppingListView(test.tables(), list.listId)!;
  const item = (name: string): ShoppingItemView => {
    const found = [...view().sections.flatMap((section) => section.items), ...view().pantry, ...view().done].find((entry) => entry.name === name);
    if (!found) throw new Error(`${name} fehlt auf der Liste`);
    return found;
  };
  const rewe = (name: string, productName: string, grammage: string, price: number) =>
    test.apply([
      { table: 'reweProducts', rowId: foodId(name), cells: { state: 'sure', productId: name, name: productName, grammage, price, listingId: 'l' } },
    ]);
  return { test, ids, curry, entryId, listId: list.listId, sync, foodId, stock, level, view, item, rewe };
}

describe('Vorrat', () => {
  it('rechnet Rezept-Einheiten in die Vorratseinheit um, wenn das sicher geht', () => {
    expect(toStockAmount(1.5, 'kg', 'g')).toBe(1500);
    expect(toStockAmount(0.5, 'l', 'ml')).toBe(500);
    expect(toStockAmount(2, 'EL', 'ml')).toBe(30);
    expect(toStockAmount(2, 'Dose', 'Stück')).toBe(2);
    expect(toStockAmount(3, '', 'Stück')).toBe(3);
    expect(toStockAmount(1, 'Prise', 'g')).toBeNull();
    expect(toStockAmount(2, 'Zehe', 'Stück')).toBeNull();
    expect(toStockAmount(200, 'g', 'Stück')).toBeNull();
    // Gramm und Milliliter gelten als gleich.
    expect(toStockAmount(200, 'g', 'ml')).toBe(200);
    expect(toStockAmount(2, 'EL', 'g')).toBe(30);
    expect(formatStock(1500, 'g')).toBe('1500 g');
    expect(formatStock(0.5, 'Stück')).toBe('0,5 Stück');
  });

  it('lässt Lagergemüse länger zählen als anderes Frisches', () => {
    const days = (name: string) => shelfLifeDays({ name, category: classifyFood(name).category });
    expect(['Zwiebeln', 'Rote Zwiebel', 'Knoblauchzehen', 'Kartoffeln', 'Zitronen'].map(days)).toEqual([28, 28, 28, 28, 28]);
    expect(['Frühlingszwiebeln', 'Spinat', 'Milch', 'Hähnchenbrust', 'Reis'].map(days)).toEqual([7, 7, 14, 3, null]);
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

  it('erkennt die Einheit, in der die Rezepte ein Lebensmittel meistens angeben', () => {
    const { test, foodId } = setUp();
    test.addRecipe('Zwiebelsuppe', 2, ['500 g Zwiebeln', '1 Zwiebel', '2 Zwiebeln']);
    expect(stockUnitFromRecipes(test.tables(), foodId('Zwiebeln'))).toBe('Stück');
    expect(stockUnitFromRecipes(test.tables(), foodId('Kokosmilch'))).toBe('ml');
    // „Salz“ ohne Menge und „1 Prise Zucker“ verraten keine Einheit.
    expect(stockUnitFromRecipes(test.tables(), foodId('Salz'))).toBeNull();
    expect(stockUnitFromRecipes(test.tables(), foodId('Zucker'))).toBeNull();
  });

  it('führt den Bestand als Summe von Buchungen, korrigiert per Differenz und leert höchstens', () => {
    const { test, ids, foodId, stock, level, entryId } = setUp();
    stock('Reis', 'g', 1000);
    test.apply(correctStock(test.tables(), foodId('Reis'), 750, at(MONDAY, 10), ids));
    expect(level('Reis')).toBe(750);
    expect(stockBookings(test.tables(), foodId('Reis')).map((booking) => booking.amount)).toEqual([-250, 1000]);
    expect(correctStock(test.tables(), foodId('Reis'), 750, at(MONDAY, 11), ids)).toEqual([]);

    // Eine andere Einheit fängt bei null an; zurück in Gramm zählen die alten Buchungen wieder.
    test.apply(setStockUnit(test.tables(), foodId('Reis'), 'Stück'));
    expect(level('Reis')).toBe(0);
    test.apply(setStockUnit(test.tables(), foodId('Reis'), 'g'));
    expect(level('Reis')).toBe(750);

    // Wer mehr verbraucht, als laut Vorrat da ist, hat danach nichts mehr, nicht weniger als nichts.
    stock('Kokosmilch', 'ml', 100);
    test.apply(planSetStatus(test.tables(), entryId, 'cooked', at('2026-10-06', 19)));
    expect(level('Kokosmilch', '2026-10-06')).toBe(0);
    test.apply(correctStock(test.tables(), foodId('Kokosmilch'), 400, at('2026-10-07'), ids));
    expect(level('Kokosmilch', '2026-10-07')).toBe(400);
  });

  it('lässt Reste von Frischem nach einigen Tagen ablaufen', () => {
    const { test, foodId, stock, level } = setUp();
    stock('Hähnchenbrust', 'g', 500);
    stock('Reis', 'g', 1000);
    expect(test.tables().foods[foodId('Hähnchenbrust')]?.category).toBe('meat');
    // Fleisch zählt drei Tage nach dem Einkauf, am vierten ist es weg; Reis hält.
    expect(level('Hähnchenbrust', '2026-10-08')).toBe(500);
    expect(level('Hähnchenbrust', '2026-10-09')).toBe(0);
    expect(level('Reis', '2026-11-30')).toBe(1000);
    expect(pantryOverview(test.tables(), '2026-10-06').find((entry) => entry.name === 'Hähnchenbrust')).toMatchObject({ daysLeft: 2 });

    // Neu gekauft fängt es frisch an, ohne den abgelaufenen Rest.
    stock('Hähnchenbrust', 'g', 300, '2026-10-10');
    expect(level('Hähnchenbrust', '2026-10-10')).toBe(300);
  });

  it('zeigt, was daheim ist und was immer im Haus sein soll', () => {
    const { test, ids, foodId, stock } = setUp();
    stock('Reis', 'g', 500);
    stock('Nudeln', 'g', 0);
    const salt = ensureFood(test.tables(), 'Salz')!;
    test.apply([...salt.writes, ...setStaple(test.tables(), salt.foodId, true)]);
    stock('Olivenöl', 'ml', 500);
    test.apply(setStaple(test.tables(), foodId('Olivenöl'), true));
    test.apply(correctStock(test.tables(), foodId('Olivenöl'), 0, at(MONDAY, 10), ids));

    const overview = pantryOverview(test.tables(), MONDAY);
    expect(overview.map((entry) => entry.name)).toEqual(['Olivenöl', 'Reis', 'Salz']);
    expect(overview.find((entry) => entry.name === 'Reis')).toMatchObject({ level: 500, unit: 'g', staple: false, empty: false, daysLeft: null });
    expect(overview.find((entry) => entry.name === 'Salz')).toMatchObject({ level: null, staple: true, empty: false });
    expect(overview.find((entry) => entry.name === 'Olivenöl')).toMatchObject({ level: 0, staple: true, empty: true });
  });

  it('nimmt „Hinzufügen“ mit Menge als Zugang, ohne Menge als „immer im Haus“', () => {
    const { test, ids, foodId, level } = setUp();
    const add = (text: string) => test.apply(addToPantry(test.tables(), text, at(MONDAY, 10), ids)!.writes);
    add('1 kg Reis');
    add('500 g Reis');
    add('Olivenöl');
    add('2 Zwiebeln');
    add('500 g Zwiebeln');
    expect(level('Reis')).toBe(1500);
    expect(test.tables().foods[foodId('Olivenöl')]).toMatchObject({ stock: 'have', stockUnit: '' });
    // Zwiebeln zählen in Stück; 500 g lassen sich nicht umrechnen und machen sie zu „immer im Haus“.
    expect(level('Zwiebeln')).toBe(2);
    expect(test.tables().foods[foodId('Zwiebeln')]).toMatchObject({ stock: 'have', stockUnit: 'Stück' });
    expect(addToPantry(test.tables(), '   ', at(MONDAY), ids)).toBeNull();
  });

  it('zieht den Vorrat auf der Einkaufsliste ab und kauft von selbst nur nach, was immer im Haus sein soll', () => {
    const { test, ids, listId, sync, foodId, stock, view, item } = setUp();
    stock('Reis', 'g', 500);
    stock('Kokosmilch', 'ml', 250);
    stock('Zwiebeln', 'Stück', 0);
    stock('Salz', 'g', 100);
    stock('Nudeln', 'g', 0);
    stock('Mehl', 'g', 0);
    test.apply(setStaple(test.tables(), foodId('Mehl'), true));
    sync();

    // Genug da: kommt aus dem Vorrat und steht unter „Vorrat prüfen“.
    expect(item('Reis')).toMatchObject({ covered: true, amount: '300 g', fromStock: 'aus dem Vorrat' });
    expect(item('Salz')).toMatchObject({ covered: true, amount: '', fromStock: 'aus dem Vorrat' });
    // Zu wenig da: nur der Rest steht auf der Liste.
    expect(item('Kokosmilch')).toMatchObject({ covered: false, amount: '150 ml', fromStock: '250 ml aus dem Vorrat' });
    expect(item('Zwiebeln')).toMatchObject({ covered: false, amount: '2 Stück', fromStock: '' });
    // Leer: Mehl soll immer im Haus sein und kommt auf die Liste, Nudeln nicht.
    expect(item('Mehl')).toMatchObject({ origin: 'pantry', amount: '' });
    expect(() => item('Nudeln')).toThrow();
    expect(view().pantry.map((entry) => entry.name)).toEqual(['Reis', 'Salz']);

    expect(reweMatchItems(test.tables(), listId).map((entry) => [entry.name, entry.amount])).toEqual(
      expect.arrayContaining([
        ['Kokosmilch', 150],
        ['Zwiebeln', 2],
        ['Mehl', null],
      ]),
    );
    expect(reweMatchItems(test.tables(), listId).map((entry) => entry.name)).not.toContain('Reis');

    // Mehr Bestand: Die Liste passt sich an.
    test.apply(correctStock(test.tables(), foodId('Kokosmilch'), 500, at(MONDAY, 10), ids));
    sync();
    expect(item('Kokosmilch')).toMatchObject({ covered: true, amount: '400 ml' });
  });

  it('schlägt nach dem Einkauf alles vor, was Rezepte brauchen, mit Einheit und Menge', () => {
    const { test, ids, listId, sync, rewe, item } = setUp();
    test.apply(addManualItem(test.tables(), listId, '500 g Reis', 2000, ids));
    test.apply(addManualItem(test.tables(), listId, 'Spülmittel', 2000, ids));
    sync();
    rewe('Kokosmilch', 'Kokosmilch 400ml', '400ml (1 l = 3,73 €)', 149);
    rewe('Zwiebeln', 'Zwiebel gelb ca. 100g', '1 Stück ca. 100 g (1 kg = 1,35 €)', 14);

    const suggestions = () => purchaseSuggestions(test.tables(), listId).map(({ name, amount, unit, selected }) => [name, amount, unit, selected]);
    // Spülmittel braucht kein Rezept und kommt nicht in den Vorrat; Reis aus Plan und Hand zählt zusammen.
    expect(suggestions()).toEqual([
      ['Kokosmilch', 400, 'ml', true],
      ['Reis', 800, 'g', true],
      ['Salz', null, 'g', false],
      ['Zucker', null, 'g', false],
      ['Zwiebeln', 2, 'Stück', true],
    ]);

    // Einzelnes abgehakt, z. B. aus der Drogerie: Es bleibt bei der Abholung, alles ist vorausgewählt.
    test.apply(checkShoppingItem(test.tables(), item('Spülmittel').id, true));
    test.apply(checkShoppingItem(test.tables(), item('Zwiebeln').id, true));
    expect(suggestions().filter(([, , , selected]) => selected).map(([name]) => name)).toEqual(['Kokosmilch', 'Reis', 'Zwiebeln']);

    // Mindestens die Hälfte abgehakt (Zwiebeln und zweimal Reis von sechs): Einkauf im Laden, nur Abgehaktes
    // ist vorausgewählt.
    const rice = buildShoppingListView(test.tables(), listId)!.sections.flatMap((section) => section.items).filter((entry) => entry.name === 'Reis');
    expect(rice).toHaveLength(2);
    for (const entry of rice) test.apply(checkShoppingItem(test.tables(), entry.id, true));
    expect(suggestions().filter(([, , , selected]) => selected).map(([name]) => name)).toEqual(['Reis', 'Zwiebeln']);
  });

  it('bucht den Einkauf ein, gibt neuen Lebensmitteln ihre Einheit und zählt nichts doppelt', () => {
    const { test, listId, foodId, level } = setUp();
    const salt = foodId('Salz');
    test.apply([...setStaple(test.tables(), salt, true), ...updateFood(test.tables(), salt, { stock: 'buy' })]);
    const writes = bookPurchase(
      test.tables(),
      listId,
      [
        { foodId: foodId('Kokosmilch'), amount: 400, unit: 'ml' },
        { foodId: foodId('Zwiebeln'), amount: 2, unit: 'Stück' },
        { foodId: salt, amount: 500, unit: 'g' },
        { foodId: foodId('Reis'), amount: 0, unit: 'g' },
      ],
      at(MONDAY, 18),
    );
    test.apply(writes);
    // Ein zweites Gerät bucht dasselbe: gleiche Zeilen, kein doppelter Bestand.
    test.apply(writes);
    expect(level('Kokosmilch')).toBe(400);
    expect(level('Zwiebeln')).toBe(2);
    expect(level('Salz')).toBe(500);
    expect(test.tables().foods[foodId('Kokosmilch')]?.stockUnit).toBe('ml');
    expect(test.tables().foods[salt]).toMatchObject({ stock: 'have', stockUnit: 'g' });
    expect(test.tables().foods[foodId('Reis')]?.stockUnit).toBe('');
    expect(stockBookings(test.tables(), foodId('Kokosmilch'))).toEqual([expect.objectContaining({ id: `${listId}~${foodId('Kokosmilch')}`, reason: 'purchase' })]);
  });

  it('bucht beim Kochen ab, genau einmal, und nimmt es mit dem Status zurück', () => {
    const { test, entryId, stock, level } = setUp();
    stock('Reis', 'g', 500);
    stock('Kokosmilch', 'ml', 600);
    stock('Zwiebeln', 'Stück', 3);
    stock('Zucker', 'g', 1000);

    const cooked = planSetStatus(test.tables(), entryId, 'cooked', at('2026-10-06', 19));
    test.apply(cooked);
    test.apply(cooked);
    expect(test.tables().planEntries[entryId]?.status).toBe('cooked');
    expect(level('Reis', '2026-10-06')).toBe(200);
    expect(level('Kokosmilch', '2026-10-06')).toBe(200);
    expect(level('Zwiebeln', '2026-10-06')).toBe(1);
    // „1 Prise“ lässt sich nicht in Gramm umrechnen: kein Abzug.
    expect(level('Zucker', '2026-10-06')).toBe(1000);
    expect(planSetStatus(test.tables(), entryId, 'cooked', at('2026-10-06', 20)).filter((write) => write.table === 'pantryBookings')).toEqual([]);

    test.apply(planSetStatus(test.tables(), entryId, 'shopped', at('2026-10-06', 21)));
    expect(level('Reis', '2026-10-06')).toBe(500);
    expect(level('Zwiebeln', '2026-10-06')).toBe(3);
  });

  it('bucht beim Kochen ganze Stück ab, weil Angebrochenes nicht in den Vorrat zurückkommt', () => {
    const { test, ids, stock, level } = setUp();
    const hummus = test.addRecipe('Hummus', 2, ['1,5 Dosen Kichererbsen']);
    const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-07', meal: 'dinner', recipeId: hummus, text: '' }, 1000, ids);
    test.apply(writes);
    stock('Kichererbsen', 'Stück', 4);
    test.apply(planSetStatus(test.tables(), entryId, 'cooked', at('2026-10-07', 19)));
    expect(level('Kichererbsen', '2026-10-07')).toBe(2);
  });

  it('nimmt eingekaufte Gerichte nach ihrem Tag als gekocht, gebucht nach dem Einkauf', () => {
    const { test, ids, curry, entryId, stock, level, foodId } = setUp();
    const planned = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'lunch', recipeId: curry, text: '' }, 1000, ids);
    test.apply(planned.writes);
    stock('Reis', 'g', 1000);
    test.apply(planSetStatus(test.tables(), entryId, 'shopped', at(MONDAY, 18)));
    // Die Liste wurde erst nach dem Plantag abgeschlossen: Der Einkauf zählt trotzdem vor dem Kochen.
    test.apply(bookPurchase(test.tables(), 'liste', [{ foodId: foodId('Kokosmilch'), amount: 400, unit: 'ml' }], at('2026-10-08', 7)));

    // Am Tag selbst noch nicht, erst danach; nur Eingekauftes, Geplantes bleibt.
    expect(planAutoCook(test.tables(), '2026-10-06', at('2026-10-06', 22))).toEqual([]);
    test.apply(planAutoCook(test.tables(), '2026-10-08', at('2026-10-08', 8)));
    expect(test.tables().planEntries[entryId]?.status).toBe('cooked');
    expect(test.tables().planEntries[planned.entryId]?.status).toBe('planned');
    expect(level('Reis', '2026-10-08')).toBe(700);
    expect(level('Kokosmilch', '2026-10-08')).toBe(0);
    expect(stockBookings(test.tables(), foodId('Reis'))[0]).toMatchObject({ reason: 'cooked', createdAt: at('2026-10-08', 8) });
    expect(planAutoCook(test.tables(), '2026-10-08', at('2026-10-08', 9))).toEqual([]);
  });

  it('braucht auf der Liste nichts mehr für Gekochtes, sonst zählte der Bedarf doppelt', () => {
    const { test, ids, entryId, listId, sync, stock, item } = setUp();
    const curry = test.tables().planEntries[entryId]!.recipeId;
    const second = planAddEntry(test.tables(), { date: '2026-10-08', meal: 'dinner', recipeId: curry, text: '' }, 1000, ids);
    test.apply(second.writes);
    test.apply(setShoppingListEntries(test.tables(), listId, [entryId, second.entryId]));
    stock('Kokosmilch', 'ml', 500);
    sync();
    expect(item('Kokosmilch')).toMatchObject({ amount: '300 ml', fromStock: '500 ml aus dem Vorrat' });

    // Das erste Curry ist gekocht: 100 ml sind übrig, das zweite braucht 400 ml. Es fehlen 300 ml, nicht 700 ml.
    test.apply(planSetStatus(test.tables(), entryId, 'cooked', at('2026-10-06', 19)));
    sync('2026-10-07');
    expect(item('Kokosmilch')).toMatchObject({ amount: '300 ml', fromStock: '100 ml aus dem Vorrat' });
  });
});
