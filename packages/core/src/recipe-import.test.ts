import { describe, expect, it } from 'vitest';

import { importedRecipeToDraft, type ImportedRecipe } from './recipe-import.ts';
import { validateRecipeDraft } from './recipe.ts';

function counterIds() {
  let next = 0;
  return () => `id${++next}`;
}

function imported(overrides: Partial<ImportedRecipe> = {}): ImportedRecipe {
  return {
    title: 'Hähnchen-Curry',
    description: '',
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 25,
    source: 'Kochbuch S. 42',
    ingredients: [
      { section: '', text: '400 g Hähnchenbrust' },
      { section: '', text: '1 Zwiebel, gewürfelt' },
      { section: 'Für die Soße', text: '400 ml Kokosmilch' },
      { section: 'Für die Soße', text: '2 EL Currypaste' },
      { section: 'Für die Soße', text: '  ' },
    ],
    steps: ['Zwiebel anschwitzen.', 'Hähnchen würfeln und anbraten.', 'Mit Kokosmilch ablöschen.', ''],
    notes: 'Dazu passt Reis.',
    meals: ['lunch', 'dinner'],
    uncertainties: [],
    vegetarian: null,
    ...overrides,
  };
}

describe('importedRecipeToDraft', () => {
  it('übernimmt Zutaten mit Zwischenüberschriften und Schritte', () => {
    const draft = importedRecipeToDraft(imported(), counterIds());

    expect(draft.ingredients.map((item) => [item.kind, item.text])).toEqual([
      ['ingredient', '400 g Hähnchenbrust'],
      ['ingredient', '1 Zwiebel, gewürfelt'],
      ['heading', 'Für die Soße'],
      ['ingredient', '400 ml Kokosmilch'],
      ['ingredient', '2 EL Currypaste'],
    ]);
    expect(draft.steps.map((step) => [step.text, step.optionId])).toEqual([
      ['Zwiebel anschwitzen.', ''],
      ['Hähnchen würfeln und anbraten.', ''],
      ['Mit Kokosmilch ablöschen.', ''],
    ]);
    expect(draft.groups).toEqual([]);
    expect(draft).toMatchObject({ title: 'Hähnchen-Curry', servings: 4, prepMinutes: 15, cookMinutes: 25, source: 'Kochbuch S. 42', notes: 'Dazu passt Reis.', photo: '' });
    // Die Mahlzeiten hat die KI geschätzt; ohne KI bleiben sie offen.
    expect(draft).toMatchObject({ meals: ['lunch', 'dinner'], mealsBy: 'ai' });
    expect(importedRecipeToDraft(imported({ meals: null }), counterIds())).toMatchObject({ meals: [], mealsBy: '' });
    expect(validateRecipeDraft(draft)).toEqual([]);
  });

  it('setzt fehlende oder unsinnige Portionen und Zeiten auf Standardwerte', () => {
    expect(importedRecipeToDraft(imported({ servings: null, prepMinutes: 0, cookMinutes: -5 }), counterIds())).toMatchObject({
      servings: 2,
      prepMinutes: null,
      cookMinutes: null,
    });
    expect(importedRecipeToDraft(imported({ servings: 3.6, prepMinutes: 12.4 }), counterIds())).toMatchObject({
      servings: 4,
      prepMinutes: 12,
    });
  });

  it('macht aus dem vegetarischen Vorschlag eine Wahlkomponente', () => {
    const draft = importedRecipeToDraft(
      imported({
        vegetarian: {
          groupName: 'Protein',
          meatOptionName: 'Hähnchen',
          vegetarianOptionName: 'Kichererbsen',
          meatIngredientIndexes: [0, 0, 17, -1],
          meatStepIndexes: [1, 3],
          ingredients: ['1 Dose Kichererbsen (400 g)', ' '],
          steps: ['Kichererbsen abgießen und rösten.', 'Für die gemischte Pfanne zuerst die Kichererbsen braten.'],
        },
      }),
      counterIds(),
    );

    expect(draft.ingredients.map((item) => item.text)).toEqual([
      '1 Zwiebel, gewürfelt',
      'Für die Soße',
      '400 ml Kokosmilch',
      '2 EL Currypaste',
    ]);
    expect(draft.groups).toHaveLength(1);
    const [meat, vegetarian] = draft.groups[0]!.options;
    expect(draft.groups[0]!.name).toBe('Protein');
    expect([meat!.name, meat!.ingredients.map((item) => item.text)]).toEqual(['Hähnchen', ['400 g Hähnchenbrust']]);
    expect([vegetarian!.name, vegetarian!.ingredients.map((item) => item.text)]).toEqual([
      'Kichererbsen',
      ['1 Dose Kichererbsen (400 g)'],
    ]);

    const optionOf = (id: string) => (id === meat!.id ? 'Hähnchen' : id === vegetarian!.id ? 'Kichererbsen' : 'alle');
    expect(draft.steps.map((step) => [step.text, optionOf(step.optionId)])).toEqual([
      ['Zwiebel anschwitzen.', 'alle'],
      ['Hähnchen würfeln und anbraten.', 'Hähnchen'],
      ['Kichererbsen abgießen und rösten.', 'Kichererbsen'],
      ['Für die gemischte Pfanne zuerst die Kichererbsen braten.', 'Kichererbsen'],
      ['Mit Kokosmilch ablöschen.', 'alle'],
    ]);
    expect(validateRecipeDraft(draft)).toEqual([]);
  });

  it('hängt vegetarische Schritte ans Ende, wenn kein Schritt nur für Fleisch gilt', () => {
    const draft = importedRecipeToDraft(
      imported({
        vegetarian: {
          groupName: '',
          meatOptionName: '',
          vegetarianOptionName: '',
          meatIngredientIndexes: [0],
          meatStepIndexes: [],
          ingredients: ['200 g Tofu'],
          steps: ['Tofu separat anbraten.'],
        },
      }),
      counterIds(),
    );

    expect(draft.groups[0]!.name).toBe('Protein');
    expect(draft.groups[0]!.options.map((option) => option.name)).toEqual(['Mit Fleisch', 'Vegetarisch']);
    expect(draft.steps.at(-1)?.text).toBe('Tofu separat anbraten.');
  });

  it('ignoriert einen Vorschlag ohne gültige Fleischzutat', () => {
    const draft = importedRecipeToDraft(
      imported({
        vegetarian: {
          groupName: 'Protein',
          meatOptionName: 'Hähnchen',
          vegetarianOptionName: 'Tofu',
          meatIngredientIndexes: [4, 9],
          meatStepIndexes: [1],
          ingredients: ['200 g Tofu'],
          steps: ['Tofu anbraten.'],
        },
      }),
      counterIds(),
    );

    expect(draft.groups).toEqual([]);
    expect(draft.ingredients).toHaveLength(5);
    expect(draft.steps.every((step) => step.optionId === '')).toBe(true);
  });
});
