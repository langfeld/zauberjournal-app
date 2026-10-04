import { describe, expect, it } from 'vitest';

import { extractJsonLdRecipe, parseIsoDuration } from './json-ld.ts';

function page(...blocks: string[]): string {
  const scripts = blocks.map((block) => `<script type="application/ld+json">${block}</script>`).join('\n');
  return `<!doctype html><html><head><title>Rezept</title>${scripts}</head><body><h1>Rezept</h1></body></html>`;
}

describe('extractJsonLdRecipe', () => {
  it('liest ein Rezept aus einem @graph mit Portionen, Zeiten und Entitäten', () => {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'Startseite' },
        {
          '@type': 'Recipe',
          name: 'Spaghetti &amp; Tomatensoße',
          description: 'Schnell <b>und</b> einfach.',
          recipeYield: '4 Portionen',
          prepTime: 'PT20M',
          cookTime: 'PT1H',
          totalTime: 'PT1H20M',
          recipeIngredient: ['500 g Spaghetti', '1 Dose Tomaten (400&nbsp;g)', '  '],
          recipeInstructions: 'Nudeln kochen.\nSoße erhitzen.\n\nAlles mischen.',
        },
      ],
    };
    const recipe = extractJsonLdRecipe(page(JSON.stringify(graph)));

    expect(recipe).toEqual({
      title: 'Spaghetti & Tomatensoße',
      description: 'Schnell und einfach.',
      servings: 4,
      prepMinutes: 20,
      cookMinutes: 60,
      source: '',
      ingredients: [
        { section: '', text: '500 g Spaghetti' },
        { section: '', text: '1 Dose Tomaten (400 g)' },
      ],
      steps: ['Nudeln kochen.', 'Soße erhitzen.', 'Alles mischen.'],
      notes: '',
      uncertainties: [],
      vegetarian: null,
    });
  });

  it('löst Abschnitte und Schritte mit HTML auf', () => {
    const recipe = extractJsonLdRecipe(
      page(
        JSON.stringify({
          '@type': ['Recipe'],
          name: 'Zwiebelkuchen',
          recipeYield: ['12', '12 Stücke'],
          totalTime: 'P0DT1H30M',
          recipeIngredient: ['500 g Mehl'],
          recipeInstructions: [
            {
              '@type': 'HowToSection',
              name: 'Teig',
              itemListElement: [
                { '@type': 'HowToStep', text: '<p>Mehl und Hefe <em>verkneten</em>.</p>' },
                { '@type': 'HowToStep', text: 'Gehen lassen.' },
              ],
            },
            { '@type': 'HowToStep', name: 'Backen', text: 'Bei 200&deg;C backen.' },
          ],
        }),
      ),
    );

    expect(recipe?.servings).toBe(12);
    expect([recipe?.prepMinutes, recipe?.cookMinutes]).toEqual([90, null]);
    expect(recipe?.steps).toEqual(['Teig: Mehl und Hefe verkneten.', 'Gehen lassen.', 'Bei 200°C backen.']);
  });

  it('lässt den Namen weg, wenn ein Abschnitt alle Schritte umfasst', () => {
    const recipe = extractJsonLdRecipe(
      page(
        JSON.stringify({
          '@type': 'Recipe',
          name: 'Lasagne',
          recipeInstructions: [
            {
              '@type': 'HowToSection',
              name: 'Zubereitung',
              itemListElement: [
                { '@type': 'HowToStep', text: 'Soße kochen.' },
                { '@type': 'HowToStep', text: 'Schichten und backen.' },
              ],
            },
          ],
        }),
      ),
    );
    expect(recipe?.steps).toEqual(['Soße kochen.', 'Schichten und backen.']);
  });

  it('nimmt bei mehreren Rezepten auf der Seite das ausführlichste', () => {
    const teaser = { '@type': 'Recipe', name: 'Empfehlung', recipeIngredient: ['1 Ei'] };
    const main = { '@type': 'Recipe', name: 'Hauptrezept', recipeIngredient: ['200 g Mehl', '2 Eier'], recipeInstructions: 'Rühren.' };
    expect(extractJsonLdRecipe(page(JSON.stringify(teaser), JSON.stringify({ '@graph': [main] })))?.title).toBe('Hauptrezept');
  });

  it('überspringt kaputtes JSON und verkraftet Zeilenumbrüche in Zeichenketten', () => {
    const broken = '{ "@type": "Recipe", "name": ';
    const withNewline = '{"@type": "Recipe", "name": "Linsensuppe", "recipeIngredient": ["200 g rote\nLinsen"]}';
    const recipe = extractJsonLdRecipe(page(broken, withNewline));

    expect(recipe?.title).toBe('Linsensuppe');
    expect(recipe?.ingredients).toEqual([{ section: '', text: '200 g rote Linsen' }]);
  });

  it('liefert null für Seiten ohne Rezept', () => {
    expect(extractJsonLdRecipe(page(JSON.stringify({ '@type': 'Article', name: 'News' })))).toBeNull();
    expect(extractJsonLdRecipe('<html><body>Kein Rezept</body></html>')).toBeNull();
    expect(extractJsonLdRecipe(page(JSON.stringify({ '@type': 'Recipe', name: 'Leer' })))).toBeNull();
  });
});

describe('parseIsoDuration', () => {
  it('rechnet ISO-Dauern in Minuten um', () => {
    expect(parseIsoDuration('PT1H30M')).toBe(90);
    expect(parseIsoDuration('P0DT0H45M')).toBe(45);
    expect(parseIsoDuration('PT2.5H')).toBe(150);
    expect(parseIsoDuration('PT90S')).toBe(2);
    expect(parseIsoDuration('30')).toBe(30);
    expect(parseIsoDuration('PT0S')).toBeNull();
    expect(parseIsoDuration('eine Stunde')).toBeNull();
    expect(parseIsoDuration(undefined)).toBeNull();
  });
});
