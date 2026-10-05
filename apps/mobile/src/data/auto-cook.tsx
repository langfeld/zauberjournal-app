import { planAutoCook } from '@zauberjournal/core';
import { useEffect } from 'react';

import { applyWrites } from './recipes';
import { useStore } from './store';
import { useAppTables, useToday } from './tables';

/**
 * Eingekaufte Gerichte, deren Tag vorbei ist, gelten als gekocht; ihre Zutaten gehen vom Vorrat ab.
 * Die Buchungen haben feste IDs, deshalb bucht auch ein zweites Handy nichts doppelt.
 */
export function AutoCook() {
  const store = useStore();
  const tables = useAppTables();
  const today = useToday();
  useEffect(() => {
    if (!store) return;
    const writes = planAutoCook(tables, today, Date.now());
    if (writes.length > 0) applyWrites(store, writes);
  }, [store, tables, today]);
  return null;
}
