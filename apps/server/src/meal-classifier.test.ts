import type { MealRequestItem } from '@zauberjournal/core';
import { describe, expect, it } from 'vitest';

import { AiError } from './ai.ts';
import { createMealClassifier, readMealsRequest } from './meal-classifier.ts';

const RECIPES: MealRequestItem[] = [
  { id: 'curry', title: 'Gemüsecurry', description: 'Schnell und scharf', ingredients: ['Kokosmilch', 'Brokkoli'] },
  { id: 'porridge', title: 'Porridge', description: '', ingredients: ['Haferflocken', 'Milch'] },
  { id: 'tzatziki', title: 'Tzatziki', description: '', ingredients: ['Joghurt', 'Gurke'] },
];

/** Die KI antwortet der Reihe nach mit `answers`; `undefined` = Ausfall. */
function setUp(answers: unknown[]) {
  const bodies: string[] = [];
  const classifier = createMealClassifier({
    ai: { apiKey: 'test', models: ['test/model'], baseUrl: 'https://ki.example' },
    fetch: async (_input, init) => {
      bodies.push(String(init?.body ?? ''));
      const answer = answers.shift();
      if (answer === undefined) return new Response('kaputt', { status: 500 });
      return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
    },
    log: () => {},
  });
  return { classifier, bodies };
}

describe('Mahlzeiten mit der KI', () => {
  it('prüft die Anfrage der App', () => {
    expect(readMealsRequest({ recipes: RECIPES })).toEqual(RECIPES);
    expect(readMealsRequest({ recipes: [{ id: 'a', title: ' Suppe ', ingredients: ['Linsen', 3, ' '] }] })).toEqual([
      { id: 'a', title: 'Suppe', description: '', ingredients: ['Linsen'] },
    ]);
    expect(readMealsRequest({ recipes: [] })).toBeNull();
    expect(readMealsRequest({ recipes: [{ id: 'a', title: '' }] })).toBeNull();
    expect(readMealsRequest({})).toBeNull();
  });

  it('übernimmt je Rezept die Mahlzeiten aus der Antwort', async () => {
    const { classifier, bodies } = setUp([
      {
        recipes: [
          { number: 1, meals: ['dinner', 'lunch'] },
          { number: 2, meals: ['breakfast', 'Brunch'] },
          { number: 3, meals: [] },
          // Doppelt oder unbekannt
          { number: 1, meals: ['snack'] },
          { number: 9, meals: ['dinner'] },
        ],
      },
    ]);
    expect(await classifier.classify(RECIPES)).toEqual([
      { id: 'curry', meals: ['lunch', 'dinner'] },
      { id: 'porridge', meals: ['breakfast'] },
      { id: 'tzatziki', meals: [] },
    ]);
    const prompt = (JSON.parse(bodies[0]!) as { messages: { content: string }[] }).messages[1]!.content;
    expect(prompt).toContain('1: Gemüsecurry\n   Schnell und scharf\n   Zutaten: Kokosmilch, Brokkoli');
  });

  it('meldet, wenn die KI fehlt oder ausfällt', async () => {
    const withoutKey = createMealClassifier({ ai: { apiKey: '', models: [], baseUrl: '' }, log: () => {} });
    await expect(withoutKey.classify(RECIPES)).rejects.toMatchObject({ status: 503 });
    await expect(setUp([]).classifier.classify(RECIPES)).rejects.toBeInstanceOf(AiError);
  });
});
