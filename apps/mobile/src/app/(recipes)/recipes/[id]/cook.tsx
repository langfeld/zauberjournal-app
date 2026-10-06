import { buildRecipeView, resizeDistribution, type Distribution } from '@zauberjournal/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { CookingMode } from '@/components/cooking-mode';
import { NotFound } from '@/components/not-found';
import { useRecipeTables } from '@/data/recipes';

/** Portionen je Option aus dem Link; Unbrauchbares zählt als nichts gewählt. */
function readDistribution(text: string | undefined): Distribution {
  try {
    const value: unknown = JSON.parse(text ?? '{}');
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Distribution) : {};
  } catch {
    return {};
  }
}

/** Kochmodus aus dem Rezept: mit den Portionen und Optionen, die auf der Rezeptseite eingestellt sind. */
export default function RecipeCookScreen() {
  const params = useLocalSearchParams<{ id: string; servings?: string; distribution?: string }>();
  const tables = useRecipeTables();
  const view = useMemo(() => buildRecipeView(tables, params.id), [tables, params.id]);
  if (!view) return <NotFound />;
  const servings = Math.max(1, Math.round(Number(params.servings)) || view.servings);
  const distribution = resizeDistribution(readDistribution(params.distribution), view.groups, servings);
  return <CookingMode view={view} servings={servings} distribution={distribution} />;
}
