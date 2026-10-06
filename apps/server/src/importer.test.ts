import { describe, expect, it } from 'vitest';

import { createImporter, ImportError, readImportRequest, toImportedRecipe, type ImportRequest } from './importer.ts';

type Call = { url: string; body: { model: string; messages: { role: string; content: unknown }[]; response_format: unknown } };

/** Ersetzt `fetch`: Seitenabrufe und Anfragen an Requesty landen in `respond` und werden mitgeschrieben. */
function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function modelAnswer(recipe: unknown): Response {
  return Response.json({ choices: [{ message: { content: JSON.stringify(recipe) } }] });
}

const curry = {
  title: 'Hähnchen-Curry',
  description: '',
  servings: 4,
  prepMinutes: 15,
  cookMinutes: 0,
  source: 'Kochbuch S. 42',
  ingredients: [
    { section: '', text: '400 g Hähnchenbrust' },
    { section: '', text: '400 ml Kokosmilch' },
  ],
  steps: ['Hähnchen anbraten.', 'Kokosmilch zugeben.'],
  notes: '',
  meals: ['lunch', 'dinner'],
  uncertainties: ['Kochzeit fehlt in der Vorlage'],
  vegetarian: {
    needed: true,
    groupName: 'Protein',
    meatOptionName: 'Hähnchen',
    vegetarianOptionName: 'Kichererbsen',
    meatIngredientIndexes: [0],
    meatStepIndexes: [0],
    ingredients: ['1 Dose Kichererbsen'],
    steps: ['Kichererbsen anrösten.'],
  },
};

const recipePage = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Linsensuppe',
  recipeYield: '2',
  recipeIngredient: ['200 g rote Linsen'],
  recipeInstructions: 'Linsen kochen.',
})}</script></head><body>Linsensuppe</body></html>`;

function request(overrides: Partial<ImportRequest>): ImportRequest {
  return { images: [], text: '', url: '', suggestVegetarian: true, ...overrides };
}

describe('KI-Import', () => {
  it('schickt Fotos mit JSON-Schema an das Modell und übernimmt die Antwort', async () => {
    const { fetchImpl, calls } = fakeFetch(() => modelAnswer(curry));
    const importer = createImporter({ apiKey: 'schluessel', models: ['modell-a'], fetch: fetchImpl, log: () => {} });

    const recipe = await importer.importRecipe(request({ images: [{ data: 'QUJD', mimeType: 'image/jpeg' }] }));

    expect(recipe).toMatchObject({ title: 'Hähnchen-Curry', servings: 4, prepMinutes: 15, cookMinutes: null, source: 'Kochbuch S. 42' });
    expect(recipe.vegetarian).toMatchObject({ vegetarianOptionName: 'Kichererbsen', meatIngredientIndexes: [0] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://router.requesty.ai/v1/chat/completions');
    expect(calls[0]!.body.model).toBe('modell-a');
    expect(calls[0]!.body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    const content = JSON.stringify(calls[0]!.body.messages[1]!.content);
    expect(content).toContain('data:image/jpeg;base64,QUJD');
    expect(content).toContain('vegetarische Option vor');
  });

  it('nimmt das Ersatzmodell, wenn das erste ausfällt', async () => {
    const { fetchImpl, calls } = fakeFetch((call) =>
      call.body.model === 'modell-a' ? new Response('Überlastet', { status: 529 }) : modelAnswer(curry),
    );
    const log: string[] = [];
    const importer = createImporter({
      apiKey: 'schluessel',
      models: ['modell-a', 'modell-b'],
      fetch: fetchImpl,
      log: (message) => log.push(message),
    });

    const recipe = await importer.importRecipe(request({ text: 'Curry mit Hähnchen …' }));

    expect(recipe.title).toBe('Hähnchen-Curry');
    expect(calls.map((call) => call.body.model)).toEqual(['modell-a', 'modell-b']);
    expect(log[0]).toContain('modell-a');
  });

  it('fragt das Ersatzmodell, wenn das erste kein Rezept erkennt, und packt verschachtelte Antworten aus', async () => {
    const { fetchImpl, calls } = fakeFetch((call) =>
      call.body.model === 'modell-a' ? modelAnswer({ ...curry, ingredients: [], steps: [] }) : modelAnswer({ rezept: curry }),
    );
    const log: string[] = [];
    const importer = createImporter({
      apiKey: 'schluessel',
      models: ['modell-a', 'modell-b'],
      fetch: fetchImpl,
      log: (message) => log.push(message),
    });

    const recipe = await importer.importRecipe(request({ text: 'Curry mit Hähnchen …' }));

    expect(recipe.title).toBe('Hähnchen-Curry');
    expect(calls.map((call) => call.body.model)).toEqual(['modell-a', 'modell-b']);
    expect(log[0]).toContain('modell-a: kein Rezept erkannt');
  });

  it('meldet einen Fehler, wenn alle Modelle ausfallen oder kein Rezept erkennen', async () => {
    const failing = createImporter({
      apiKey: 'schluessel',
      models: ['modell-a'],
      fetch: fakeFetch(() => Response.json({ choices: [{ message: { content: 'kein JSON' } }] })).fetchImpl,
      log: () => {},
    });
    await expect(failing.importRecipe(request({ text: 'Rezept' }))).rejects.toMatchObject({ status: 502 });

    const empty = createImporter({
      apiKey: 'schluessel',
      models: ['modell-a'],
      fetch: fakeFetch(() => modelAnswer({ ...curry, ingredients: [], steps: [''] })).fetchImpl,
      log: () => {},
    });
    await expect(empty.importRecipe(request({ text: 'Einkaufszettel' }))).rejects.toMatchObject({ status: 422 });
  });

  it('liest Links mit Rezeptdaten auch ohne Schlüssel', async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response(recipePage));
    const importer = createImporter({ apiKey: '', models: [], fetch: fetchImpl, log: () => {} });

    const recipe = await importer.importRecipe(request({ url: 'https://example.org/linsensuppe' }));

    expect(recipe).toMatchObject({ title: 'Linsensuppe', servings: 2, source: 'https://example.org/linsensuppe' });
    expect(calls.map((call) => call.url)).toEqual(['https://example.org/linsensuppe']);
  });

  it('erklärt ohne Schlüssel, was fehlt', async () => {
    const importer = createImporter({
      apiKey: '',
      models: [],
      fetch: fakeFetch(() => new Response('<html><body>Nur Text</body></html>')).fetchImpl,
      log: () => {},
    });

    await expect(importer.importRecipe(request({ url: 'https://example.org/blog' }))).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('keine lesbaren Rezeptdaten'),
    });
    await expect(importer.importRecipe(request({ text: 'Rezept' }))).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('REQUESTY_API_KEY'),
    });
  });

  it('schickt den Seitentext an das Modell, wenn die Seite keine Rezeptdaten hat', async () => {
    const { fetchImpl, calls } = fakeFetch((call) =>
      call.url.startsWith('https://example.org')
        ? new Response('<html><body><script>tracking()</script><h1>Omas Curry</h1><p>400 g Hähnchen</p></body></html>')
        : modelAnswer(curry),
    );
    const importer = createImporter({ apiKey: 'schluessel', models: ['modell-a'], fetch: fetchImpl, log: () => {} });

    const recipe = await importer.importRecipe(request({ url: 'https://example.org/blog', suggestVegetarian: false }));

    expect(recipe.source).toBe('https://example.org/blog');
    const content = JSON.stringify(calls[1]!.body.messages[1]!.content);
    expect(content).toContain('Omas Curry\\n400 g Hähnchen');
    expect(content).not.toContain('tracking');
    expect(content).toContain('Kein vegetarischer Vorschlag');
  });

  it('nimmt die Rezeptdaten der Seite, wenn die KI nicht erreichbar ist', async () => {
    const { fetchImpl } = fakeFetch((call) =>
      call.url.startsWith('https://example.org') ? new Response(recipePage) : new Response('Fehler', { status: 500 }),
    );
    const importer = createImporter({ apiKey: 'schluessel', models: ['modell-a'], fetch: fetchImpl, log: () => {} });

    const recipe = await importer.importRecipe(request({ url: 'https://example.org/linsensuppe' }));

    expect(recipe.title).toBe('Linsensuppe');
    expect(recipe.uncertainties[0]).toContain('KI war nicht erreichbar');
  });

  it('meldet Seiten, die sich nicht laden lassen', async () => {
    const importer = createImporter({
      apiKey: '',
      models: [],
      fetch: fakeFetch(() => new Response('Verboten', { status: 403 })).fetchImpl,
      log: () => {},
    });
    await expect(importer.importRecipe(request({ url: 'https://example.org/x' }))).rejects.toMatchObject({ status: 502 });
  });
});

describe('toImportedRecipe', () => {
  it('macht aus unvollständigen Antworten leere Werte und behält die Positionen', () => {
    const recipe = toImportedRecipe({
      title: '  Suppe ',
      servings: '4',
      prepMinutes: -3,
      ingredients: ['1 Zwiebel', { section: 'Einlage', text: '' }, 42],
      steps: ['Kochen.', null],
      meals: ['dinner', 'Frühstück', 'lunch'],
      vegetarian: { needed: false, groupName: 'Protein' },
    });
    expect(recipe).toMatchObject({ title: 'Suppe', servings: 4, prepMinutes: null, cookMinutes: null, vegetarian: null });
    // Mahlzeiten in der Reihenfolge des Tages, Unbekanntes fällt weg; ganz ohne Angabe bleiben sie offen.
    expect(recipe.meals).toEqual(['lunch', 'dinner']);
    expect(toImportedRecipe({ title: 'Suppe' }).meals).toBeNull();
    expect(recipe.ingredients).toEqual([
      { section: '', text: '1 Zwiebel' },
      { section: 'Einlage', text: '' },
      { section: '', text: '' },
    ]);
    expect(recipe.steps).toEqual(['Kochen.', '']);
    expect(toImportedRecipe('kein Objekt')).toMatchObject({ title: '', ingredients: [], steps: [] });
  });
});

describe('readImportRequest', () => {
  it('prüft Bilder, Link und Text', () => {
    const image = { data: 'QUJD', mimeType: 'image/jpeg' };
    expect(readImportRequest({ images: [image], suggestVegetarian: true })).toEqual({
      images: [image],
      text: '',
      url: '',
      suggestVegetarian: true,
    });
    expect(readImportRequest({ text: '  Rezept  ' }).text).toBe('Rezept');

    const invalid = [
      {},
      { images: [image, image, image, image, image] },
      { images: [{ data: 'QUJD', mimeType: 'image/gif' }] },
      { url: 'ftp://example.org' },
      { url: 'javascript:alert(1)' },
    ];
    for (const body of invalid) expect(() => readImportRequest(body)).toThrow(ImportError);
  });
});
