import { createLocalPersister } from 'tinybase/persisters/persister-browser/with-schemas';

import type { AppStore } from './store';

/** Im Browser (nur zum Entwickeln und Testen) landet der Store im localStorage. */
export function createAppPersister(store: AppStore) {
  return createLocalPersister(store, 'zauberjournal');
}
