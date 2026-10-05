import { describe, expect, it } from 'vitest';

import type { FoodCategory } from './food-catalog.ts';
import fixtures from './fixtures/rewe-products.json' with { type: 'json' };
import { matchReweProducts, nameFit, packsFor, parsePackSize, reweSearchTerm, type ReweProduct } from './rewe.ts';

/** Echte Suchergebnisse aus einem REWE-Markt vom 5.10.2026, je Suchbegriff. */
const searches: Record<string, ReweProduct[]> = fixtures;

describe('REWE-Abgleich', () => {
  it('liest Packungsgrößen in g, ml und Stück', () => {
    expect(parsePackSize('1,50kg (1 kg = 1,06 €)')).toEqual({ amount: 1500, unit: 'g' });
    expect(parsePackSize('500ml (1 l = 2,10 €)')).toEqual({ amount: 500, unit: 'g' });
    expect(parsePackSize('4x70g (1 kg = 14,25 €)')).toEqual({ amount: 280, unit: 'g' });
    expect(parsePackSize('1 Stück ca. 420 g (1 kg = 14,90 €)')).toEqual({ amount: 1, unit: 'Stück', approxGrams: 420 });
    expect(parsePackSize('10 Stück')).toEqual({ amount: 10, unit: 'Stück' });
    expect(parsePackSize('', 'Zwiebeln 1,5kg')).toEqual({ amount: 1500, unit: 'g' });
    expect(parsePackSize('', 'Knoblauch')).toBeNull();
  });

  it('rechnet aus, wie viele Packungen nötig sind', () => {
    expect(packsFor(680, 'g', { amount: 1, unit: 'Stück', approxGrams: 420 })).toBe(2);
    expect(packsFor(1.5, 'Stück', { amount: 1, unit: 'Stück', approxGrams: 100 })).toBe(2);
    expect(packsFor(600, 'ml', { amount: 400, unit: 'g' })).toBe(2);
    expect(packsFor(1, 'kg', { amount: 1000, unit: 'g' })).toBe(1);
    // Teilmengen und Bedarf ohne Menge: eine Packung
    expect(packsFor(3, 'Zehe', { amount: 60, unit: 'g' })).toBe(1);
    expect(packsFor(6, 'EL', { amount: 500, unit: 'g' })).toBe(1);
    expect(packsFor(null, '', { amount: 1000, unit: 'g' })).toBe(1);
    // Packungs-Einheiten zählen je Packung; eine Dose sind etwa 240 g Abtropfgewicht.
    expect(packsFor(2, 'Becher', { amount: 200, unit: 'g' })).toBe(2);
    expect(packsFor(0.75, 'Dose', { amount: 265, unit: 'g' })).toBe(1);
    // Stück abgepackter Ware sind Packungen, zwei Zwiebeln dagegen passen in ein Netz.
    expect(packsFor(2, '', { amount: 500, unit: 'g' }, 'household')).toBe(2);
    expect(packsFor(2, 'Stück', { amount: 250, unit: 'g' }, 'dairy')).toBe(2);
    expect(packsFor(2, 'Stück', { amount: 1500, unit: 'g' }, 'produce')).toBe(1);
  });

  it('vergleicht Namen nach dem letzten Wortteil', () => {
    expect(nameFit('Zwiebel', 'Zwiebeln 1,5kg')).toBe(1);
    expect(nameFit('Tomaten', 'Rispentomaten ca. 100g')).toBe(0.9);
    expect(nameFit('Tomaten', 'Mutti Tomatenmark 200g')).toBe(0.6);
    expect(nameFit('Lachs', 'Deutsche See Lachsfilet 250g')).toBe(0.95);
    expect(nameFit('Knoblauchzehen', 'Frischer Knoblauch ca. 60g')).toBe(0.95);
    expect(nameFit('Hähnchenbrust', 'Wilhelm Brandenburg Hähnchen Brustfilet ca. 420g')).toBe(0.9);
    // Was nach „mit“ steht, ist nur eine Zutat.
    expect(nameFit('Butter', 'Rama Streichfett mit Butter gesalzen 225g')).toBeCloseTo(0.3);
    expect(nameFit('rote Linsen', 'REWE Bio Rote Linsen 500g')).toBe(1);
    // Getrennt geschrieben
    expect(nameFit('Cherrytomaten', 'Cherry Romatomaten 250g')).toBe(0.85);
  });

  it('sucht bei „und“ nach dem ersten Lebensmittel', () => {
    expect(reweSearchTerm('Salz und Pfeffer')).toEqual({ term: 'Salz', ambiguous: true });
    expect(reweSearchTerm('Petersilie, glatt')).toEqual({ term: 'Petersilie', ambiguous: false });
    expect(reweSearchTerm('rote Linsen')).toEqual({ term: 'rote Linsen', ambiguous: false });
    const match = matchReweProducts({ name: 'Salz und Pfeffer', category: 'spices', amount: null, unit: '' }, searches.Salz!);
    expect(match.candidates[0]?.name).toBe('REWE Beste Wahl Jodsalz 500g');
    expect(match.confidence).toBe('unsure');
  });

  const cases: [string, FoodCategory, number | null, string, string][] = [
    ['Zwiebeln', 'produce', 1.5, 'Stück', 'Zwiebel gelb ca. 100g'],
    ['Tomaten', 'produce', 400, 'g', 'Rispentomaten ca. 100g'],
    ['Hähnchenbrust', 'meat', 680, 'g', 'Hähnchenbrustfilet'],
    ['Eier', 'dairy', 2, '', 'REWE Beste Wahl Eier Bodenhaltung 6 Stück'],
    ['Knoblauch', 'produce', 3, 'Zehe', 'Frischer Knoblauch ca. 60g'],
    ['Kokosmilch', 'canned', 600, 'ml', 'REWE Beste Wahl Kokosmilch fettreduziert 400ml'],
    ['Milch', 'dairy', null, '', 'Bärenmarke Alpenfrische Milch 1,8% 1l'],
    ['Butter', 'dairy', 30, 'g', 'Meggle Feine Butter 250g'],
    ['passierte Tomaten', 'canned', 500, 'g', 'ja! Tomaten passiert 500g'],
    ['rote Linsen', 'dry', 250, 'g', 'REWE Bio Rote Linsen 500g'],
    ['Kichererbsen', 'canned', 0.75, 'Dose', 'ja! Kichererbsen 265g'],
    ['Olivenöl', 'spices', 6, 'EL', 'Fiore Natives Olivenöl extra 750ml'],
    ['Salz', 'spices', null, '', 'REWE Beste Wahl Jodsalz 500g'],
    ['Halloumi', 'dairy', 200, 'g', 'Marka Hellas Halloumi 225g'],
    ['Lachs', 'fish', 300, 'g', 'REWE Beste Wahl Norwegisches Lachsfilet ohne Haut 300g'],
  ];

  it.each(cases)('wählt für %s das passende Produkt', (name, category, amount, unit, expected) => {
    const match = matchReweProducts({ name, category, amount, unit }, searches[name]!);
    expect(match.candidates[0]?.name).toBe(expected);
    expect(match.confidence).toBe('sure');
  });

  it('rechnet einen fehlenden Grundpreis aus der Packungsgröße', () => {
    const { candidates } = matchReweProducts({ name: 'Salz', category: 'spices', amount: null, unit: '' }, searches.Salz!, {
      limit: 50,
    });
    const names = candidates.map((candidate) => candidate.name);
    // 65 g für 1,99 € sind 30,62 € je kg, viel teurer als Jodsalz für 1,70 € je kg.
    expect(names.indexOf('REWE Beste Wahl Tomatengewürzsalz 65g')).toBeGreaterThan(
      names.indexOf('Bad Reichenhaller Marken-Jodsalz mit Fluorid 500g'),
    );
  });

  it('nimmt genug Packungen und rechnet den Preis dafür', () => {
    const [best] = matchReweProducts({ name: 'Kokosmilch', category: 'canned', amount: 600, unit: 'ml' }, searches.Kokosmilch!).candidates;
    expect(best).toMatchObject({ packs: 2, total: 2 * best!.price });
  });

  it('lässt Tierfutter weg und meidet falsche Warengruppen', () => {
    const { candidates } = matchReweProducts(
      { name: 'Hähnchenbrust', category: 'meat', amount: 680, unit: 'g' },
      searches['Hähnchenbrust']!,
      { limit: 50 },
    );
    expect(candidates.some((candidate) => candidate.categoryPath.startsWith('Tierbedarf/'))).toBe(false);
    const onions = matchReweProducts({ name: 'Zwiebeln', category: 'produce', amount: 2, unit: 'Stück' }, searches.Zwiebeln!, {
      limit: 50,
    }).candidates;
    // Röstzwiebeln stehen bei den Gewürzen und landen weit hinten; Chips mit „Onion“ ganz hinten, ohne Punkte.
    const roasted = onions.findIndex((candidate) => candidate.name.includes('Röstzwiebeln'));
    const chips = onions.findIndex((candidate) => candidate.name.startsWith('Pringles'));
    expect(roasted).toBeGreaterThan(3);
    expect(chips).toBeGreaterThan(roasted);
    expect(onions[chips]?.score).toBe(0);
  });

  it('bevorzugt auf Wunsch Bio', () => {
    const [best] = matchReweProducts({ name: 'Milch', category: 'dairy', amount: null, unit: '' }, searches.Milch!, {
      organic: true,
    }).candidates;
    expect(best?.tags).toContain('organic');
  });

  it('nimmt die Reihenfolge der REWE-Suche, wenn kein Name passt', () => {
    const need = { name: 'Frühlingszwiebeln', category: 'produce' as const, amount: 1, unit: 'Bund' };
    const match = matchReweProducts(need, searches.Zwiebeln!);
    expect(match.confidence).toBe('unsure');
    expect(match.candidates[0]?.name).toBe(searches.Zwiebeln![0]?.name);
    expect(matchReweProducts(need, []).confidence).toBe('none');
  });
});
