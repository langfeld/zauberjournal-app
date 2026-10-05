import { applyReweMatches, reweMatchItems, type ShoppingTables } from '@zauberjournal/core';
import { useState } from 'react';

import { errorMessage } from '@/lib/error-message';

import { matchReweItems } from './api';
import { useConnection } from './connection';
import { applyWrites } from './recipes';
import { useStore } from './store';
import { useReweSettings } from './tables';

/** So viele Positionen je Anfrage; dazwischen zeigt die App den Fortschritt. */
const CHUNK_SIZE = 5;

export type ReweMatchProgress = { done: number; total: number };

/** Gleicht eine Einkaufsliste mit dem REWE-Markt des Haushalts ab und schreibt die Treffer in den Store. */
export function useReweMatch() {
  const store = useStore();
  const { credentials } = useConnection();
  const settings = useReweSettings();
  const [progress, setProgress] = useState<ReweMatchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (tables: ShoppingTables, listId: string) => {
    if (!store || !credentials || !settings.marketId || progress) return;
    const items = reweMatchItems(tables, listId);
    if (items.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: items.length });
    try {
      for (let start = 0; start < items.length; start += CHUNK_SIZE) {
        const chunk = items.slice(start, start + CHUNK_SIZE);
        const results = await matchReweItems(credentials, settings.marketId, settings.organic, chunk);
        // Jeder Teil betrifft andere Lebensmittel; der Stand vom Start reicht zum Vergleichen.
        applyWrites(store, applyReweMatches(tables, listId, results, Date.now()));
        setProgress({ done: start + chunk.length, total: items.length });
      }
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setProgress(null);
    }
  };

  return { settings, connected: credentials !== null, progress, error, run };
}
