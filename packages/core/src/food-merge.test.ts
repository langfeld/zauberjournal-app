import { describe, expect, it } from 'vitest';

import { mergeFoodGroup } from './food-merge.ts';
import { createFoodResolver, listFoods } from './foods.ts';
import { stockStates } from './pantry.ts';
import { reweFavoritesOf } from './rewe-shopping.ts';
import { createTestStore } from './test-helpers.ts';

const CHIPS = 'food:tortilla-chips';
const CHIPS_SPACE = 'food:tortillas chips';
const CHIPS_JOINED = 'food:tortillaschips';

function setUp() {
  const test = createTestStore();
  test.apply([
    { table: 'foods', rowId: CHIPS, cells: { name: 'Tortilla-Chips', category: 'sweets' } },
    { table: 'foods', rowId: CHIPS_SPACE, cells: { name: 'Tortillas Chips', category: 'sweets' } },
    { table: 'foods', rowId: CHIPS_JOINED, cells: { name: 'Tortillaschips', category: 'sweets', stockUnit: 'g' } },
  ]);
  return test;
}

describe('Lebensmittel zusammenführen', () => {
  it('übernimmt Namen, gemerkte REWE-Produkte, Nährwerte, Vorrat und eigene Positionen', () => {
    const test = setUp();
    test.apply([
      // Ein Produkt hat das bleibende schon, das zweite kommt dahinter.
      { table: 'reweFavorites', rowId: `${CHIPS}~p1`, cells: { foodId: CHIPS, productId: 'p1', sortKey: 'a0', name: 'Chips 1' } },
      { table: 'reweFavorites', rowId: `${CHIPS_SPACE}~p1`, cells: { foodId: CHIPS_SPACE, productId: 'p1', sortKey: 'a0', name: 'Chips 1' } },
      { table: 'reweFavorites', rowId: `${CHIPS_SPACE}~p2`, cells: { foodId: CHIPS_SPACE, productId: 'p2', sortKey: 'a1', name: 'Chips 2' } },
      { table: 'reweProducts', rowId: CHIPS_SPACE, cells: { state: 'chosen', productId: 'p2', name: 'Chips 2' } },
      { table: 'foodNutrition', rowId: CHIPS_JOINED, cells: { source: 'bls', code: 'X', kcal: 500 } },
      { table: 'pantryBookings', rowId: 'b1', cells: { foodId: CHIPS_JOINED, amount: 200, unit: 'g', reason: 'purchase', createdAt: 1000 } },
      { table: 'shoppingLists', rowId: 'l', cells: { name: 'Einkauf', status: 'open' } },
      { table: 'shoppingItems', rowId: 'i', cells: { listId: 'l', foodId: CHIPS_JOINED, name: 'Tortillaschips', origin: 'manual' } },
    ]);
    test.apply(mergeFoodGroup(test.tables(), CHIPS, [CHIPS, CHIPS_SPACE, CHIPS_JOINED], 5000));

    const tables = test.tables();
    expect(listFoods(tables).map((food) => food.name)).toEqual(['Tortilla-Chips']);
    expect(createFoodResolver(tables).resolve('Tortillaschips')?.id).toBe(CHIPS);
    expect(createFoodResolver(tables).resolve('Tortillas Chips')?.id).toBe(CHIPS);
    expect(reweFavoritesOf(tables, CHIPS).map((favorite) => favorite.productId)).toEqual(['p1', 'p2']);
    expect(tables.reweProducts[CHIPS]).toMatchObject({ state: 'chosen', productId: 'p2' });
    expect(tables.foodNutrition[CHIPS]).toMatchObject({ source: 'bls', kcal: 500 });
    expect(stockStates(tables, '2026-10-06').get(CHIPS)?.level).toBe(200);
    expect(tables.shoppingItems.i?.foodId).toBe(CHIPS);
  });

  it('behält REWE-Produkt und Nährwerte des bleibenden Lebensmittels', () => {
    const test = setUp();
    test.apply([
      { table: 'reweProducts', rowId: CHIPS, cells: { state: 'sure', productId: 'p1' } },
      { table: 'reweProducts', rowId: CHIPS_SPACE, cells: { state: 'chosen', productId: 'p2' } },
      { table: 'foodNutrition', rowId: CHIPS, cells: { source: 'off', kcal: 480 } },
      { table: 'foodNutrition', rowId: CHIPS_SPACE, cells: { source: 'bls', kcal: 500 } },
    ]);
    test.apply(mergeFoodGroup(test.tables(), CHIPS, [CHIPS_SPACE], 5000));
    expect(test.tables().reweProducts[CHIPS]).toMatchObject({ state: 'sure', productId: 'p1' });
    expect(test.tables().foodNutrition[CHIPS]).toMatchObject({ source: 'off', kcal: 480 });
    // Gelöschtes führt niemand mehr zusammen.
    expect(mergeFoodGroup(test.tables(), CHIPS, [CHIPS_SPACE], 6000)).toEqual([]);
  });
});
