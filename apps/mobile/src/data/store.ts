import { tablesSchema, valuesSchema } from '@zauberjournal/core';
import { createMergeableStore } from 'tinybase/with-schemas';
import * as UiReact from 'tinybase/ui-react/with-schemas';

export type AppSchemas = [typeof tablesSchema, typeof valuesSchema];

/** Der Haushalts-Store: zusammenführbar, damit er zwischen Geräten synchronisiert werden kann. */
export function createAppStore() {
  return createMergeableStore().setSchema(tablesSchema, valuesSchema);
}

export type AppStore = ReturnType<typeof createAppStore>;

export const { Provider, useCreateMergeableStore, useCreatePersister, useStore, useTable, useValue } =
  UiReact as UiReact.WithSchemas<AppSchemas>;
