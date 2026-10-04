import { createMergeableStore } from 'tinybase';
import { describe, expect, it } from 'vitest';

import { createId } from './ids.ts';
import {
  buildRecipeView,
  createDistribution,
  displayIngredient,
  emptyRecipeDraft,
  formatDuration,
  listRecipes,
  planRecipeDelete,
  planRecipeSave,
  recipeViewToDraft,
  resizeDistribution,
  shiftServing,
  validateRecipeDraft,
  type RecipeDraft,
  type RecipeTables,
} from './recipe.ts';
import type { RowWrite } from './rows.ts';
import { tablesSchema } from './schema.ts';

/** Echter TinyBase-Store mit Schema, damit die Tests auch Standardwerte und null prüfen. */
function createTestStore() {
  const store = createMergeableStore().setTablesSchema(tablesSchema);
  return {
    apply(writes: RowWrite[]) {
      store.transaction(() => {
        for (const write of writes) store.setPartialRow(write.table, write.rowId, write.cells);
      });
    },
    tables(): RecipeTables {
      const tables = store.getTables() as Partial<RecipeTables>;
      return {
        recipes: tables.recipes ?? {},
        recipeIngredients: tables.recipeIngredients ?? {},
        recipeSteps: tables.recipeSteps ?? {},
        choiceGroups: tables.choiceGroups ?? {},
        choiceOptions: tables.choiceOptions ?? {},
      };
    },
  };
}

function saladDraft(): RecipeDraft {
  const chicken = createId();
  const halloumi = createId();
  return {
    ...emptyRecipeDraft(),
    title: 'Sättigender Salat',
    servings: 2,
    prepMinutes: 15,
    cookMinutes: 10,
    ingredients: [
      { id: createId(), kind: 'ingredient', text: '1 Kopf Romanasalat' },
      { id: createId(), kind: 'heading', text: 'Für das Dressing' },
      { id: createId(), kind: 'ingredient', text: '3 EL Olivenöl' },
      { id: createId(), kind: 'ingredient', text: '' },
    ],
    groups: [
      {
        id: createId(),
        name: 'Protein',
        options: [
          { id: chicken, name: 'Hähnchen', ingredients: [{ id: createId(), kind: 'ingredient', text: '300 g Hähnchenbrust' }] },
          { id: halloumi, name: 'Halloumi', ingredients: [{ id: createId(), kind: 'ingredient', text: '200 g Halloumi' }] },
        ],
      },
    ],
    steps: [
      { id: createId(), text: 'Salat waschen.', optionId: '' },
      { id: createId(), text: 'Hähnchen braten.', optionId: chicken },
      { id: createId(), text: 'Halloumi grillen.', optionId: halloumi },
      { id: createId(), text: '  ', optionId: '' },
      { id: createId(), text: 'Anrichten.', optionId: '' },
    ],
  };
}

function saveNew(store: ReturnType<typeof createTestStore>, draft: RecipeDraft) {
  const { recipeId, writes } = planRecipeSave(store.tables(), null, draft, 1000, createId);
  store.apply(writes);
  return recipeId;
}

describe('Rezept speichern und lesen', () => {
  it('speichert ein neues Rezept mit Wahlkomponente', () => {
    const store = createTestStore();
    const recipeId = saveNew(store, saladDraft());
    const view = buildRecipeView(store.tables(), recipeId)!;

    expect(view.title).toBe('Sättigender Salat');
    expect(view.ingredients.map((item) => [item.kind, item.amount, item.unit, item.name])).toEqual([
      ['ingredient', 1, 'Kopf', 'Romanasalat'],
      ['heading', null, '', 'Für das Dressing'],
      ['ingredient', 3, 'EL', 'Olivenöl'],
    ]);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]!.options.map((option) => option.name)).toEqual(['Hähnchen', 'Halloumi']);
    expect(view.groups[0]!.options[0]!.ingredients[0]).toMatchObject({ amount: 300, unit: 'g', name: 'Hähnchenbrust' });

    const chickenId = view.groups[0]!.options[0]!.id;
    expect(view.steps.map((step) => [step.text, step.optionId === chickenId])).toEqual([
      ['Salat waschen.', false],
      ['Hähnchen braten.', true],
      ['Halloumi grillen.', false],
      ['Anrichten.', false],
    ]);
  });

  it('schreibt nichts, wenn sich nichts geändert hat', () => {
    const store = createTestStore();
    const recipeId = saveNew(store, saladDraft());
    const draft = recipeViewToDraft(buildRecipeView(store.tables(), recipeId)!);

    expect(planRecipeSave(store.tables(), recipeId, draft, 2000, createId).writes).toEqual([]);
  });

  it('schreibt beim Bearbeiten nur geänderte Zellen und löscht entfernte Einträge weich', () => {
    const store = createTestStore();
    const recipeId = saveNew(store, saladDraft());
    const before = store.tables();
    const draft = recipeViewToDraft(buildRecipeView(before, recipeId)!);

    const [lettuce, , oil] = draft.ingredients;
    draft.ingredients = [lettuce!, oil!]; // Überschrift entfernt
    draft.groups[0]!.options[1]!.name = 'Grillkäse';
    draft.steps.reverse();

    const { writes } = planRecipeSave(before, recipeId, draft, 2000, createId);
    store.apply(writes);

    const removedHeading = writes.find((write) => write.cells.deletedAt === 2000);
    expect(removedHeading?.table).toBe('recipeIngredients');
    expect(writes.find((write) => write.rowId === lettuce!.id)).toBeUndefined();
    expect(writes.find((write) => write.table === 'recipes')?.cells).toEqual({ updatedAt: 2000 });

    const view = buildRecipeView(store.tables(), recipeId)!;
    expect(view.ingredients.map((item) => item.name)).toEqual(['Romanasalat', 'Olivenöl']);
    expect(view.groups[0]!.options[1]!.name).toBe('Grillkäse');
    expect(view.steps.map((step) => step.text)).toEqual([
      'Anrichten.',
      'Halloumi grillen.',
      'Hähnchen braten.',
      'Salat waschen.',
    ]);
  });

  it('macht Schritte einer entfernten Wahlkomponente zu Schritten für alle', () => {
    const store = createTestStore();
    const recipeId = saveNew(store, saladDraft());
    const draft = recipeViewToDraft(buildRecipeView(store.tables(), recipeId)!);
    draft.groups = [];

    store.apply(planRecipeSave(store.tables(), recipeId, draft, 2000, createId).writes);

    const view = buildRecipeView(store.tables(), recipeId)!;
    expect(view.groups).toEqual([]);
    expect(view.steps.every((step) => step.optionId === '')).toBe(true);
    expect(Object.values(store.tables().choiceOptions).every((option) => option.deletedAt === 2000)).toBe(true);
  });

  it('blendet gelöschte Rezepte aus', () => {
    const store = createTestStore();
    const recipeId = saveNew(store, saladDraft());
    store.apply(planRecipeDelete(recipeId, 3000));

    expect(buildRecipeView(store.tables(), recipeId)).toBeUndefined();
    expect(listRecipes(store.tables())).toEqual([]);
  });
});

describe('listRecipes', () => {
  it('sortiert alphabetisch und sucht in Titel, Zutaten und Optionen', () => {
    const store = createTestStore();
    saveNew(store, saladDraft());
    saveNew(store, { ...emptyRecipeDraft(), title: 'Apfelkuchen', ingredients: [{ id: createId(), kind: 'ingredient', text: '4 Äpfel' }] });

    expect(listRecipes(store.tables()).map((recipe) => recipe.title)).toEqual(['Apfelkuchen', 'Sättigender Salat']);
    expect(listRecipes(store.tables(), 'halloumi').map((recipe) => recipe.title)).toEqual(['Sättigender Salat']);
    expect(listRecipes(store.tables(), 'äpfel').map((recipe) => recipe.title)).toEqual(['Apfelkuchen']);

    const salad = listRecipes(store.tables(), 'salat')[0]!;
    expect(salad.totalMinutes).toBe(25);
    expect(salad.optionNames).toEqual(['Hähnchen', 'Halloumi']);
  });
});

describe('validateRecipeDraft', () => {
  it('meldet fehlende Angaben', () => {
    const draft: RecipeDraft = {
      ...emptyRecipeDraft(),
      servings: 0,
      groups: [{ id: 'g', name: '', options: [{ id: 'o', name: ' ', ingredients: [] }] }],
    };
    expect(validateRecipeDraft(draft)).toEqual([
      'Bitte einen Titel eingeben.',
      'Die Portionenzahl muss eine ganze Zahl ab 1 sein.',
      'Jede Wahlkomponente braucht einen Namen.',
      'Jede Option braucht einen Namen.',
    ]);
    expect(validateRecipeDraft(saladDraft())).toEqual([]);
  });
});

describe('Portionen verteilen', () => {
  const group = {
    id: 'protein',
    name: 'Protein',
    options: [
      { id: 'chicken', name: 'Hähnchen', ingredients: [] },
      { id: 'halloumi', name: 'Halloumi', ingredients: [] },
    ],
  };

  it('startet mit allen Portionen auf der ersten Option', () => {
    expect(createDistribution([group], 2)).toEqual({ protein: { chicken: 2, halloumi: 0 } });
  });

  it('verschiebt Portionen zwischen Optionen', () => {
    let distribution = createDistribution([group], 2);
    distribution = shiftServing(distribution, group, 'halloumi', 1);
    expect(distribution.protein).toEqual({ chicken: 1, halloumi: 1 });
    distribution = shiftServing(distribution, group, 'halloumi', -1);
    expect(distribution.protein).toEqual({ chicken: 2, halloumi: 0 });
    expect(shiftServing(distribution, group, 'halloumi', -1)).toBe(distribution);
  });

  it('passt die Verteilung an eine neue Portionenzahl an', () => {
    const distribution = { protein: { chicken: 1, halloumi: 1 } };
    expect(resizeDistribution(distribution, [group], 3).protein).toEqual({ chicken: 2, halloumi: 1 });
    expect(resizeDistribution(distribution, [group], 1).protein).toEqual({ chicken: 1, halloumi: 0 });
  });
});

describe('displayIngredient', () => {
  it('skaliert Mengen und wählt Einzahl oder Mehrzahl der Einheit', () => {
    const garlic = { id: 'x', kind: 'ingredient' as const, amount: 2, amountMax: null, unit: 'Zehe', name: 'Knoblauch', note: '' };
    expect(displayIngredient(garlic, 1)).toMatchObject({ amount: '2', unit: 'Zehen' });
    expect(displayIngredient(garlic, 0.5)).toMatchObject({ amount: '1', unit: 'Zehe' });

    const chicken = { id: 'y', kind: 'ingredient' as const, amount: 300, amountMax: null, unit: 'g', name: 'Hähnchenbrust', note: '' };
    expect(displayIngredient(chicken, 0.5)).toMatchObject({ amount: '150', unit: 'g' });
  });
});

describe('formatDuration', () => {
  it('formatiert Minuten und Stunden', () => {
    expect(formatDuration(45)).toBe('45 Min.');
    expect(formatDuration(60)).toBe('1 Std.');
    expect(formatDuration(75)).toBe('1 Std. 15 Min.');
  });
});
