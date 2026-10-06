import { describe, expect, it } from 'vitest';

import { buildRecipeView, emptyRecipeDraft, listRecipes, planRecipeSave, recipeViewToDraft } from './recipe.ts';
import {
  applyMealResults,
  isRecipePaused,
  pauseRecipe,
  PAUSED_FOREVER,
  recipeMealCells,
  recipesNeedingMeals,
  resumeRecipe,
} from './recipe-meals.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

describe('Mahlzeiten und Pause je Rezept', () => {
  it('lässt die KI zuordnen, was noch niemand festgelegt hat', () => {
    const test = createTestStore();
    const curry = test.addRecipe('Curry', 2, ['400 ml Kokosmilch', '1 Zwiebel']);
    const porridge = test.addRecipe('Porridge', 1, ['80 g Haferflocken']);
    test.apply([{ table: 'recipes', rowId: porridge, cells: recipeMealCells(['breakfast'], 'person') }]);

    expect(recipesNeedingMeals(test.tables())).toEqual([{ id: curry, title: 'Curry', description: '', ingredients: ['Kokosmilch', 'Zwiebel'] }]);
    // Was jemand inzwischen festgelegt hat, überschreibt die KI nicht.
    test.apply(applyMealResults(test.tables(), [
      { id: curry, meals: ['lunch', 'dinner'] },
      { id: porridge, meals: ['snack'] },
    ]));
    expect(buildRecipeView(test.tables(), curry)).toMatchObject({ meals: ['lunch', 'dinner'], mealsBy: 'ai' });
    expect(buildRecipeView(test.tables(), porridge)).toMatchObject({ meals: ['breakfast'], mealsBy: 'person' });
    expect(recipesNeedingMeals(test.tables())).toEqual([]);
  });

  it('speichert Mahlzeiten nur, wenn sie im Entwurf festgelegt sind', () => {
    const test = createTestStore();
    const ids = counterIds('r');
    const { recipeId, writes } = planRecipeSave(test.tables(), null, { ...emptyRecipeDraft(), title: 'Curry' }, 1000, ids);
    test.apply(writes);
    const stale = recipeViewToDraft(buildRecipeView(test.tables(), recipeId)!);
    expect(stale).toMatchObject({ meals: [], mealsBy: '' });

    // Die KI ordnet zu, während jemand den alten Entwurf noch offen hat.
    test.apply(applyMealResults(test.tables(), [{ id: recipeId, meals: ['dinner'] }]));
    test.apply(planRecipeSave(test.tables(), recipeId, { ...stale, notes: 'scharf' }, 2000, ids).writes);
    expect(buildRecipeView(test.tables(), recipeId)).toMatchObject({ meals: ['dinner'], mealsBy: 'ai', notes: 'scharf' });

    // Von Hand: keine Mahlzeit, also kein eigenes Gericht
    test.apply(planRecipeSave(test.tables(), recipeId, { ...stale, meals: [], mealsBy: 'person' }, 3000, ids).writes);
    expect(listRecipes(test.tables())[0]).toMatchObject({ meals: [], mealsBy: 'person' });
  });

  it('pausiert Rezepte für eine Zeit oder bis auf Weiteres', () => {
    const test = createTestStore();
    const curry = test.addRecipe('Curry', 2, ['400 ml Kokosmilch']);
    test.apply(pauseRecipe(curry, '2026-10-10', 14));
    const row = () => test.tables().recipes[curry]!;
    expect(row().pausedUntil).toBe('2026-10-24');
    expect(isRecipePaused(row(), '2026-10-23')).toBe(true);
    expect(isRecipePaused(row(), '2026-10-24')).toBe(false);

    test.apply(pauseRecipe(curry, '2026-10-10', null));
    expect(row().pausedUntil).toBe(PAUSED_FOREVER);
    test.apply(resumeRecipe(curry));
    expect(isRecipePaused(row(), '2026-10-10')).toBe(false);
  });
});
