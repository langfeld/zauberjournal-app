// Nur für Tests: ein echter TinyBase-Store mit Schema, damit Standardwerte und null wie in der App gelten.
import { createMergeableStore } from 'tinybase';

import { createId } from './ids.ts';
import { emptyRecipeDraft, planRecipeSave, type RecipeDraft } from './recipe.ts';
import type { RowWrite } from './rows.ts';
import { tablesSchema, valuesSchema, type TableName } from './schema.ts';
import type { ShoppingTables } from './shopping.ts';

export function createTestStore() {
  const store = createMergeableStore().setSchema(tablesSchema, valuesSchema);
  const tables = (): ShoppingTables => {
    const all = store.getTables() as Partial<ShoppingTables>;
    const names = Object.keys(tablesSchema) as TableName[];
    return Object.fromEntries(names.map((name) => [name, all[name] ?? {}])) as unknown as ShoppingTables;
  };
  const apply = (writes: RowWrite[]) => {
    store.transaction(() => {
      for (const write of writes) store.setPartialRow(write.table, write.rowId, write.cells);
    });
  };
  /** Speichert ein Rezept aus Zutatenzeilen; Wahlkomponenten als `{ Name: [Zeilen] }`. */
  const addRecipe = (title: string, servings: number, lines: string[], options: Record<string, string[]> = {}) => {
    const draft: RecipeDraft = {
      ...emptyRecipeDraft(),
      title,
      servings,
      ingredients: lines.map((text) => ({ id: createId(), kind: 'ingredient', text })),
      groups:
        Object.keys(options).length > 0
          ? [
              {
                id: createId(),
                name: 'Protein',
                options: Object.entries(options).map(([name, optionLines]) => ({
                  id: createId(),
                  name,
                  ingredients: optionLines.map((text) => ({ id: createId(), kind: 'ingredient', text })),
                })),
              },
            ]
          : [],
    };
    const { recipeId, writes } = planRecipeSave(tables(), null, draft, 1000, createId);
    apply(writes);
    return recipeId;
  };
  return { store, tables, apply, addRecipe };
}

export function counterIds(prefix = 'id'): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}
