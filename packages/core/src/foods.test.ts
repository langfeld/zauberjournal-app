import { describe, expect, it } from 'vitest';

import {
  classifyFood,
  cleanFoodName,
  createFoodResolver,
  foodKeysMatch,
  listFoods,
  mergeFoods,
  normalizeFoodName,
} from './foods.ts';
import { createTestStore } from './test-helpers.ts';

describe('Lebensmittelnamen', () => {
  it('entfernt Füllwörter, Klammern und die Verwendung', () => {
    expect(cleanFoodName('große Zwiebel')).toBe('Zwiebel');
    expect(cleanFoodName('Tomaten (aus der Dose)')).toBe('Tomaten');
    expect(cleanFoodName('Öl zum Braten')).toBe('Öl');
    expect(cleanFoodName('Butter oder Margarine')).toBe('Butter');
    expect(cleanFoodName('etwas frische Petersilie')).toBe('Petersilie');
    expect(cleanFoodName('rote Zwiebeln')).toBe('rote Zwiebeln');
    expect(normalizeFoodName('TK-Erbsen')).toBe('tk erbsen');
  });

  it('erkennt Einzahl und Mehrzahl als dasselbe Lebensmittel', () => {
    const same = (a: string, b: string) => foodKeysMatch(normalizeFoodName(a), normalizeFoodName(b));
    expect(same('Zwiebel', 'Zwiebeln')).toBe(true);
    expect(same('Tomate', 'Tomaten')).toBe(true);
    expect(same('Apfel', 'Äpfel')).toBe(true);
    expect(same('Ei', 'Eier')).toBe(true);
    expect(same('Kapern', 'Kaper')).toBe(true);
    expect(same('Nuss', 'Nüsse')).toBe(true);
    expect(same('rote Zwiebel', 'Zwiebel')).toBe(false);
    expect(same('Paprika', 'Paprikapulver')).toBe(false);
    expect(same('Lauch', 'Lauchzwiebel')).toBe(false);
  });
});

describe('classifyFood', () => {
  const cases: [string, string, string][] = [
    ['Zwiebeln', 'produce', 'vegan'],
    ['Hähnchenbrustfilet', 'meat', 'meat'],
    ['Rinderhackfleisch', 'meat', 'meat'],
    ['Räucherlachs', 'fish', 'fish'],
    ['Thunfisch', 'canned', 'fish'],
    ['Kokosmilch', 'canned', 'vegan'],
    ['Milch', 'dairy', 'vegetarian'],
    ['Buttermilch', 'dairy', 'vegetarian'],
    ['Erdnussbutter', 'canned', 'vegan'],
    ['Eier', 'dairy', 'vegetarian'],
    ['Hühnereier', 'dairy', 'vegetarian'],
    ['Hühnerbrühe', 'spices', 'meat'],
    ['Gemüsebrühe', 'spices', 'vegan'],
    ['Butterschmalz', 'dairy', 'vegetarian'],
    ['Granatapfel', 'produce', 'vegan'],
    ['Sojahack', 'dairy', 'vegan'],
    ['Fleischtomaten', 'produce', 'vegan'],
    ['Paprikapulver', 'spices', 'vegan'],
    ['Basmatireis', 'dry', 'vegan'],
    ['Vanilleeis', 'frozen', ''],
    ['TK-Erbsen', 'frozen', ''],
    ['Olivenöl', 'spices', 'vegan'],
    ['Parmesan', 'dairy', 'vegetarian'],
    ['Halloumi', 'dairy', 'vegetarian'],
    ['Kichererbsen', 'canned', 'vegan'],
    ['Worcestershiresauce', 'spices', 'fish'],
    ['Gelatine', 'dry', 'meat'],
    ['Spülmittel', 'household', ''],
    ['Quinoa-Burger', 'other', ''],
  ];
  it.each(cases)('%s → %s, %s', (name, category, diet) => {
    expect(classifyFood(name)).toEqual({ category, diet });
  });
});

describe('createFoodResolver', () => {
  it('legt neue Lebensmittel mit fester ID an und ordnet ähnliche Namen zu', () => {
    const test = createTestStore();
    const resolver = createFoodResolver(test.tables());

    const onion = resolver.resolve('große Zwiebeln')!;
    expect(onion).toMatchObject({ id: 'food:zwiebeln', name: 'Zwiebeln', category: 'produce', isNew: true });
    // Im selben Durchlauf landet die Einzahl beim gerade angelegten Lebensmittel.
    expect(resolver.resolve('Zwiebel')?.id).toBe('food:zwiebeln');

    test.apply(resolver.newFoodWrites());
    expect(listFoods(test.tables()).map((food) => food.name)).toEqual(['Zwiebeln']);
    expect(createFoodResolver(test.tables()).resolve('Zwiebel')).toMatchObject({ id: 'food:zwiebeln', isNew: false });
  });

  it('entscheidet bei Doppelten auf allen Geräten gleich und folgt gemerkten Zuordnungen', () => {
    const test = createTestStore();
    test.apply([
      { table: 'foods', rowId: 'food:zwiebeln', cells: { name: 'Zwiebeln', category: 'produce' } },
      { table: 'foods', rowId: 'food:zwiebel', cells: { name: 'Zwiebel', category: 'produce' } },
      { table: 'foods', rowId: 'food:frühlingszwiebeln', cells: { name: 'Frühlingszwiebeln', category: 'produce' } },
    ]);
    expect(createFoodResolver(test.tables()).resolve('Zwiebeln')?.id).toBe('food:zwiebel');

    test.apply(mergeFoods(test.tables(), 'food:zwiebeln', 'food:zwiebel', 5000));
    test.apply([{ table: 'foodAliases', rowId: 'lauchzwiebeln', cells: { foodId: 'food:frühlingszwiebeln' } }]);
    const resolver = createFoodResolver(test.tables());
    expect(resolver.resolve('Lauchzwiebeln')?.id).toBe('food:frühlingszwiebeln');
    expect(resolver.resolve('Zwiebeln')?.id).toBe('food:zwiebel');
    expect(listFoods(test.tables()).map((food) => food.id)).toEqual(['food:frühlingszwiebeln', 'food:zwiebel']);
  });

  it('übernimmt beim Zusammenführen den Vorrat', () => {
    const test = createTestStore();
    test.apply([
      { table: 'foods', rowId: 'a', cells: { name: 'Lauchzwiebeln', stock: 'have' } },
      { table: 'foods', rowId: 'b', cells: { name: 'Frühlingszwiebeln' } },
    ]);
    test.apply(mergeFoods(test.tables(), 'a', 'b', 5000));
    expect(test.tables().foods.b?.stock).toBe('have');
    expect(test.tables().foodAliases.lauchzwiebeln?.foodId).toBe('b');
  });
});
