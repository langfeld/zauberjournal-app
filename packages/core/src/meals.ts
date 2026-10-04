export const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type MealId = (typeof MEAL_IDS)[number];
export type MealSetting = 'mealBreakfast' | 'mealLunch' | 'mealDinner' | 'mealSnack';
export type Meal = { id: MealId; label: string; setting: MealSetting };

/** Mahlzeiten im Plan, in der Reihenfolge des Tages. `setting` ist der Schalter in den Einstellungen. */
export const MEALS: readonly Meal[] = [
  { id: 'breakfast', label: 'Frühstück', setting: 'mealBreakfast' },
  { id: 'lunch', label: 'Mittagessen', setting: 'mealLunch' },
  { id: 'dinner', label: 'Abendessen', setting: 'mealDinner' },
  { id: 'snack', label: 'Snack', setting: 'mealSnack' },
];

export function mealLabel(id: string): string {
  return MEALS.find((meal) => meal.id === id)?.label ?? id;
}

/** Aktive Mahlzeiten laut Einstellungen; ist keine aktiv, gilt das Abendessen. */
export function activeMeals(settings: Partial<Record<MealSetting, boolean>>): Meal[] {
  const active = MEALS.filter((meal) => settings[meal.setting] ?? meal.id === 'dinner');
  return active.length > 0 ? active : MEALS.filter((meal) => meal.id === 'dinner');
}
