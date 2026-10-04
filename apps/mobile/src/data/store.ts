import { tablesSchema } from '@zauberjournal/core';
import { createMergeableStore, type NoValuesSchema } from 'tinybase/with-schemas';
import * as UiReact from 'tinybase/ui-react/with-schemas';

export type AppSchemas = [typeof tablesSchema, NoValuesSchema];

/** Der Haushalts-Store: zusammenführbar, damit er später zwischen Geräten synchronisiert werden kann. */
export function createAppStore() {
  return createMergeableStore().setTablesSchema(tablesSchema);
}

export type AppStore = ReturnType<typeof createAppStore>;

export const { Provider, useCreateMergeableStore, useCreatePersister, useStore, useTable } =
  UiReact as UiReact.WithSchemas<AppSchemas>;
