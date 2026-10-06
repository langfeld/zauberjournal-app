import { describe, expect, it } from 'vitest';

import { timeOfDay } from './dates.ts';
import { createFoodResolver, ensureFood } from './foods.ts';
import { addMember } from './members.ts';
import { bookPurchase } from './pantry-bookings.ts';
import { planAddEntry } from './plan.ts';
import { createShoppingList, syncShoppingList } from './shopping.ts';
import { createPlanner, draftDates, type Suggestion } from './suggestions.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

/** Ein Samstag */
const TODAY = '2026-10-10';

function setUp() {
  const test = createTestStore();
  const ids = counterIds('s');
  test.apply(addMember(test.tables(), 'Marco', 'omnivore', ids).writes);
  test.apply(addMember(test.tables(), 'Anna', 'vegetarian', ids).writes);
  const recipe = (title: string, lines: string[], options?: Record<string, string[]>) => test.addRecipe(title, 2, lines, options);
  const foodId = (name: string) => createFoodResolver(test.tables()).resolve(name)!.id;
  /** Kauft ein, mittags am angegebenen Tag. */
  const buy = (name: string, grams: number, day: string) => {
    test.apply(ensureFood(test.tables(), name)!.writes);
    test.apply(bookPurchase(test.tables(), `liste-${name}`, [{ foodId: foodId(name), amount: grams, unit: 'g' }], timeOfDay(day, 12)));
  };
  const plan = (recipeId: string, date: string) => {
    const { entryId, writes } = planAddEntry(test.tables(), { date, meal: 'dinner', recipeId, text: '' }, 1000, ids);
    test.apply(writes);
    return entryId;
  };
  const suggest = (date: string) => createPlanner(test.tables(), TODAY, 'dinner').suggest(date, { limit: 10 });
  return { test, ids, recipe, foodId, buy, plan, suggest };
}

const titles = (list: readonly Suggestion[]) => list.map((suggestion) => suggestion.title);
const reasonsOf = (list: readonly Suggestion[], title: string) =>
  list.find((suggestion) => suggestion.title === title)?.reasons.map((reason) => reason.text) ?? [];

describe('Planvorschläge', () => {
  it('bevorzugt, was bald abläuft, und stellt Nichtvegetarisches nach hinten', () => {
    const { recipe, buy, suggest } = setUp();
    recipe('Spinatpasta', ['200 g Spinat', '250 g Nudeln']);
    recipe('Linsensuppe', ['200 g rote Linsen', '1 Zwiebel']);
    recipe('Hähnchenpfanne', ['300 g Hähnchenbrust', '1 Paprika']);
    recipe('Bowl', ['150 g Reis'], { Hähnchen: ['300 g Hähnchenbrust'], Halloumi: ['200 g Halloumi'] });
    // Frisches hält eine Woche: noch 2 Tage
    buy('Spinat', 300, '2026-10-05');

    const suggestions = suggest(TODAY);
    expect(titles(suggestions)[0]).toBe('Spinatpasta');
    expect(reasonsOf(suggestions, 'Spinatpasta')).toEqual(['Spinat · noch 2 Tage', 'nur 1 Zutat fehlt']);
    expect(titles(suggestions).at(-1)).toBe('Hähnchenpfanne');
    expect(reasonsOf(suggestions, 'Hähnchenpfanne')).toEqual(['nicht vegetarisch']);
    expect(reasonsOf(suggestions, 'Bowl')).toEqual(['für beide']);
  });

  it('sagt, wenn ein Rezept nicht vegan ist', () => {
    const { recipe, suggest, test, ids } = setUp();
    test.apply(addMember(test.tables(), 'Kim', 'vegan', ids).writes);
    recipe('Hähnchenpfanne', ['300 g Hähnchenbrust', '1 Paprika']);
    recipe('Omelett', ['3 Eier', '50 g Gouda']);
    recipe('Gemüsecurry', ['400 ml Kokosmilch', '300 g Brokkoli']);

    const suggestions = suggest(TODAY);
    expect(titles(suggestions)[0]).toBe('Gemüsecurry');
    expect(reasonsOf(suggestions, 'Omelett')).toEqual(['nicht vegan']);
    expect(reasonsOf(suggestions, 'Hähnchenpfanne')).toEqual(['nicht vegetarisch']);
  });

  it('nennt keine Grundzutaten wie Zwiebeln und zählt sie kaum', () => {
    const { recipe, buy, suggest } = setUp();
    for (const name of ['Erbsen', 'Bohnen', 'Möhren', 'Kürbis', 'Lauch']) recipe(`${name}suppe`, [`300 g ${name}`, '100 g Zwiebeln']);
    recipe('Gurkensalat', ['200 g Gurke']);
    buy('Zwiebeln', 1000, '2026-10-08');
    buy('Gurke', 300, '2026-10-08');

    const suggestions = suggest(TODAY);
    expect(titles(suggestions)[0]).toBe('Gurkensalat');
    expect(reasonsOf(suggestions, 'Gurkensalat')).toEqual(['aus dem Vorrat: Gurke', 'alles da']);
    expect(suggestions.some((suggestion) => suggestion.reasons.some((reason) => reason.text.includes('Zwiebel')))).toBe(false);
  });

  it('rechnet nur mit dem, was geplante Gerichte übrig lassen', () => {
    const { recipe, buy, plan, suggest } = setUp();
    const pasta = recipe('Spinatpasta', ['200 g Spinat', '250 g Nudeln']);
    recipe('Spinatomelett', ['150 g Spinat', '3 Eier']);
    buy('Spinat', 200, '2026-10-08');
    expect(reasonsOf(suggest('2026-10-12'), 'Spinatomelett')).toContain('aus dem Vorrat: Spinat');

    // Die Pasta am Sonntag braucht den ganzen Spinat.
    plan(pasta, '2026-10-11');
    const suggestions = suggest('2026-10-12');
    expect(reasonsOf(suggestions, 'Spinatomelett').some((text) => text.includes('Spinat'))).toBe(false);
    expect(reasonsOf(suggestions, 'Spinatpasta')).toContain('schon So 11.10. geplant');
  });

  it('rechnet mit dem Rest einer Packung, die für ein geplantes Gericht kommt', () => {
    const { recipe, plan, test, ids, foodId, suggest } = setUp();
    const cake = recipe('Käsekuchen', ['200 g Quark', '3 Eier']);
    recipe('Quarkspeise', ['250 g Quark', '100 g Beeren']);
    const entryId = plan(cake, '2026-10-11');
    const { listId, writes } = createShoppingList(test.tables(), [entryId], TODAY, 1000, ids);
    test.apply(writes);
    test.apply(syncShoppingList(test.tables(), listId, 1000));
    // REWE hat Quark nur zu 500 g: 300 g bleiben übrig.
    test.apply([
      {
        table: 'reweProducts',
        rowId: foodId('Quark'),
        cells: { state: 'sure', productId: 'q', name: 'Speisequark 500g', grammage: '500g', price: 99, listingId: 'l' },
      },
    ]);
    expect(reasonsOf(suggest('2026-10-12'), 'Quarkspeise')).toContain('Rest vom Einkauf: Quark');
  });

  it('weiß, was ihr zuletzt hattet, und mag keine zwei Nudelgerichte hintereinander', () => {
    const { recipe, plan, suggest } = setUp();
    const soup = recipe('Linsensuppe', ['200 g rote Linsen']);
    const curry = recipe('Curry', ['400 ml Kokosmilch']);
    plan(soup, '2026-08-29');
    plan(curry, '2026-10-07');
    const suggestions = suggest(TODAY);
    expect(reasonsOf(suggestions, 'Linsensuppe')).toEqual(['zuletzt vor 6 Wochen']);
    expect(titles(suggestions)).toEqual(['Linsensuppe', 'Curry']);

    const pasta = setUp();
    pasta.recipe('Spinatpasta', ['200 g Spinat', '250 g Nudeln']);
    const tomato = pasta.recipe('Tomatenpasta', ['400 g Tomaten', '250 g Spaghetti']);
    pasta.recipe('Linsensuppe', ['200 g rote Linsen']);
    pasta.plan(tomato, '2026-10-11');
    expect(titles(pasta.suggest(TODAY))).toEqual(['Linsensuppe', 'Spinatpasta', 'Tomatenpasta']);
  });

  it('schlägt zur Mahlzeit Passendes vor: nach dem Plan, sonst nach dem Titel', () => {
    const { recipe, suggest, test, ids } = setUp();
    recipe('Protein-Pancakes', ['100 g Haferflocken', '2 Eier']);
    recipe('Gemüsecurry', ['400 ml Kokosmilch', '300 g Brokkoli']);
    const salad = recipe('Salatteller', ['200 g Romanasalat']);
    // Der Salat stand bisher nur mittags im Plan.
    test.apply(planAddEntry(test.tables(), { date: '2026-09-01', meal: 'lunch', recipeId: salad, text: '' }, 1000, ids).writes);

    expect(titles(suggest(TODAY))).toEqual(['Gemüsecurry', 'Salatteller', 'Protein-Pancakes']);
    expect(titles(createPlanner(test.tables(), TODAY, 'breakfast').suggest(TODAY, { limit: 10 }))[0]).toBe('Protein-Pancakes');
  });

  it('füllt freie Tage ohne Wiederholung, Frisches zuerst', () => {
    const { recipe, buy, plan, test, ids } = setUp();
    recipe('Spinatpasta', ['200 g Spinat', '250 g Nudeln']);
    recipe('Linsensuppe', ['200 g rote Linsen', '1 Zwiebel']);
    recipe('Kartoffelgratin', ['800 g Kartoffeln', '200 ml Sahne']);
    const pizza = recipe('Pizza', ['1 Pizzateig', '200 g Mozzarella']);
    buy('Spinat', 200, '2026-10-05');
    plan(pizza, '2026-10-11');
    // Auch ein Eintrag ohne Rezept belegt den Tag, ein Mittagessen nicht.
    test.apply(planAddEntry(test.tables(), { date: '2026-10-13', meal: 'dinner', recipeId: '', text: 'Reste' }, 1000, ids).writes);
    test.apply(planAddEntry(test.tables(), { date: '2026-10-12', meal: 'lunch', recipeId: '', text: 'Kantine' }, 1000, ids).writes);

    // Drei freie Tage; belegte davor fallen weg, belegte dazwischen bleiben drin.
    const dates = draftDates(test.tables(), TODAY, 3, 'dinner');
    expect(dates).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(draftDates(test.tables(), '2026-10-11', 2, 'dinner')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);

    const draft = createPlanner(test.tables(), TODAY, 'dinner').draft(dates);
    const titleOf = (recipeId: string) => test.tables().recipes[recipeId]?.title;
    expect(draft.map((pick) => pick.date)).toEqual(['2026-10-10', '2026-10-12', '2026-10-14']);
    expect(titleOf(draft[0]!.recipeId)).toBe('Spinatpasta');
    expect(new Set(draft.map((pick) => pick.recipeId)).size).toBe(3);
    expect(draft.map((pick) => titleOf(pick.recipeId))).not.toContain('Pizza');
  });
});
