import { describe, expect, it } from 'vitest';

import { cookingSteps, findTimers, mentionedIngredients, needsSeparatePans, type ScaledIngredient } from './cooking.ts';
import type { IngredientItem, RecipeView } from './recipe.ts';

function item(name: string, amount: number | null = null, unit = ''): IngredientItem {
  return { id: name, kind: 'ingredient', amount, amountMax: null, unit, name, note: '' };
}

const names = (list: ScaledIngredient[]) => list.map(({ item: ingredient }) => ingredient.name);

const BOWL: RecipeView = {
  id: 'bowl',
  title: 'Bowl',
  description: '',
  servings: 2,
  prepMinutes: null,
  cookMinutes: null,
  source: '',
  notes: '',
  photo: '',
  meals: ['dinner'],
  mealsBy: 'person',
  pausedUntil: '',
  ingredients: [item('Reis', 200, 'g'), item('Zwiebel', 1)],
  groups: [
    {
      id: 'protein',
      name: 'Protein',
      options: [
        { id: 'chicken', name: 'Hähnchen', ingredients: [item('Hähnchenbrust', 300, 'g')] },
        { id: 'halloumi', name: 'Halloumi', ingredients: [item('Halloumi', 200, 'g')] },
      ],
    },
  ],
  steps: [
    { id: 's1', text: 'Reis 15 Minuten kochen, Zwiebel würfeln.', optionId: '' },
    { id: 's2', text: 'Hähnchen in Streifen schneiden und braten.', optionId: 'chicken' },
    { id: 's3', text: 'Halloumi in Scheiben braten.', optionId: 'halloumi' },
    { id: 's4', text: 'Alles anrichten.', optionId: '' },
  ],
};

describe('Kochmodus', () => {
  it('findet Zeitangaben für Timer', () => {
    const timers = (text: string) => findTimers(text).map(({ seconds, label }) => [seconds, label]);
    expect(timers('Die Soße 10 Minuten köcheln lassen.')).toEqual([[600, '10 Minuten']]);
    // Bei Spannen die untere Grenze, dann lieber einmal nachsehen
    expect(timers('Im Ofen 10–15 Min. backen')).toEqual([[600, '10–15 Min.']]);
    expect(timers('ca. 20 bis 25 Minuten garen')).toEqual([[1200, '20 bis 25 Minuten']]);
    expect(timers('Den Teig eine halbe Stunde ruhen lassen')).toEqual([[1800, 'eine halbe Stunde']]);
    expect(timers('1 Std. 20 Min. schmoren, dann zwei Minuten ziehen lassen')).toEqual([
      [4800, '1 Std. 20 Min.'],
      [120, 'zwei Minuten'],
    ]);
    expect(timers('1,5 Stunden im Ofen')).toEqual([[5400, '1,5 Stunden']]);
    expect(timers('30 Sekunden mixen')).toEqual([[30, '30 Sekunden']]);
    // Ohne Zahl kein Timer; Minze ist keine Minute, Grad keine Zeit
    expect(timers('Einige Minuten ziehen lassen, mit Minze bestreuen. Bei 200 °C backen.')).toEqual([]);
  });

  it('erkennt, welche Zutaten ein Schritt nennt', () => {
    const candidates = [
      item('Zwiebeln', 2),
      item('Knoblauch', 2, 'Zehe'),
      item('Olivenöl', 2, 'EL'),
      item('Hähnchenbrustfilet', 300, 'g'),
      item('Tomaten', 400, 'g'),
      item('Tomatenmark', 1, 'EL'),
      item('Basmatireis', 200, 'g'),
      item('rote Linsen', 150, 'g'),
    ].map((ingredient) => ({ item: ingredient, factor: 1 }));
    const mentioned = (text: string) => names(mentionedIngredients(text, candidates));
    expect(mentioned('Zwiebel und Knoblauchzehen fein hacken.')).toEqual(['Zwiebeln', 'Knoblauch']);
    expect(mentioned('Öl in einer Pfanne erhitzen, die Hähnchenstreifen darin anbraten.')).toEqual(['Olivenöl', 'Hähnchenbrustfilet']);
    // „Tomatenmark“ ist nicht „Tomaten“, aber beide stehen da
    expect(mentioned('Tomatenmark kurz mitrösten, dann die Tomaten dazugeben.')).toEqual(['Tomaten', 'Tomatenmark']);
    expect(mentioned('Den Reis und die Linsen waschen.')).toEqual(['Basmatireis', 'rote Linsen']);
    expect(mentioned('In die Pfanne geben und abschmecken.')).toEqual([]);
  });

  it('zeigt Schritte und Mengen für die gewählten Optionen', () => {
    // 3 Portionen: zweimal Hähnchen, einmal Halloumi
    const steps = cookingSteps(BOWL, 3, { protein: { chicken: 2, halloumi: 1 } });
    expect(
      steps.map((step) => [
        step.id,
        step.optionName,
        step.servings,
        names(step.ingredients),
        step.ingredients.map(({ factor }) => factor),
        step.timers.map(({ seconds }) => seconds),
      ]),
    ).toEqual([
      ['s1', '', 3, ['Reis', 'Zwiebel'], [1.5, 1.5], [900]],
      ['s2', 'Hähnchen', 2, ['Hähnchenbrust'], [1], []],
      ['s3', 'Halloumi', 1, ['Halloumi'], [0.5], []],
      ['s4', '', 3, [], [], []],
    ]);
    // Bekommt niemand Halloumi, fällt sein Schritt weg.
    expect(cookingSteps(BOWL, 2, { protein: { chicken: 2, halloumi: 0 } }).map((step) => step.id)).toEqual(['s1', 's2', 's4']);
  });

  it('rät zu eigener Pfanne, wenn Fleisch und Vegetarisches zugleich entstehen', () => {
    const dietOf = (name: string) => (name.startsWith('Hähnchen') ? 'meat' : 'vegetarian');
    expect(needsSeparatePans(BOWL, { protein: { chicken: 2, halloumi: 1 } }, dietOf)).toBe(true);
    expect(needsSeparatePans(BOWL, { protein: { chicken: 3, halloumi: 0 } }, dietOf)).toBe(false);
  });
});
