import { describe, expect, it } from 'vitest';

import { createFoodResolver, ensureFood } from './foods.ts';
import { addMember } from './members.ts';
import {
  applyNutritionResults,
  chooseFoodNutrition,
  foodsNeedingNutrition,
  ingredientGrams,
  planEntryNutrition,
  recipeNutrition,
  resetFoodNutrition,
  setGramsPerPiece,
  type NutrientValues,
  type NutritionResult,
} from './nutrition.ts';
import { planAddEntry } from './plan.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

const DAY = 24 * 60 * 60 * 1000;

function values(kcal: number, protein = 0): NutrientValues {
  return { kcal, fat: 0, saturatedFat: 0, carbs: 0, sugar: 0, fiber: 0, protein, salt: 0 };
}

function setUp() {
  const test = createTestStore();
  const ids = counterIds('n');
  test.apply(addMember(test.tables(), 'Marco', 'omnivore', ids).writes);
  test.apply(addMember(test.tables(), 'Anna', 'vegetarian', ids).writes);
  const bowl = test.addRecipe('Bowl', 2, ['200 g Reis', '1 Zwiebel', 'Salz'], {
    Hähnchen: ['300 g Hähnchenbrust'],
    Halloumi: ['200 g Halloumi'],
  });
  for (const name of ['Reis', 'Zwiebel', 'Salz', 'Hähnchenbrust', 'Halloumi']) test.apply(ensureFood(test.tables(), name)!.writes);
  const foodId = (name: string) => createFoodResolver(test.tables()).resolve(name)!.id;
  const nutrition = (name: string, kcal: number, gramsPerPiece: number | null = null) =>
    test.apply([{ table: 'foodNutrition', rowId: foodId(name), cells: { source: 'bls', code: name, label: name, gramsPerPiece, ...values(kcal) } }]);
  const result = (name: string, cells: Partial<NutritionResult> = {}): NutritionResult => ({
    id: foodId(name),
    source: 'bls',
    code: `C-${name}`,
    label: name,
    per100: values(100),
    gramsPerPiece: null,
    ean: '',
    ...cells,
  });
  return { test, ids, bowl, foodId, nutrition, result };
}

describe('Nährwerte', () => {
  it('rechnet Zutatenmengen in Gramm um', () => {
    expect(ingredientGrams(2, 'EL', null)).toBe(30);
    expect(ingredientGrams(1, 'kg', null)).toBe(1000);
    expect(ingredientGrams(0.5, 'l', null)).toBe(500);
    expect(ingredientGrams(2, '', 80)).toBe(160);
    expect(ingredientGrams(1, 'Dose', 240)).toBe(240);
    expect(ingredientGrams(1, 'Prise', null)).toBe(0.4);
    // Stück ohne bekanntes Gewicht und unbekannte Einheiten lassen sich nicht umrechnen.
    expect(ingredientGrams(2, 'Zehe', null)).toBeNull();
    expect(ingredientGrams(1, 'Quatsch', 10)).toBeNull();
  });

  it('rechnet je Person mit ihren Portionen und Optionen', () => {
    const { test, ids, bowl, nutrition } = setUp();
    nutrition('Reis', 350);
    nutrition('Zwiebel', 30, 80);
    nutrition('Hähnchenbrust', 110);
    nutrition('Halloumi', 320);
    const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'dinner', recipeId: bowl, text: '' }, 1000, ids);
    test.apply(writes);

    // Je Portion: 100 g Reis (350 kcal), eine halbe Zwiebel (40 g, 12 kcal); dazu 150 g Hähnchen oder 100 g Halloumi.
    const eaters = planEntryNutrition(test.tables(), entryId);
    expect(eaters.map(({ name, servings, summary }) => [name, servings, summary.values.kcal, summary.missing])).toEqual([
      ['Marco', 1, 527, []],
      ['Anna', 1, 682, []],
    ]);

    // Ohne Stückgewicht zählt die Zwiebel nicht und steht als fehlend da.
    test.apply(setGramsPerPiece(test.tables(), createFoodResolver(test.tables()).resolve('Zwiebel')!.id, null));
    expect(planEntryNutrition(test.tables(), entryId)[0]?.summary).toMatchObject({ missing: ['Zwiebel'] });
    expect(planEntryNutrition(test.tables(), entryId)[0]?.summary.values.kcal).toBe(515);
  });

  it('rechnet je Portion, mit Wahlkomponente je Option', () => {
    const { test, bowl, foodId, nutrition } = setUp();
    nutrition('Reis', 350);
    nutrition('Zwiebel', 30, 80);
    nutrition('Hähnchenbrust', 110);
    expect(recipeNutrition(test.tables(), bowl).map(({ label, summary }) => [label, summary.values.kcal, summary.missing])).toEqual([
      ['mit Hähnchen', 527, []],
      ['mit Halloumi', 362, ['Halloumi']],
    ]);

    // Fehlt bei einer Zutat ein einzelner Wert, ist die Summe nur eine Untergrenze.
    test.apply([{ table: 'foodNutrition', rowId: foodId('Hähnchenbrust'), cells: { fiber: null } }]);
    const [chicken, halloumi] = recipeNutrition(test.tables(), bowl);
    expect(chicken?.summary.incomplete).toEqual(['fiber']);
    expect(halloumi?.summary.incomplete).toEqual([]);
  });

  it('schlägt nach, was fehlt oder sich geändert hat, und merkt sich die Ergebnisse', () => {
    const { test, foodId, result } = setUp();
    const needed = () => foodsNeedingNutrition(test.tables(), 1000).map(({ name, ean, pieceUnit }) => [name, ean, pieceUnit]);
    test.apply([
      { table: 'reweProducts', rowId: foodId('Reis'), cells: { state: 'chosen', productId: '1', name: 'Reis 1kg', grammage: '1kg', ean: '4000000000017' } },
      { table: 'reweProducts', rowId: foodId('Zwiebel'), cells: { state: 'sure', productId: '2', name: 'Zwiebel gelb ca. 100g', grammage: '1 Stück ca. 100 g' } },
    ]);
    expect(needed()).toEqual([
      ['Hähnchenbrust', '', ''],
      ['Halloumi', '', ''],
      ['Reis', '4000000000017', ''],
      ['Salz', '', ''],
      ['Zwiebel', '', 'Stück'],
    ]);

    test.apply(
      applyNutritionResults(
        test.tables(),
        [
          result('Reis', { source: 'off', code: '4000000000017', ean: '4000000000017' }),
          // Das Stückgewicht der REWE-Packung („ca. 100 g“) gilt vor der Schätzung der KI.
          result('Zwiebel', { gramsPerPiece: 80 }),
          result('Salz', { source: 'none', per100: null }),
          result('Halloumi', { source: 'none', per100: null, temporary: true }),
          result('Hähnchenbrust'),
        ],
        1000,
      ),
    );
    expect(test.tables().foodNutrition[foodId('Zwiebel')]).toMatchObject({ source: 'bls', gramsPerPiece: 100, kcal: 100 });
    expect(test.tables().foodNutrition[foodId('Reis')]).toMatchObject({ source: 'off', ean: '4000000000017' });
    // Ein vorläufiges „nichts gefunden“ wird nicht gemerkt.
    expect(needed()).toEqual([['Halloumi', '', '']]);
    // Nichts gefunden: nach zwei Wochen noch einmal.
    expect(foodsNeedingNutrition(test.tables(), 1000 + 15 * DAY).map(({ name }) => name)).toEqual(['Halloumi', 'Salz']);

    // Ein anderes REWE-Produkt hat eine andere EAN: neu nachschlagen.
    test.apply([{ table: 'reweProducts', rowId: foodId('Reis'), cells: { ean: '4000000000024' } }]);
    expect(needed()).toEqual([
      ['Halloumi', '', ''],
      ['Reis', '4000000000024', ''],
    ]);
  });

  it('nimmt das Stückgewicht der Packung nur, wenn die Rezepte in Stück zählen', () => {
    const { test, foodId, result } = setUp();
    test.addRecipe('Knoblauchsoße', 2, ['2 Zehen Knoblauch']);
    test.apply(ensureFood(test.tables(), 'Knoblauch')!.writes);
    test.apply([
      { table: 'reweProducts', rowId: foodId('Knoblauch'), cells: { state: 'sure', productId: '3', name: 'Knoblauch ca. 60g', grammage: '1 Stück ca. 60 g' } },
    ]);
    expect(foodsNeedingNutrition(test.tables(), 1000).find(({ name }) => name === 'Knoblauch')?.pieceUnit).toBe('Zehe');
    // Eine Knolle wiegt 60 g, eine Zehe nur ein paar Gramm: Es gilt die Schätzung der KI.
    test.apply(applyNutritionResults(test.tables(), [result('Knoblauch', { gramsPerPiece: 4 })], 1000));
    expect(test.tables().foodNutrition[foodId('Knoblauch')]?.gramsPerPiece).toBe(4);
  });

  it('lässt von Hand Gewähltes in Ruhe, bis man wieder automatisch zuordnen lässt', () => {
    const { test, foodId, result } = setUp();
    const onion = foodId('Zwiebel');
    test.apply(chooseFoodNutrition(test.tables(), onion, { code: 'G480100', label: 'Speisezwiebel roh', per100: values(28, 1.2) }, 2000));
    test.apply(setGramsPerPiece(test.tables(), onion, 90));
    expect(foodsNeedingNutrition(test.tables(), 3000).map(({ name }) => name)).not.toContain('Zwiebel');
    expect(applyNutritionResults(test.tables(), [result('Zwiebel')], 3000)).toEqual([]);

    test.apply(resetFoodNutrition(test.tables(), onion));
    expect(foodsNeedingNutrition(test.tables(), 3000).map(({ name }) => name)).toContain('Zwiebel');
    test.apply(applyNutritionResults(test.tables(), [result('Zwiebel', { gramsPerPiece: 80 })], 3000));
    // Das selbst eingetragene Stückgewicht bleibt.
    expect(test.tables().foodNutrition[onion]).toMatchObject({ source: 'bls', label: 'Zwiebel', gramsPerPiece: 90, pinned: false });
  });
});
