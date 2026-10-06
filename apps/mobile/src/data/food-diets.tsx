import { repairFoodDiets } from '@zauberjournal/core';
import { useEffect } from 'react';

import { applyWrites } from './recipes';
import { useStore, useTable } from './store';

/**
 * Bessert die Ernährungsklasse gespeicherter Lebensmittel nach, wenn die Schlüsselwörter dazugelernt haben
 * (früher galt etwa „Limette“ als Fleisch). Beide Handys schreiben dieselben Werte, das gibt keine Konflikte.
 */
export function FoodDietRepair() {
  const store = useStore();
  const foods = useTable('foods');
  useEffect(() => {
    if (!store) return;
    const writes = repairFoodDiets({ foods });
    if (writes.length > 0) applyWrites(store, writes);
  }, [store, foods]);
  return null;
}
