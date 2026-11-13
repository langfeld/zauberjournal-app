import { buildRecipeView, isActive, resizeDistribution, type Distribution } from '@zauberjournal/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { CookingMode } from '@/components/cooking-mode';
import { NotFound } from '@/components/not-found';
import { useRecipeTables } from '@/data/recipes';
import { useTable } from '@/data/store';
import { useToday } from '@/data/tables';

/** Portionen je Option aus dem Link; Unbrauchbares zählt als nichts gewählt. */
function readDistribution(text: string | undefined): Distribution {
  try {
    const value: unknown = JSON.parse(text ?? '{}');
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Distribution) : {};
  } catch {
    return {};
  }
}

/**
 * Kochmodus aus dem Rezept: mit den Portionen und Optionen, die auf der Rezeptseite eingestellt sind. Steht das
 * Rezept heute im Plan, lässt es sich am Ende dort als gekocht eintragen; sonst rückte es nach dem Tag weiter.
 */
export default function RecipeCookScreen() {
  const params = useLocalSearchParams<{ id: string; servings?: string; distribution?: string }>();
  const tables = useRecipeTables();
  const planEntries = useTable('planEntries');
  const today = useToday();
  const view = useMemo(() => buildRecipeView(tables, params.id), [tables, params.id]);
  const planned = useMemo(() => {
    const found = Object.entries(planEntries).find(
      ([, entry]) => isActive(entry) && entry.recipeId === params.id && entry.date === today && entry.status !== 'cooked',
    );
    return found ? { id: found[0], status: found[1].status, fromRecipe: true } : undefined;
  }, [planEntries, params.id, today]);
  if (!view) return <NotFound />;
  const servings = Math.max(1, Math.round(Number(params.servings)) || view.servings);
  const distribution = resizeDistribution(readDistribution(params.distribution), view.groups, servings);
  return <CookingMode view={view} servings={servings} distribution={distribution} entry={planned} />;
}
