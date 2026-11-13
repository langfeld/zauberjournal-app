import { planAutoPostpone } from '@zauberjournal/core';
import { useEffect } from 'react';

import { useConnection } from './connection';
import { applyWrites } from './recipes';
import { useStore } from './store';
import { readAppTables, useToday } from './tables';

/** Nach dem Verbinden kurz warten, damit die Änderungen der anderen Geräte schon da sind. */
const SETTLE_MS = 2000;

/**
 * Ist der Tag eines Gerichts vorbei und niemand hat es als gekocht eingetragen, rückt es weiter, die Gerichte danach
 * rücken nach (`plan-postpone.ts` im Kern). Jeder Tag wird einmal geprüft (`planCheckedBefore`). Mit Haushalt erst
 * nach dem Verbinden: Was das andere Handy gestern Abend als gekocht eingetragen hat, soll hier nicht weiterrücken.
 * Ohne Verbindung wartet die App damit, bis der Server wieder erreichbar ist.
 */
export function AutoPostpone() {
  const store = useStore();
  const today = useToday();
  const { credentials, syncedAt } = useConnection();
  const paired = credentials !== null;
  const ready = !paired || syncedAt !== null;

  useEffect(() => {
    if (!store || !ready) return;
    const timer = setTimeout(
      () => {
        const checkedBefore = store.getValue('planCheckedBefore');
        if (checkedBefore >= today) return;
        // Noch nie geprüft und nichts im Plan, etwa vor dem Beitreten: Der Haushalt bringt seinen Stand gleich mit,
        // ein eigener würde ihn beim Abgleich überschreiben.
        if (!checkedBefore && store.getRowCount('planEntries') === 0) return;
        const now = Date.now();
        const writes = planAutoPostpone(readAppTables(store), checkedBefore, today, new Date(now).getHours(), now);
        store.transaction(() => {
          applyWrites(store, writes);
          store.setValue('planCheckedBefore', today);
        });
      },
      paired ? SETTLE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [store, ready, paired, syncedAt, today]);

  return null;
}
