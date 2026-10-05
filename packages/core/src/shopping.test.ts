import { describe, expect, it } from 'vitest';

import { createFoodResolver } from './foods.ts';
import { addMember } from './members.ts';
import { planAddEntry, planSetServings } from './plan.ts';
import {
  addManualItem,
  buildShoppingListView,
  checkShoppingItem,
  completeShoppingList,
  computeShoppingNeeds,
  createShoppingList,
  setShoppingListEntries,
  syncShoppingList,
} from './shopping.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

function setUp() {
  const test = createTestStore();
  const ids = counterIds('x');
  test.apply(addMember(test.tables(), 'Marco', 'omnivore', ids).writes);
  test.apply(addMember(test.tables(), 'Anna', 'vegetarian', ids).writes);
  const salad = test.addRecipe('Salat', 2, ['1 Kopf Romanasalat', '2 EL Olivenöl', '1 Zwiebel', 'Salz'], {
    Hähnchen: ['300 g Hähnchenbrust'],
    Halloumi: ['200 g Halloumi'],
  });
  const curry = test.addRecipe('Curry', 4, ['2 Zwiebeln', '1 TL Olivenöl', '400 ml Kokosmilch', '1 Prise Salz', '2–3 Zehen Knoblauch']);
  const plan = (date: string, recipeId: string) => {
    const { entryId, writes } = planAddEntry(test.tables(), { date, meal: 'dinner', recipeId, text: '' }, 1000, ids);
    test.apply(writes);
    return entryId;
  };
  return { test, ids, salad, curry, plan };
}

describe('Einkaufsliste', () => {
  it('fasst den Bedarf mehrerer Gerichte nach Lebensmittel und Einheit zusammen', () => {
    const { test, salad, curry, plan } = setUp();
    const entries = [plan('2026-10-06', salad), plan('2026-10-07', curry)];

    const needs = computeShoppingNeeds(test.tables(), entries, createFoodResolver(test.tables()));
    const byName = Object.fromEntries(needs.map((need) => [need.name, `${need.amount} ${need.unit}`]));

    expect(byName).toEqual({
      Romanasalat: '1 Kopf',
      Zwiebel: '2 Stück',
      Knoblauch: '1.5 Zehe',
      Hähnchenbrust: '150 g',
      Halloumi: '100 g',
      Kokosmilch: '200 ml',
      // 2 EL + ½ TL = 6,5 TL → in EL
      Olivenöl: `${6.5 / 3} EL`,
      Salz: '0.5 Prise',
    });
    expect(needs.find((need) => need.name === 'Zwiebel')?.sources.map((source) => source.title)).toEqual(['Salat', 'Curry']);
    // Reihenfolge nach Warengruppen: Gemüse vor Kühlregal vor Fleisch
    expect(needs.map((need) => need.category)).toEqual([
      'produce', 'produce', 'produce', 'dairy', 'meat', 'canned', 'spices', 'spices',
    ]);
  });

  it('legt Positionen an, gleicht sie mit dem Plan ab und schreibt nichts doppelt', () => {
    const { test, ids, salad, curry, plan } = setUp();
    const saladEntry = plan('2026-10-06', salad);
    const curryEntry = plan('2026-10-07', curry);
    const { listId, writes } = createShoppingList(test.tables(), [saladEntry], '2026-10-05', 1000, ids);
    test.apply(writes);
    test.apply(syncShoppingList(test.tables(), listId, 2000));
    expect(syncShoppingList(test.tables(), listId, 3000)).toEqual([]);

    let view = buildShoppingListView(test.tables(), listId)!;
    expect(view.name).toBe('Einkauf Mo 5.10.');
    expect(view.sections.flatMap((section) => section.items.map((item) => `${item.name}: ${item.amount}`))).toEqual([
      'Romanasalat: 1 Kopf',
      'Zwiebel: 1 Stück',
      'Halloumi: 100 g',
      'Hähnchenbrust: 150 g',
      'Olivenöl: 2 EL',
      'Salz: ',
    ]);
    expect(view.sections[0]!.items[1]!.sources).toBe('Salat');
    expect(view.entries).toEqual([{ entryId: saladEntry, date: '2026-10-06', title: 'Salat', photo: '' }]);

    // Mehr Portionen für Anna und ein zweites Gericht: Die Liste folgt dem Plan.
    test.apply(setShoppingListEntries(test.tables(), listId, [saladEntry, curryEntry]));
    const [annaId] = Object.entries(test.tables().members).find(([, member]) => member.name === 'Anna')!;
    test.apply(planSetServings(test.tables(), saladEntry, annaId, 2, 4000));
    test.apply(syncShoppingList(test.tables(), listId, 4000));
    view = buildShoppingListView(test.tables(), listId)!;
    const amounts = Object.fromEntries(view.sections.flatMap((section) => section.items.map((item) => [item.name, item.amount])));
    // Zwiebel: Salat 1 × 3/2 + Curry 2 × 2/4; Knoblauch: Obergrenze 3 × 2/4
    expect(amounts).toMatchObject({ Zwiebel: '2½ Stück', Halloumi: '200 g', Kokosmilch: '200 ml', Knoblauch: '1½ Zehen' });
    expect(Object.keys(test.tables().foods)).toContain('food:zwiebel');
  });

  it('nennt jedes Gericht einmal, mehrfach geplante mit Anzahl', () => {
    const { test, ids, salad, curry, plan } = setUp();
    const entries = [plan('2026-10-06', curry), plan('2026-10-07', salad), plan('2026-10-09', curry)];
    const { listId, writes } = createShoppingList(test.tables(), entries, '2026-10-05', 1000, ids);
    test.apply(writes);
    test.apply(syncShoppingList(test.tables(), listId, 2000));

    const items = buildShoppingListView(test.tables(), listId)!.sections.flatMap((section) => section.items);
    const sources = Object.fromEntries(items.map((item) => [item.name, item.sources]));
    // Das Curry steht zuerst im Plan, deshalb heißt das Lebensmittel nach seiner Zutat „2 Zwiebeln“.
    expect(sources).toMatchObject({ Zwiebeln: '2× Curry, Salat', Kokosmilch: '2× Curry', Romanasalat: 'Salat' });
    expect(items.find((item) => item.name === 'Zwiebeln')?.dishes).toEqual([
      { title: 'Curry', photo: '', count: 2 },
      { title: 'Salat', photo: '', count: 1 },
    ]);
  });

  it('trennt Vorrat, Nachkaufen und Abgehaktes und schließt den Einkauf ab', () => {
    const { test, ids, curry, plan } = setUp();
    const entryId = plan('2026-10-07', curry);
    const { listId, writes } = createShoppingList(test.tables(), [entryId], '2026-10-05', 1000, ids);
    test.apply(writes);
    test.apply(syncShoppingList(test.tables(), listId, 2000));

    test.apply([
      { table: 'foods', rowId: 'food:salz', cells: { stock: 'have' } },
      { table: 'foods', rowId: 'food:milch', cells: { name: 'Milch', category: 'dairy', stock: 'buy' } },
    ]);
    test.apply(addManualItem(test.tables(), listId, '2 Spülmittel', 3000, ids));
    test.apply(syncShoppingList(test.tables(), listId, 3000));

    let view = buildShoppingListView(test.tables(), listId)!;
    expect(view.pantry.map((item) => item.name)).toEqual(['Salz']);
    const milk = view.sections.flatMap((section) => section.items).find((item) => item.name === 'Milch')!;
    expect(milk.origin).toBe('pantry');
    expect(view.sections.at(-1)).toMatchObject({ category: 'household', items: [{ name: 'Spülmittel', amount: '2' }] });

    test.apply(checkShoppingItem(test.tables(), milk.id, true));
    expect(test.tables().foods['food:milch']?.stock).toBe('have');
    test.apply(syncShoppingList(test.tables(), listId, 4000));
    view = buildShoppingListView(test.tables(), listId)!;
    expect(view.done.map((item) => item.name)).toEqual(['Milch']);

    test.apply(completeShoppingList(test.tables(), listId));
    expect(test.tables().planEntries[entryId]?.status).toBe('shopped');
    expect(syncShoppingList(test.tables(), listId, 5000)).toEqual([]);
  });
});
