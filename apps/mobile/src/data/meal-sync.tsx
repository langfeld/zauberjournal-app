import { applyMealResults, recipesNeedingMeals, type RecipeTables } from '@zauberjournal/core';
import { useEffect, useRef } from 'react';

import { assignRecipeMeals } from './api';
import { useConnection } from './connection';
import { applyWrites, useRecipeTables } from './recipes';
import { useStore } from './store';

/** So viele Rezepte je Anfrage */
const CHUNK_SIZE = 40;
/** Nach einem Fehler, und für schon Versuchtes, so lange warten. */
const RETRY_MS = 30 * 60 * 1000;

/**
 * Lässt die KI im Hintergrund schätzen, wozu Rezepte passen, die noch niemand zugeordnet hat, sobald der
 * Server erreichbar ist. Was jemand inzwischen selbst festgelegt hat, bleibt.
 */
export function MealSync() {
  const store = useStore();
  const tables = useRecipeTables();
  const { credentials } = useConnection();
  const latest = useRef<RecipeTables>(tables);
  const busy = useRef(false);
  const failedAt = useRef(0);
  const attempted = useRef(new Map<string, number>());

  useEffect(() => {
    latest.current = tables;
  }, [tables]);

  useEffect(() => {
    const now = Date.now();
    if (!store || !credentials || busy.current || now - failedAt.current < RETRY_MS) return;
    const items = recipesNeedingMeals(tables)
      .filter((item) => now - (attempted.current.get(item.id) ?? 0) > RETRY_MS)
      .slice(0, CHUNK_SIZE);
    if (items.length === 0) return;
    busy.current = true;
    for (const item of items) attempted.current.set(item.id, now);
    assignRecipeMeals(credentials, items)
      .then((results) => applyWrites(store, applyMealResults(latest.current, results)))
      .catch(() => {
        failedAt.current = Date.now();
      })
      .finally(() => {
        busy.current = false;
      });
  }, [store, credentials, tables]);

  return null;
}
