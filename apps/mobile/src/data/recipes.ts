import type { RecipeTables, RowWrite } from '@zauberjournal/core';
import { useMemo } from 'react';
import type { Store as UntypedStore } from 'tinybase';
import type { Store } from 'tinybase/with-schemas';

import { useTable, type AppSchemas } from './store';

/** Alle Rezept-Tabellen; die Komponente rendert neu, sobald sich eine davon ändert. */
export function useRecipeTables(): RecipeTables {
  const recipes = useTable('recipes');
  const recipeIngredients = useTable('recipeIngredients');
  const recipeSteps = useTable('recipeSteps');
  const choiceGroups = useTable('choiceGroups');
  const choiceOptions = useTable('choiceOptions');
  return useMemo(
    () => ({ recipes, recipeIngredients, recipeSteps, choiceGroups, choiceOptions }),
    [recipes, recipeIngredients, recipeSteps, choiceGroups, choiceOptions],
  );
}

/** Wendet Schreiboperationen aus `packages/core` in einer Transaktion an. */
export function applyWrites(store: Store<AppSchemas>, writes: RowWrite[]) {
  const untyped = store as unknown as UntypedStore;
  untyped.transaction(() => {
    for (const { table, rowId, cells } of writes) untyped.setPartialRow(table, rowId, cells);
  });
}
