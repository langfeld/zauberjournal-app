import { describe, expect, it } from 'vitest';

import { createFoodDuplicates, DuplicatesError, readDuplicatesRequest, type DuplicateFood } from './food-duplicates.ts';

const FOODS: DuplicateFood[] = [
  { id: 'food:tortilla-chips', name: 'Tortilla-Chips', category: 'sweets' },
  { id: 'food:tortillas chips', name: 'Tortillas Chips', category: 'sweets' },
  { id: 'food:tortillaschips', name: 'Tortillaschips', category: 'sweets' },
  { id: 'food:tortillas', name: 'Tortillas', category: 'bakery' },
  { id: 'food:hähnchenbrust', name: 'Hähnchenbrust', category: 'meat' },
  { id: 'food:hähnchenbrustfilet', name: 'Hähnchenbrustfilet', category: 'meat' },
];

/** Die KI antwortet der Reihe nach mit `answers`; `undefined` = Ausfall. */
function setUp(answers: unknown[], models = ['test/model']) {
  const bodies: string[] = [];
  const duplicates = createFoodDuplicates({
    ai: { apiKey: 'test', models, baseUrl: 'https://ki.example' },
    fetch: async (_input, init) => {
      bodies.push(String(init?.body ?? ''));
      const answer = answers.shift();
      if (answer === undefined) return new Response('kaputt', { status: 500 });
      return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
    },
    log: () => {},
  });
  return { duplicates, bodies };
}

describe('Doppelte Lebensmittel', () => {
  it('prüft die Anfrage der App', () => {
    expect(readDuplicatesRequest({ foods: FOODS })).toEqual(FOODS);
    expect(readDuplicatesRequest({ foods: [{ id: 'food:a', name: ' Zwiebel ' }] })).toEqual([{ id: 'food:a', name: 'Zwiebel', category: '' }]);
    expect(readDuplicatesRequest({ foods: [{ id: 'food:a', name: '' }] })).toBeNull();
    expect(readDuplicatesRequest({ foods: [{ name: 'Zwiebel' }] })).toBeNull();
    expect(readDuplicatesRequest({})).toBeNull();
  });

  it('nimmt nur Gruppen aus bekannten Lebensmitteln, jedes höchstens einmal', async () => {
    const answer = {
      groups: [
        { keep: 1, same: [2, 3, 3], reason: 'andere Schreibweise' },
        // Schon vergeben, nur ein Name, unbekannte Nummer
        { keep: 3, same: [4], reason: 'Tortillas' },
        { keep: 5, same: [], reason: 'allein' },
        { keep: 5, same: [99], reason: 'unbekannt' },
        { keep: 6, same: [5], reason: 'Filet ist dasselbe' },
      ],
    };
    // Das erste Modell fällt aus, das zweite antwortet.
    const { duplicates, bodies } = setUp([undefined, answer], ['test/a', 'test/b']);
    expect(await duplicates.find(FOODS)).toEqual([
      { keepId: 'food:tortilla-chips', foodIds: ['food:tortilla-chips', 'food:tortillas chips', 'food:tortillaschips'], reason: 'andere Schreibweise' },
      { keepId: 'food:hähnchenbrustfilet', foodIds: ['food:hähnchenbrustfilet', 'food:hähnchenbrust'], reason: 'Filet ist dasselbe' },
    ]);
    expect(bodies).toHaveLength(2);
    const prompt = (JSON.parse(bodies[1]!) as { messages: { content: string }[] }).messages[1]!.content;
    expect(prompt).toContain('1: Tortilla-Chips (Süßes & Aufstriche)');
    expect(prompt).toContain('4: Tortillas (Brot & Backwaren)');
  });

  it('meldet, wenn die KI fehlt oder ausfällt', async () => {
    const withoutKey = createFoodDuplicates({ ai: { apiKey: '', models: [], baseUrl: '' }, log: () => {} });
    await expect(withoutKey.find(FOODS)).rejects.toMatchObject({ status: 503 });
    const { duplicates } = setUp([]);
    await expect(duplicates.find(FOODS)).rejects.toBeInstanceOf(DuplicatesError);
    await expect(duplicates.find(FOODS.slice(0, 1))).resolves.toEqual([]);
  });
});
