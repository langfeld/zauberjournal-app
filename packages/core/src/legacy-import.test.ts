import { describe, expect, it } from 'vitest';

import {
  hasRecipeTitled,
  legacyFavoriteWrites,
  legacyIngredientNames,
  legacyRecipeDraft,
  readLegacyExport,
  type LegacyRecipe,
  type LegacyRewePreference,
} from './legacy-import.ts';
import { buildRecipeView, planRecipeSave } from './recipe.ts';
import { forgetReweFavorite, reweFavoritesOf } from './rewe-shopping.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

/** Aufbau wie im Export des alten Zauberjournals (gekürzt, Inhalt erfunden). */
const recipeExport = {
  version: '1.0',
  source: 'Zauberjournal (Admin-Export)',
  recipe_count: 1,
  recipes: [
    {
      title: 'Kräuter-Waffeln',
      description: 'Herzhafte Waffeln. ',
      servings: 2,
      prep_time: 10,
      cook_time: 0,
      difficulty: 'leicht',
      source_url: null,
      is_favorite: 1,
      notes: null,
      created_at: '2026-03-08 08:07:00',
      author: 'marco',
      categories: [{ name: 'Frühstück', icon: '🌅', color: '#f59e0b' }],
      ingredients: [
        { name: 'Eier', amount: 2, unit: '', group_name: 'Waffeln backen', sort_order: 0, is_optional: 0, notes: '' },
        { name: 'Mehl', amount: 150, unit: 'g', group_name: 'Teig rühren', sort_order: 1, is_optional: 0, notes: '' },
        { name: 'Backpulver', amount: 1, unit: 'TL', group_name: 'Teig rühren', sort_order: 2, is_optional: 1, notes: '' },
        { name: 'Rosmarin', amount: 1, unit: 'Stiel', group_name: 'Teig rühren', sort_order: 3, is_optional: 0, notes: 'fein gehackt' },
        { name: 'Paprika, rot', amount: 0.5, unit: '', group_name: 'Teig rühren', sort_order: 4, is_optional: 0, notes: '' },
        { name: 'Salz', amount: 0, unit: '', group_name: 'Teig rühren', sort_order: 5, is_optional: 0, notes: '' },
      ],
      steps: [
        { step_number: 2, title: 'Waffeln backen', instruction: 'Eier unterrühren und goldbraun backen.', duration_minutes: 7 },
        { step_number: 1, title: 'Teig rühren', instruction: 'Mehl, Backpulver und Kräuter mischen.', duration_minutes: 3 },
      ],
      image_base64: 'UklGRg==',
      image_mime: 'image/webp',
    },
    { title: '', ingredients: [], steps: [] },
  ],
};

const preferenceExport = {
  version: '1.0',
  type: 'rewe-preferences',
  preferences: [
    { ingredient_name: 'ei', rewe_product_id: '1', rewe_product_name: 'Eier M 10 Stück', rewe_price: 299, rewe_package_size: '10 Stück', times_selected: 1, owner: 'marco' },
    { ingredient_name: 'ei', rewe_product_id: '2', rewe_product_name: 'Bio-Eier 6 Stück', rewe_price: 279, rewe_package_size: '6 Stück', times_selected: 3, owner: 'marco' },
    { ingredient_name: 'mehl', rewe_product_id: '3', rewe_product_name: 'Weizenmehl 1kg', rewe_price: 79, rewe_package_size: '1kg', times_selected: 2, owner: 'marco' },
    { ingredient_name: 'mehl', rewe_product_id: '4', rewe_product_name: 'Dinkelmehl 1kg', rewe_price: 149, rewe_package_size: '1kg', times_selected: 1, owner: 'marco' },
    { ingredient_name: 'toilettenpapier', rewe_product_id: '5', rewe_product_name: 'Toilettenpapier 8 Rollen', rewe_price: 349, rewe_package_size: '8 Stück', times_selected: 1, owner: 'marco' },
    { ingredient_name: '', rewe_product_id: '6', rewe_product_name: 'ohne Zutat', rewe_price: 1, rewe_package_size: '', times_selected: 1, owner: 'marco' },
  ],
};

function recipes(): LegacyRecipe[] {
  const parsed = readLegacyExport(recipeExport);
  if (parsed?.kind !== 'recipes') throw new Error('Rezepte nicht erkannt');
  return parsed.recipes;
}

function preferences(): LegacyRewePreference[] {
  const parsed = readLegacyExport(preferenceExport);
  if (parsed?.kind !== 'rewe') throw new Error('Vorlieben nicht erkannt');
  return parsed.preferences;
}

describe('Übernahme aus dem alten Zauberjournal', () => {
  it('erkennt Rezepte und REWE-Vorlieben', () => {
    const [recipe, ...rest] = recipes();
    expect(rest).toEqual([]);
    expect(recipe).toMatchObject({
      title: 'Kräuter-Waffeln',
      description: 'Herzhafte Waffeln.',
      servings: 2,
      prepMinutes: 10,
      cookMinutes: null,
      source: '',
      createdAt: new Date(2026, 2, 8, 8, 7).getTime(),
      image: { base64: 'UklGRg==', mime: 'image/webp' },
    });
    expect(recipe?.steps.map((step) => step.title)).toEqual(['Teig rühren', 'Waffeln backen']);
    expect(preferences().map((entry) => entry.productId)).toEqual(['1', '2', '3', '4', '5']);
    expect(readLegacyExport({ hello: 'world' })).toBeNull();
    expect(readLegacyExport([])).toBeNull();
  });

  it('übernimmt Zutaten in der Reihenfolge der Schritte und die Schritte mit Titel', () => {
    const test = createTestStore();
    const recipe = recipes()[0]!;
    const draft = legacyRecipeDraft(recipe, counterIds('d'));
    expect(draft.ingredients.map((item) => item.text)).toEqual([
      'Teig rühren',
      '150 g Mehl',
      '1 TL Backpulver, optional',
      '1 Stiel Rosmarin, fein gehackt',
      '½ Paprika, rot',
      'Salz',
      'Waffeln backen',
      '2 Eier',
    ]);
    expect(draft.steps.map((step) => step.text)).toEqual([
      'Teig rühren: Mehl, Backpulver und Kräuter mischen.',
      'Waffeln backen: Eier unterrühren und goldbraun backen.',
    ]);

    const { recipeId, writes } = planRecipeSave(test.tables(), null, draft, recipe.createdAt!, counterIds('r'));
    test.apply(writes);
    const view = buildRecipeView(test.tables(), recipeId)!;
    expect(view.ingredients.map(({ kind, amount, unit, name, note }) => [kind, amount, unit, name, note])).toEqual([
      ['heading', null, '', 'Teig rühren', ''],
      ['ingredient', 150, 'g', 'Mehl', ''],
      ['ingredient', 1, 'TL', 'Backpulver', 'optional'],
      ['ingredient', 1, 'Stiel', 'Rosmarin', 'fein gehackt'],
      ['ingredient', 0.5, '', 'Paprika', 'rot'],
      ['ingredient', null, '', 'Salz', ''],
      ['heading', null, '', 'Waffeln backen', ''],
      ['ingredient', 2, '', 'Eier', ''],
    ]);
    expect(test.tables().recipes[recipeId]).toMatchObject({ createdAt: recipe.createdAt, servings: 2, prepMinutes: 10 });
    expect(hasRecipeTitled(test.tables(), ' kräuter-waffeln')).toBe(true);
    expect(hasRecipeTitled(test.tables(), 'Waffeln')).toBe(false);
  });

  it('lässt die Zwischenüberschrift weg, wenn alle Zutaten zu einer Gruppe gehören', () => {
    const recipe = recipes()[0]!;
    const single = { ...recipe, ingredients: recipe.ingredients.map((item) => ({ ...item, group: 'Teig rühren' })) };
    expect(legacyRecipeDraft(single, counterIds('d')).ingredients.every((item) => item.kind === 'ingredient')).toBe(true);
  });

  it('merkt sich REWE-Vorlieben je Lebensmittel, die häufigsten zuerst', () => {
    const test = createTestStore();
    const names = legacyIngredientNames(recipes()[0]!);
    expect(names).toContain('Eier');

    const result = legacyFavoriteWrites(test.tables(), preferences(), names);
    test.apply(result.writes);
    expect(result).toMatchObject({ foods: 3, products: 5 });
    // „ei“ landet beim Lebensmittel der Rezeptzutat „Eier“; angelegt werden nur Lebensmittel mit Produkt.
    expect(Object.values(test.tables().foods).map((food) => food.name).sort()).toEqual(['Eier', 'Mehl', 'Toilettenpapier']);
    expect(reweFavoritesOf(test.tables(), 'food:eier').map((favorite) => favorite.name)).toEqual(['Bio-Eier 6 Stück', 'Eier M 10 Stück']);
    expect(reweFavoritesOf(test.tables(), 'food:mehl')[0]).toEqual({
      productId: '3',
      name: 'Weizenmehl 1kg',
      imageUrl: '',
      price: 79,
      grammage: '1kg',
    });

    // Ein zweiter Lauf ändert nichts; Vergessenes bleibt vergessen.
    test.apply(forgetReweFavorite(test.tables(), 'food:mehl', '3', 5000));
    expect(legacyFavoriteWrites(test.tables(), preferences(), names)).toEqual({ writes: [], foods: 3, products: 0 });
    expect(reweFavoritesOf(test.tables(), 'food:mehl').map((favorite) => favorite.productId)).toEqual(['4']);
  });

  it('stellt übernommene Produkte hinter die schon gemerkten', () => {
    const test = createTestStore();
    const names = legacyIngredientNames(recipes()[0]!);
    const mehl = preferences().filter((entry) => entry.ingredient === 'mehl');
    test.apply(legacyFavoriteWrites(test.tables(), [mehl[1]!], names).writes);
    test.apply(legacyFavoriteWrites(test.tables(), mehl, names).writes);
    expect(reweFavoritesOf(test.tables(), 'food:mehl').map((favorite) => favorite.name)).toEqual(['Dinkelmehl 1kg', 'Weizenmehl 1kg']);
  });
});
