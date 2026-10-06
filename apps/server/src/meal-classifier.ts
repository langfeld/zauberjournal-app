import { MEAL_IDS, type MealId, type MealRequestItem, type MealResult } from '@zauberjournal/core';

import { aiUnreachable, askJson, requireAi, type AiConfig } from './ai.ts';

/** Höchstens so viele Rezepte je Anfrage */
const MAX_RECIPES = 60;
const MAX_TEXT_LENGTH = 300;
const MAX_INGREDIENTS = 60;
const MAX_NAME_LENGTH = 100;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Prüft den Body von `POST /api/recipes/meals`; `null`, wenn etwas fehlt oder nicht passt. */
export function readMealsRequest(body: Record<string, unknown>): MealRequestItem[] | null {
  if (!Array.isArray(body.recipes) || body.recipes.length === 0 || body.recipes.length > MAX_RECIPES) return null;
  const recipes: MealRequestItem[] = [];
  for (const recipe of body.recipes as unknown[]) {
    if (!isObject(recipe)) return null;
    const { id, title, description, ingredients } = recipe;
    if (typeof id !== 'string' || !id || typeof title !== 'string' || !title.trim()) return null;
    const names = Array.isArray(ingredients) ? ingredients.filter((name): name is string => typeof name === 'string' && name.trim() !== '') : [];
    recipes.push({
      id,
      title: title.trim().slice(0, MAX_TEXT_LENGTH),
      description: typeof description === 'string' ? description.trim().slice(0, MAX_TEXT_LENGTH) : '',
      ingredients: names.slice(0, MAX_INGREDIENTS).map((name) => name.trim().slice(0, MAX_NAME_LENGTH)),
    });
  }
  return recipes;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recipes'],
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['number', 'meals'],
        properties: {
          number: { type: 'integer' },
          meals: { type: 'array', items: { type: 'string', enum: MEAL_IDS } },
        },
      },
    },
  },
};

const SYSTEM = [
  'Du ordnest Rezepte einer deutschen Koch-App den Mahlzeiten zu, zu denen ein Haushalt sie essen würde.',
  'Antworte ausschließlich mit JSON nach dem vorgegebenen Schema.',
].join(' ');

const TASK = `Unten stehen Rezepte mit Nummer, Titel, Beschreibung und Zutaten. Zu welchen Mahlzeiten passt jedes?
- "breakfast": Frühstück, z. B. Müsli, Porridge, Pancakes, Rührei oder Brötchen.
- "lunch" und "dinner": Mittag- und Abendessen. Hauptgerichte passen meist zu beiden, auch Suppen und Salate als Hauptgericht.
- "snack": für zwischendurch, auch Kuchen, Gebäck und Desserts.
Ein Rezept kann zu mehreren Mahlzeiten passen. Beilagen, Saucen, Dips, Getränke und Grundrezepte wie Teig, Brühe oder Pesto sind kein eigenes Gericht: leere Liste.
Antworte für jedes Rezept mit seiner Nummer.`;

/** Nimmt je Rezept die erste Antwort mit gültiger Nummer; Unbekanntes fällt weg. */
function readResults(data: unknown, recipes: readonly MealRequestItem[]): MealResult[] {
  const items = isObject(data) && Array.isArray(data.recipes) ? data.recipes : [];
  const results = new Map<string, MealId[]>();
  for (const item of items.filter(isObject)) {
    const recipe = Number.isInteger(item.number) ? recipes[(item.number as number) - 1] : undefined;
    if (!recipe || results.has(recipe.id)) continue;
    const meals = Array.isArray(item.meals) ? item.meals : [];
    results.set(recipe.id, MEAL_IDS.filter((id) => meals.includes(id)));
  }
  return [...results].map(([id, meals]) => ({ id, meals }));
}

export type MealClassifierConfig = { ai: AiConfig; fetch?: typeof fetch; log?: (message: string) => void };

/** Schätzt mit der KI, zu welchen Mahlzeiten Rezepte passen; die App übernimmt das nur, wo noch niemand etwas festgelegt hat. */
export function createMealClassifier({ ai, fetch: fetchImpl = fetch, log = console.warn }: MealClassifierConfig) {
  return {
    async classify(recipes: readonly MealRequestItem[]): Promise<MealResult[]> {
      requireAi(ai);
      const list = recipes.map((recipe, index) =>
        [
          `${index + 1}: ${recipe.title}`,
          recipe.description ? `   ${recipe.description}` : '',
          recipe.ingredients.length > 0 ? `   Zutaten: ${recipe.ingredients.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      const answer = await askJson(
        ai,
        { task: 'Mahlzeiten', name: 'mahlzeiten', system: SYSTEM, prompt: `${TASK}\n\n${list.join('\n')}`, schema: SCHEMA },
        fetchImpl,
        log,
      );
      if (answer === undefined) throw aiUnreachable();
      return readResults(answer, recipes);
    },
  };
}

export type MealClassifier = ReturnType<typeof createMealClassifier>;
