import { describe, expect, it } from 'vitest';

import { openDatabase } from './database.ts';
import { createNutrition, parseOffProduct, readLookupRequest, searchBls } from './nutrition.ts';

const names = (query: string, limit = 12) => searchBls(query, limit).map(({ food }) => food.name);
const code = (name: string) => searchBls(name, 50).find(({ food }) => food.name === name)!.food.code;

/** Antwort von Open Food Facts, gekürzt (Werte wie bei „REWE Beste Wahl Kokosmilch fettreduziert“). */
const COCONUT_MILK = {
  code: '4337256836975',
  product: {
    product_name: 'Kokosmilch fettreduziert',
    brands: 'Beste Wahl, REWE',
    nutriments: {
      'energy-kcal_100g': 123,
      fat_100g: 12,
      'saturated-fat_100g': 11,
      carbohydrates_100g: 2.5,
      sugars_100g: 1,
      fiber_100g: 0.9,
      proteins_100g: 0.9,
      salt_100g: 0.04,
    },
  },
};

/** Ein Produkt ohne gesättigte Fettsäuren, wie manche bei Open Food Facts. */
function partial(name: string) {
  const nutriments = { 'energy-kcal_100g': 120, fat_100g: 5, carbohydrates_100g: 10, sugars_100g: 4, proteins_100g: 4, salt_100g: 2 };
  return { product: { product_name: name, nutriments } };
}

/** Was Open Food Facts kennt, nach EAN. */
const OFF_PRODUCTS: Record<string, unknown> = {
  '4337256836975': COCONUT_MILK,
  '4337256988407': partial('Kokosmilch'),
  '8858826302196': partial('Rote Currypaste'),
};

type Call = { url: string; body: string };

/** Open Food Facts kennt nur `OFF_PRODUCTS`; die KI antwortet der Reihe nach mit `answers`. */
function setUp(answers: unknown[] = [], ai = true) {
  const calls: Call[] = [];
  const nutrition = createNutrition({
    db: openDatabase(':memory:'),
    ai: ai ? { apiKey: 'test', models: ['test/model'], baseUrl: 'https://ki.example' } : undefined,
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({ url, body: String(init?.body ?? '') });
      if (url.startsWith('https://world.openfoodfacts.org/')) {
        const ean = /\/(\d+)\.json/.exec(url)?.[1] ?? '';
        return ean in OFF_PRODUCTS ? Response.json(OFF_PRODUCTS[ean]) : new Response('{}', { status: 404 });
      }
      const answer = answers.shift();
      if (answer === undefined) return new Response('kaputt', { status: 500 });
      return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }] });
    },
    pauseMs: 0,
    log: () => {},
  });
  return { nutrition, calls };
}

describe('Nährwerte', () => {
  it('findet BLS-Kandidaten auch für Mehrzahl, zusammengesetzte Wörter und mehrere Lebensmittel', () => {
    expect(names('Zwiebeln', 6)).toContain('Speisezwiebel roh');
    expect(names('Basmatireis', 6)).toContain('Reis poliert, roh');
    expect(names('Cherrytomaten', 3)).toContain('Tomate roh');
    expect(names('rote Linsen')[0]).toBe('Linse rot reif');
    expect(names('Zucker', 6)).toContain('Zucker weiß (Raffinadezucker/Weißzucker)');
    expect(names('Romanasalat')[0]).toBe('Römischer Salat/Romanasalat, roh');
    // Roh vor zubereitet
    expect(names('Knoblauch')[0]).toBe('Knoblauch roh');
    expect(names('Erdnusskerne')).toContain('Erdnuss geröstet');
    // Kurze Kernwörter, und „Lachs in Öl“ ist kein Öl
    expect(names('Öl')).toContain('Olivenöl');
    expect(names('Öl').some((name) => name.includes('in Öl'))).toBe(false);
    expect(names('Ei')).toContain('Hühnerei roh');
    expect(names('Salz und Pfeffer')).toEqual(expect.arrayContaining(['Pfeffer schwarz, getrocknet', 'Speisesalz jodiert/Jodsalz']));
    expect(names('Butter', 2)).toEqual(['Butter gesalzen', 'Butter mild gesäuert']);
    expect(names('und')).toEqual([]);
  });

  it('liest Nährwerte von Open Food Facts', () => {
    expect(parseOffProduct(COCONUT_MILK)).toEqual({
      label: 'Kokosmilch fettreduziert (Beste Wahl)',
      per100: { kcal: 123, fat: 12, saturatedFat: 11, carbs: 2.5, sugar: 1, fiber: 0.9, protein: 0.9, salt: 0 },
    });
    // Ohne Energie, Fett, Kohlenhydrate oder Eiweiß taugt ein Produkt nicht; dann gilt der BLS.
    expect(parseOffProduct({ product: { nutriments: { fat_100g: 1, proteins_100g: 2, carbohydrates_100g: 3 } } })).toBeNull();
    expect(parseOffProduct({ product: { nutriments: { 'energy-kcal_100g': 100, fat_100g: 1, carbohydrates_100g: 3 } } })).toBeNull();
    expect(parseOffProduct({ status: 0 })).toBeNull();
    // Fehlt nur ein Nebenwert, bleibt er unbekannt statt 0; Energie in kJ wird umgerechnet.
    const partial = parseOffProduct({ product: { nutriments: { energy_100g: 836.8, fat_100g: 1, carbohydrates_100g: 3, proteins_100g: 2 } } });
    expect(partial?.per100).toEqual({ kcal: 200, fat: 1, saturatedFat: null, carbs: 3, sugar: null, fiber: null, protein: 2, salt: null });
    expect(partial?.label).toBe('Produkt');
  });

  it('nimmt für REWE-Produkte Open Food Facts, sonst den BLS-Eintrag der KI, und schätzt Stückgewichte', async () => {
    const onion = code('Speisezwiebel roh');
    const { nutrition, calls } = setUp([
      {
        items: [
          { id: 'food:zwiebel', code: onion, search: null, gramsPerPiece: 80 },
          { id: 'food:kokosmilch', code: null, search: null, gramsPerPiece: 400 },
        ],
      },
    ]);
    const results = await nutrition.lookup([
      { id: 'food:kokosmilch', name: 'Kokosmilch', ean: '4337256836975', pieceUnit: 'Dose' },
      { id: 'food:zwiebel', name: 'Zwiebeln', ean: '2000000000000', pieceUnit: 'Stück' },
    ]);
    expect(results).toEqual([
      {
        id: 'food:kokosmilch',
        source: 'off',
        code: '4337256836975',
        label: 'Kokosmilch fettreduziert (Beste Wahl)',
        per100: expect.objectContaining({ kcal: 123, fat: 12 }),
        gramsPerPiece: 400,
        ean: '4337256836975',
      },
      expect.objectContaining({ id: 'food:zwiebel', source: 'bls', code: onion, label: 'Speisezwiebel roh', gramsPerPiece: 80, ean: '2000000000000' }),
    ]);
    // Die KI sieht für jede Zutat Kandidaten aus dem BLS.
    const prompt = JSON.parse(calls.find((call) => call.url.startsWith('https://ki.example'))!.body).messages[1].content as string;
    expect(prompt).toContain(`- ${onion}: Speisezwiebel roh`);
    expect(prompt).toContain('„Zwiebeln“ (Stück-Einheit: Stück)');

    // Open Food Facts kommt aus dem Zwischenspeicher, auch „nicht gefunden“.
    const before = calls.filter((call) => call.url.includes('openfoodfacts')).length;
    await nutrition.lookup([
      { id: 'food:kokosmilch', name: 'Kokosmilch', ean: '4337256836975', pieceUnit: '' },
      { id: 'food:zwiebel', name: 'Zwiebeln', ean: '2000000000000', pieceUnit: '' },
    ]);
    expect(calls.filter((call) => call.url.includes('openfoodfacts')).length).toBe(before);
  });

  it('nimmt den BLS, wenn bei Open Food Facts Pflichtangaben fehlen, ohne passenden Eintrag aber die Werte des Produkts', async () => {
    const coconut = code('Kokosmilch/Kokosnussmilch');
    const { nutrition } = setUp([
      {
        items: [
          { id: 'food:kokosmilch', code: coconut, search: null, gramsPerPiece: null },
          { id: 'food:currypaste', code: null, search: null, gramsPerPiece: null },
        ],
      },
    ]);
    const [milk, paste] = await nutrition.lookup([
      { id: 'food:kokosmilch', name: 'Kokosmilch', ean: '4337256988407', pieceUnit: '' },
      { id: 'food:currypaste', name: 'rote Currypaste', ean: '8858826302196', pieceUnit: '' },
    ]);
    expect(milk).toMatchObject({ source: 'bls', code: coconut, ean: '4337256988407' });
    expect(milk?.per100?.saturatedFat).toBeGreaterThan(15);
    expect(paste).toMatchObject({ source: 'off', label: 'Rote Currypaste', per100: expect.objectContaining({ kcal: 120, saturatedFat: null }) });
  });

  it('lässt die KI mit einem besseren Suchbegriff ein zweites Mal wählen', async () => {
    const egg = code('Hühnerei roh');
    const { nutrition, calls } = setUp([
      { items: [{ id: 'food:eier', code: null, search: 'Hühnerei roh', gramsPerPiece: 60 }] },
      { items: [{ id: 'food:eier', code: egg, search: null, gramsPerPiece: null }] },
    ]);
    const [result] = await nutrition.lookup([{ id: 'food:eier', name: 'Eier', ean: '', pieceUnit: 'Stück' }]);
    expect(result).toMatchObject({ source: 'bls', code: egg, label: 'Hühnerei roh', gramsPerPiece: 60 });
    expect(calls.filter((call) => call.url.startsWith('https://ki.example'))).toHaveLength(2);
  });

  it('hilft sich ohne KI mit sicheren Treffern und merkt sich Ausfälle nicht', async () => {
    const offline = setUp([], false);
    const results = await offline.nutrition.lookup([
      { id: 'food:knoblauch', name: 'Knoblauch', ean: '', pieceUnit: 'Zehe' },
      { id: 'food:veganhack', name: 'Krümeliges Veganhack', ean: '', pieceUnit: '' },
    ]);
    expect(results.map(({ source, label, temporary }) => [source, label, temporary ?? false])).toEqual([
      ['bls', 'Knoblauch roh', false],
      ['none', '', false],
    ]);

    // Die KI fällt aus: Sichere Treffer gelten, der Rest ist nur vorläufig nicht gefunden.
    const broken = setUp([]);
    const [garlic, mince] = await broken.nutrition.lookup([
      { id: 'food:knoblauch', name: 'Knoblauch', ean: '', pieceUnit: '' },
      { id: 'food:veganhack', name: 'Krümeliges Veganhack', ean: '', pieceUnit: '' },
    ]);
    expect(garlic).toMatchObject({ source: 'bls', label: 'Knoblauch roh' });
    expect(mince).toMatchObject({ source: 'none', temporary: true });
  });

  it('prüft die Anfrage der App', () => {
    expect(readLookupRequest({ foods: [{ id: 'food:a', name: ' Reis ', ean: 'abc', pieceUnit: 'Stück' }] })).toEqual([
      { id: 'food:a', name: 'Reis', ean: '', pieceUnit: 'Stück' },
    ]);
    expect(readLookupRequest({ foods: [] })).toBeNull();
    expect(readLookupRequest({ foods: [{ id: '', name: 'Reis' }] })).toBeNull();
    expect(readLookupRequest({})).toBeNull();
  });
});
