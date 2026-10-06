import { applyNutritionResults, foodsNeedingNutrition, type ShoppingTables } from '@zauberjournal/core';
import { useEffect, useRef } from 'react';

import { lookupNutrition } from './api';
import { useConnection } from './connection';
import { applyWrites } from './recipes';
import { useStore } from './store';
import { useAppTables } from './tables';

/** So viele Lebensmittel je Anfrage; die KI braucht für jede Runde etwas Zeit. */
const CHUNK_SIZE = 15;
/** Nach einem Fehler, und für schon Versuchtes, so lange warten. */
const RETRY_MS = 30 * 60 * 1000;

/**
 * Schlägt im Hintergrund die Nährwerte der Lebensmittel aus Rezepten nach, sobald der Server erreichbar ist,
 * in kleinen Teilen nacheinander. Was schon versucht wurde, kommt erst nach einer Weile wieder dran.
 */
export function NutritionSync() {
  const store = useStore();
  const tables = useAppTables();
  const { credentials } = useConnection();
  const latest = useRef<ShoppingTables>(tables);
  const busy = useRef(false);
  const failedAt = useRef(0);
  const attempted = useRef(new Map<string, number>());

  useEffect(() => {
    latest.current = tables;
  }, [tables]);

  useEffect(() => {
    const now = Date.now();
    if (!store || !credentials || busy.current || now - failedAt.current < RETRY_MS) return;
    const items = foodsNeedingNutrition(tables, now)
      .filter((item) => now - (attempted.current.get(item.id) ?? 0) > RETRY_MS)
      .slice(0, CHUNK_SIZE);
    if (items.length === 0) return;
    busy.current = true;
    for (const item of items) attempted.current.set(item.id, now);
    lookupNutrition(credentials, items)
      .then((results) => applyWrites(store, applyNutritionResults(latest.current, results, Date.now())))
      .catch(() => {
        failedAt.current = Date.now();
      })
      .finally(() => {
        busy.current = false;
      });
  }, [store, credentials, tables]);

  return null;
}
