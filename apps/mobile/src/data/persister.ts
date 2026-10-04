import { openDatabaseSync } from 'expo-sqlite';
import { createExpoSqlitePersister } from 'tinybase/persisters/persister-expo-sqlite/with-schemas';

import type { AppStore } from './store';

/** Speichert den Store auf dem Handy in SQLite. */
export function createAppPersister(store: AppStore) {
  return createExpoSqlitePersister(store, openDatabaseSync('zauberjournal.db'), 'zauberjournal');
}
