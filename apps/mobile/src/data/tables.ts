import { activeMeals, todayKey, type Meal, type ShoppingTables } from '@zauberjournal/core';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useTable, useValue } from './store';

/** Alle Tabellen des Haushalts für Plan, Einkauf und Vorrat; rendert neu, sobald sich eine ändert. */
export function useAppTables(): ShoppingTables {
  const recipes = useTable('recipes');
  const recipeIngredients = useTable('recipeIngredients');
  const recipeSteps = useTable('recipeSteps');
  const choiceGroups = useTable('choiceGroups');
  const choiceOptions = useTable('choiceOptions');
  const members = useTable('members');
  const foods = useTable('foods');
  const foodAliases = useTable('foodAliases');
  const planEntries = useTable('planEntries');
  const planEaters = useTable('planEaters');
  const planChoices = useTable('planChoices');
  const shoppingLists = useTable('shoppingLists');
  const shoppingItems = useTable('shoppingItems');
  const reweProducts = useTable('reweProducts');
  const reweFavorites = useTable('reweFavorites');
  const pantryBookings = useTable('pantryBookings');
  const foodNutrition = useTable('foodNutrition');
  return useMemo(
    () => ({
      recipes,
      recipeIngredients,
      recipeSteps,
      choiceGroups,
      choiceOptions,
      members,
      foods,
      foodAliases,
      planEntries,
      planEaters,
      planChoices,
      shoppingLists,
      shoppingItems,
      reweProducts,
      reweFavorites,
      pantryBookings,
      foodNutrition,
    }),
    [
      recipes,
      recipeIngredients,
      recipeSteps,
      choiceGroups,
      choiceOptions,
      members,
      foods,
      foodAliases,
      planEntries,
      planEaters,
      planChoices,
      shoppingLists,
      shoppingItems,
      reweProducts,
      reweFavorites,
      pantryBookings,
      foodNutrition,
    ],
  );
}

/** Mahlzeiten, die der Plan zeigt (Einstellung im Haushalt). */
export function useActiveMeals(): Meal[] {
  const mealBreakfast = useValue('mealBreakfast');
  const mealLunch = useValue('mealLunch');
  const mealDinner = useValue('mealDinner');
  const mealSnack = useValue('mealSnack');
  return useMemo(
    () => activeMeals({ mealBreakfast, mealLunch, mealDinner, mealSnack }),
    [mealBreakfast, mealLunch, mealDinner, mealSnack],
  );
}

export type ReweSettings = { marketId: string; marketName: string; marketAddress: string; organic: boolean };

/** REWE-Markt des Haushalts; ohne Markt gibt es keinen Abgleich. */
export function useReweSettings(): ReweSettings {
  const marketId = useValue('reweMarketId');
  const marketName = useValue('reweMarketName');
  const marketAddress = useValue('reweMarketAddress');
  const organic = useValue('reweOrganic');
  return useMemo(
    () => ({ marketId, marketName, marketAddress, organic }),
    [marketId, marketName, marketAddress, organic],
  );
}

/** Heutiges Datum; aktualisiert sich, wenn die App nach Mitternacht wieder in den Vordergrund kommt. */
export function useToday(): string {
  const [today, setToday] = useState(() => todayKey());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(todayKey());
    });
    return () => subscription.remove();
  }, []);
  return today;
}
