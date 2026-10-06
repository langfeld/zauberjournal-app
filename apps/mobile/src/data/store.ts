import { tablesSchema, valuesSchema } from '@zauberjournal/core';
import { useCallback, useSyncExternalStore } from 'react';
import type { Store as UntypedStore, Table } from 'tinybase';
import { createMergeableStore } from 'tinybase/with-schemas';
import * as UiReact from 'tinybase/ui-react/with-schemas';

export type AppSchemas = [typeof tablesSchema, typeof valuesSchema];

/** Der Haushalts-Store: zusammenführbar, damit er zwischen Geräten synchronisiert werden kann. */
export function createAppStore() {
  return createMergeableStore().setSchema(tablesSchema, valuesSchema);
}

export type AppStore = ReturnType<typeof createAppStore>;

const ui = UiReact as UiReact.WithSchemas<AppSchemas>;

export const { Provider, useCreateMergeableStore, useCreatePersister, useStore, useValue } = ui;

const EMPTY_TABLE: Table = Object.freeze({});

/** Zuletzt gelesene Tabellen je Store; ändert sich eine, verwirft ein Listener sie. */
const snapshots = new WeakMap<UntypedStore, { tables: Map<string, Table>; watched: Set<string> }>();

function readTable(store: UntypedStore, tableId: string): Table {
  let cache = snapshots.get(store);
  if (!cache) {
    cache = { tables: new Map(), watched: new Set() };
    snapshots.set(store, cache);
  }
  const { tables, watched } = cache;
  if (!watched.has(tableId)) {
    watched.add(tableId);
    // Angemeldet, bevor eine Komponente die Tabelle abonniert: Wenn sie nachfragt, ist der alte Stand schon weg.
    store.addTableListener(tableId, () => tables.delete(tableId));
  }
  let table = tables.get(tableId);
  if (!table) {
    table = store.getTable(tableId);
    tables.set(tableId, table);
  }
  return table;
}

/**
 * Wie `useTable` von TinyBase, nur wird jede Tabelle nach einer Änderung einmal gelesen und von allen
 * Komponenten geteilt. TinyBase kopiert sie sonst bei jedem Rendern jeder Komponente und vergleicht sie Zelle
 * für Zelle mit dem letzten Stand; bei bis zu 17 Tabellen je Seite spürt man das auf dem Handy.
 */
export const useTable = ((tableId: string) => {
  const store = useStore() as unknown as UntypedStore | undefined;
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!store) return () => {};
      const listenerId = store.addTableListener(tableId, onChange);
      return () => {
        store.delListener(listenerId);
      };
    },
    [store, tableId],
  );
  const snapshot = () => (store ? readTable(store, tableId) : EMPTY_TABLE);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}) as unknown as typeof ui.useTable;
