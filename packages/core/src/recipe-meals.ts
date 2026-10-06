import { addDays } from './dates.ts';
import { MEALS, type MealId } from './meals.ts';
import type { RecipeRow, RecipeTables } from './recipe.ts';
import { activeSorted, isActive, type CellValue, type RowWrite } from './rows.ts';

/**
 * Wozu ein Rezept passt (seit M8): dieselben Mahlzeiten wie im Plan, mehrere möglich. Ohne Mahlzeit ist es kein
 * eigenes Gericht (Beilage, Sauce, Teig) und wird nicht vorgeschlagen. Dazu eine Pause für die Vorschläge.
 */

/** Wer die Mahlzeiten festgelegt hat: leer = noch niemand (dann ordnet die KI zu), `ai` = die KI, `person` = jemand im Haushalt. */
export const RECIPE_MEALS_BY = ['', 'ai', 'person'] as const;

export type RecipeMealsBy = (typeof RECIPE_MEALS_BY)[number];

/** Mahlzeiten aus den Zellen eines Rezepts, in der Reihenfolge des Tages */
export function recipeMealIds(row: Partial<RecipeRow>): MealId[] {
  return MEALS.filter((meal) => row[meal.setting] === true).map((meal) => meal.id);
}

/** Zellen für die Mahlzeiten eines Rezepts und wer sie festgelegt hat */
export function recipeMealCells(meals: readonly MealId[], by: RecipeMealsBy): Record<string, CellValue> {
  return { ...Object.fromEntries(MEALS.map((meal) => [meal.setting, meals.includes(meal.id)])), mealsBy: by };
}

// ─── Zuordnung durch die KI ───

/** Was die KI bekommt, um ein Rezept einzuordnen */
export type MealRequestItem = { id: string; title: string; description: string; ingredients: string[] };

/** Was die KI für ein Rezept schätzt; leer = kein eigenes Gericht */
export type MealResult = { id: string; meals: MealId[] };

/** Rezepte, deren Mahlzeiten noch niemand festgelegt hat */
export function recipesNeedingMeals(tables: RecipeTables): MealRequestItem[] {
  return Object.entries(tables.recipes)
    .filter(([, recipe]) => isActive(recipe) && !recipe.mealsBy && recipe.title.trim())
    .map(([id, recipe]) => ({
      id,
      title: recipe.title,
      description: recipe.description,
      ingredients: activeSorted(tables.recipeIngredients, (row) => row.recipeId === id && row.kind === 'ingredient').map(
        ([, row]) => row.name,
      ),
    }));
}

/** Übernimmt die Schätzung der KI, solange noch niemand etwas festgelegt hat. */
export function applyMealResults(tables: RecipeTables, results: readonly MealResult[]): RowWrite[] {
  return results.flatMap(({ id, meals }) => {
    const recipe = tables.recipes[id];
    if (!recipe || !isActive(recipe) || recipe.mealsBy) return [];
    return [{ table: 'recipes', rowId: id, cells: recipeMealCells(meals, 'ai') }];
  });
}

// ─── Pause ───

/** Pause ohne Ende */
export const PAUSED_FOREVER = '9999-12-31';

/** Wie lange ein Rezept nicht vorgeschlagen werden kann; `null` = bis auf Weiteres */
export const PAUSE_OPTIONS: readonly { label: string; days: number | null }[] = [
  { label: '2 Wochen', days: 14 },
  { label: '1 Monat', days: 30 },
  { label: '3 Monate', days: 91 },
  { label: '6 Monate', days: 182 },
  { label: 'bis auf Weiteres', days: null },
];

/** Wird das Rezept für diesen Tag gerade nicht vorgeschlagen? */
export function isRecipePaused(row: Partial<Pick<RecipeRow, 'pausedUntil'>>, date: string): boolean {
  return Boolean(row.pausedUntil) && date < row.pausedUntil!;
}

/** Pausiert ein Rezept ab heute für `days` Tage (`null` = bis auf Weiteres). */
export function pauseRecipe(recipeId: string, today: string, days: number | null): RowWrite[] {
  return [{ table: 'recipes', rowId: recipeId, cells: { pausedUntil: days === null ? PAUSED_FOREVER : addDays(today, days) } }];
}

export function resumeRecipe(recipeId: string): RowWrite[] {
  return [{ table: 'recipes', rowId: recipeId, cells: { pausedUntil: '' } }];
}
