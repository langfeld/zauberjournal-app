import { AppState } from 'react-native';

import type { AppStore } from './store';

/** So lange nach der letzten Änderung warten; was kurz hintereinander geschieht, geht in einem Rutsch. */
const SAVE_DELAY_MS = 500;

/**
 * Speichert kurz nach einer Änderung statt noch im selben Tippen: Der Persister schreibt jedes Mal den ganzen
 * Haushalt als JSON, und mit `startAutoSave` müsste die Anzeige darauf warten. Geht die App in den
 * Hintergrund, wird sofort gespeichert.
 */
export function startDeferredSave(store: AppStore, persister: { save: () => Promise<unknown> }) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    void persister.save();
  };
  store.addDidFinishTransactionListener(() => {
    const [tables, values] = store.getTransactionChanges();
    if (Object.keys(tables).length === 0 && Object.keys(values).length === 0) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  });
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') save();
  });
}
