import type { MealId } from './meals.ts';
import { emptyRecipeDraft, type ChoiceGroupDraft, type IngredientDraft, type RecipeDraft, type StepDraft } from './recipe.ts';

/** Höchstwerte für einen Import; App und Server prüfen dieselben. */
export const IMPORT_LIMITS = { images: 4, textLength: 50_000, urlLength: 2_000 } as const;

/** Eine Zutatenzeile wie „200 g Mehl“; `section` ist die Zwischenüberschrift, leer = keine. */
export type ImportedIngredient = { section: string; text: string };

/**
 * Vorschlag der KI für ein Rezept mit Fleisch oder Fisch. Die genannten Zutaten und Schritte
 * werden zur ersten Option einer Wahlkomponente, die vegetarische Variante zur zweiten.
 * Die Indizes zählen ab 0 und beziehen sich auf `ingredients` und `steps` des Rezepts.
 */
export type VegetarianSuggestion = {
  groupName: string;
  meatOptionName: string;
  vegetarianOptionName: string;
  meatIngredientIndexes: number[];
  meatStepIndexes: number[];
  ingredients: string[];
  steps: string[];
};

/** Ergebnis eines Imports aus Foto, Link oder Text, wie es der Server liefert. */
export type ImportedRecipe = {
  title: string;
  description: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string;
  ingredients: ImportedIngredient[];
  steps: string[];
  notes: string;
  /** Wozu das Gericht passt; `null` = unbekannt, etwa ohne KI. */
  meals: MealId[] | null;
  /** Stellen, die die KI nicht sicher lesen konnte oder geschätzt hat. */
  uncertainties: string[];
  vegetarian: VegetarianSuggestion | null;
};

const DEFAULT_SERVINGS = 2;
const MAX_SERVINGS = 99;
const MAX_MINUTES = 9_999;

function wholeNumber(value: number | null, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= max ? rounded : null;
}

function texts(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

/**
 * Macht aus einem importierten Rezept einen Entwurf für den Editor.
 * Ein vegetarischer Vorschlag wird zur Wahlkomponente; seine Schritte folgen auf den letzten Fleischschritt.
 */
export function importedRecipeToDraft(recipe: ImportedRecipe, createId: () => string): RecipeDraft {
  const lines = recipe.ingredients.map((item) => ({ section: item.section.trim(), text: item.text.trim() }));
  const stepTexts = recipe.steps.map((step) => step.trim());

  const suggestion = recipe.vegetarian;
  const meatLines = new Set(suggestion?.meatIngredientIndexes.filter((index) => lines[index]?.text) ?? []);
  // Ohne Fleischzutat gibt es nichts zu ersetzen; dann bleibt das Rezept, wie es ist.
  const vegetarian = suggestion && meatLines.size > 0 ? suggestion : null;
  const meatSteps = new Set(vegetarian?.meatStepIndexes.filter((index) => stepTexts[index]) ?? []);
  const meatOptionId = vegetarian ? createId() : '';
  const vegetarianOptionId = vegetarian ? createId() : '';

  const ingredient = (text: string): IngredientDraft => ({ id: createId(), kind: 'ingredient', text });

  const ingredients: IngredientDraft[] = [];
  let section = '';
  lines.forEach((line, index) => {
    if (!line.text || meatLines.has(index)) return;
    if (line.section !== section) {
      section = line.section;
      if (section) ingredients.push({ id: createId(), kind: 'heading', text: section });
    }
    ingredients.push(ingredient(line.text));
  });

  const groups: ChoiceGroupDraft[] = vegetarian
    ? [
        {
          id: createId(),
          name: vegetarian.groupName.trim() || 'Protein',
          options: [
            {
              id: meatOptionId,
              name: vegetarian.meatOptionName.trim() || 'Mit Fleisch',
              ingredients: lines.filter((_, index) => meatLines.has(index)).map((line) => ingredient(line.text)),
            },
            {
              id: vegetarianOptionId,
              name: vegetarian.vegetarianOptionName.trim() || 'Vegetarisch',
              ingredients: texts(vegetarian.ingredients).map(ingredient),
            },
          ],
        },
      ]
    : [];

  const steps: StepDraft[] = [];
  let afterLastMeatStep = -1;
  stepTexts.forEach((text, index) => {
    if (!text) return;
    const forMeat = meatSteps.has(index);
    steps.push({ id: createId(), text, optionId: forMeat ? meatOptionId : '' });
    if (forMeat) afterLastMeatStep = steps.length;
  });
  if (vegetarian) {
    const vegetarianSteps = texts(vegetarian.steps).map((text) => ({ id: createId(), text, optionId: vegetarianOptionId }));
    steps.splice(afterLastMeatStep >= 0 ? afterLastMeatStep : steps.length, 0, ...vegetarianSteps);
  }

  return {
    ...emptyRecipeDraft(),
    title: recipe.title.trim(),
    description: recipe.description.trim(),
    servings: wholeNumber(recipe.servings, MAX_SERVINGS) ?? DEFAULT_SERVINGS,
    prepMinutes: wholeNumber(recipe.prepMinutes, MAX_MINUTES),
    cookMinutes: wholeNumber(recipe.cookMinutes, MAX_MINUTES),
    source: recipe.source.trim(),
    notes: recipe.notes.trim(),
    meals: recipe.meals ?? [],
    mealsBy: recipe.meals ? 'ai' : '',
    ingredients,
    groups,
    steps,
  };
}
