import { afterEach, describe, expect, it, vi } from 'vitest';

import { cookingSteps } from './cooking.ts';
import { timeOfDay } from './dates.ts';
import { createFoodResolver, listFoods, repairFoodDiets } from './foods.ts';
import { addMember } from './members.ts';
import { applyNutritionResults, foodsNeedingNutrition, planEntryNutrition, recipeNutrition } from './nutrition.ts';
import { addToPantry, pantryOverview } from './pantry.ts';
import { bookPurchase, planAutoCook, purchaseSuggestions } from './pantry-bookings.ts';
import { buildPlanEntry, createDietLookup, listPlanEntries, planAddEntry } from './plan.ts';
import { listRecipes } from './recipe.ts';
import { recipesNeedingMeals } from './recipe-meals.ts';
import { buildShoppingListView, completeShoppingList, createShoppingList, syncShoppingList } from './shopping.ts';
import { createPlanner } from './suggestions.ts';
import { counterIds, createTestStore } from './test-helpers.ts';
import { compareText } from './text.ts';

const NAMES = [
  'Zucchini', 'äpfel', 'Apfelmus', 'Öl', 'Crème fraîche', 'Grieß', 'Avocado', 'oliven', 'Creme', 'Griess',
  'Rote Linsen', 'Rotkohl', 'Kartoffel-Lauch-Suppe', 'Kartoffelgratin', 'Jalapeño', 'Jalapeno', 'Müsli',
  'Muskatnuss', 'Ei', 'Eier', 'Übernacht-Oats', 'Udon', '2 Eier', 'Pâte brisée', 'Paprika',
];

describe('compareText', () => {
  it('sortiert wie localeCompare mit „de“ und sensitivity „base“', () => {
    const expected = [...NAMES].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    expect([...NAMES].sort(compareText)).toEqual(expected);
  });

  it('hält groß und klein, Umlaute, Akzente und ß für gleich', () => {
    expect(compareText('Salz', 'salz')).toBe(0);
    expect(compareText('Äpfel', 'apfel')).toBe(0);
    expect(compareText('Grieß', 'Griess')).toBe(0);
    expect(compareText('Crème', 'creme')).toBe(0);
    expect(compareText('Öl', 'Olive')).toBeLessThan(0);
  });
});

describe('Locale-Funktionen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Hermes ruft für jede davon auf Android Java auf; tausende je Seite hielten die App sekundenlang auf (siehe text.ts).
  it('braucht keine Seite von Plan, Einkauf, Vorrat und Rezepten', () => {
    const test = createTestStore();
    const ids = counterIds('t');
    test.apply(addMember(test.tables(), 'Marco', 'omnivore', ids).writes);
    test.apply(addMember(test.tables(), 'Anna', 'vegetarian', ids).writes);
    const bowl = test.addRecipe('Bowl', 2, ['150 g Reis', '2 Möhren'], { Hähnchen: ['300 g Hähnchenbrust'], Halloumi: ['200 g Halloumi'] });
    const porridge = test.addRecipe('Grießbrei', 2, ['100 g Grieß', '500 ml Milch', '1 Äpfel']);
    const plan = (recipeId: string, date: string) => {
      const { entryId, writes } = planAddEntry(test.tables(), { date, meal: 'dinner', recipeId, text: '' }, 1000, ids);
      test.apply(writes);
      return entryId;
    };
    const past = plan(bowl, '2026-10-08');
    const upcoming = [plan(porridge, '2026-10-11'), plan(bowl, '2026-10-12')];
    const done = createShoppingList(test.tables(), [past], '2026-10-07', 1000, ids);
    test.apply(done.writes);
    test.apply(syncShoppingList(test.tables(), done.listId, 1000));
    const rice = createFoodResolver(test.tables()).resolve('Reis')!.id;
    test.apply(bookPurchase(test.tables(), done.listId, [{ foodId: rice, amount: 500, unit: 'g' }], timeOfDay('2026-10-07', 12)));
    test.apply(completeShoppingList(test.tables(), done.listId));
    test.apply(addToPantry(test.tables(), 'Salz', 1000, ids)!.writes);
    const open = createShoppingList(test.tables(), upcoming, '2026-10-10', 1000, ids);
    test.apply(open.writes);
    test.apply(syncShoppingList(test.tables(), open.listId, 1000));
    const tables = test.tables();

    const spies = (['localeCompare', 'toLocaleLowerCase', 'toLocaleUpperCase'] as const).map((method) =>
      vi.spyOn(String.prototype, method),
    );
    const today = '2026-10-10';
    const dietOf = createDietLookup(tables);
    listPlanEntries(tables, '2026-10-05', '2026-11-08', dietOf);
    const entry = buildPlanEntry(tables, upcoming[1]!, dietOf)!;
    planEntryNutrition(tables, entry.id);
    cookingSteps(entry.recipe!, entry.servings, entry.distribution);
    syncShoppingList(tables, open.listId, timeOfDay(today, 12));
    buildShoppingListView(tables, open.listId);
    purchaseSuggestions(tables, open.listId);
    pantryOverview(tables, today);
    listFoods(tables);
    listRecipes(tables);
    listRecipes(tables, 'Möhre');
    recipeNutrition(tables, bowl);
    const planner = createPlanner(tables, today, 'dinner');
    planner.suggest(today);
    planner.draft(['2026-10-13', '2026-10-14']);
    planAutoCook(tables, today, timeOfDay(today, 12));
    applyNutritionResults(tables, [], 1000);
    foodsNeedingNutrition(tables, 1000);
    recipesNeedingMeals(tables);
    repairFoodDiets(tables);

    expect(spies.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0]);
  });
});
