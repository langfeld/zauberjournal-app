import { buildPlanEntry, createDietLookup } from '@zauberjournal/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { CookingMode } from '@/components/cooking-mode';
import { NotFound } from '@/components/not-found';
import { useAppTables } from '@/data/tables';

/** Kochmodus für einen Planeintrag: mit den Portionen und Optionen aller, die mitessen. */
export default function PlanCookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tables = useAppTables();
  const entry = useMemo(() => buildPlanEntry(tables, id, createDietLookup(tables)), [tables, id]);
  if (!entry?.recipe || entry.servings <= 0) {
    return <NotFound message="Diesen Eintrag gibt es nicht (mehr)." backLabel="Zum Plan" href="/plan" />;
  }
  return (
    <CookingMode
      view={entry.recipe}
      servings={entry.servings}
      distribution={entry.distribution}
      entry={{ id: entry.id, status: entry.status }}
    />
  );
}
