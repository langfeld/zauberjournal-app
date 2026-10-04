import { describe, expect, it } from 'vitest';

import { addMember, listMembers, removeMember } from './members.ts';
import {
  buildPlanEntry,
  createDietLookup,
  describePlanEntry,
  listPlanEntries,
  planAddEntry,
  planChoose,
  planSetServings,
  planUpdateEntry,
} from './plan.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

function household() {
  const test = createTestStore();
  const ids = counterIds('m');
  const marco = addMember(test.tables(), 'Marco', 'omnivore', ids);
  test.apply(marco.writes);
  const anna = addMember(test.tables(), 'Anna', 'vegetarian', ids);
  test.apply(anna.writes);
  const salad = test.addRecipe('Salat', 2, ['1 Kopf Romanasalat'], {
    Hähnchen: ['300 g Hähnchenbrust'],
    Halloumi: ['200 g Halloumi'],
  });
  return { test, marcoId: marco.memberId, annaId: anna.memberId, salad };
}

describe('Plan', () => {
  it('plant mit allen Personen und wählt die Option nach Ernährungsform', () => {
    const { test, salad } = household();
    const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'dinner', recipeId: salad, text: '' }, 1000, counterIds('e'));
    test.apply(writes);

    const entry = buildPlanEntry(test.tables(), entryId, createDietLookup(test.tables()))!;
    const [chicken, halloumi] = entry.recipe!.groups[0]!.options;
    expect(entry.eaters.map((eater) => [eater.name, eater.servings, eater.choices[entry.recipe!.groups[0]!.id]])).toEqual([
      ['Marco', 1, { optionId: chicken!.id, chosen: false }],
      ['Anna', 1, { optionId: halloumi!.id, chosen: false }],
    ]);
    expect(entry.servings).toBe(2);
    expect(describePlanEntry(entry)).toBe('2 Portionen · 1× Hähnchen, 1× Halloumi');
  });

  it('übernimmt Gäste, eigene Wahl und Änderungen an den Portionen', () => {
    const { test, salad, marcoId, annaId } = household();
    const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'dinner', recipeId: salad, text: '' }, 1000, counterIds('e'));
    test.apply(writes);
    const groupId = buildPlanEntry(test.tables(), entryId, () => '')!.recipe!.groups[0]!.id;
    const halloumi = buildPlanEntry(test.tables(), entryId, () => '')!.recipe!.groups[0]!.options[1]!.id;

    test.apply(planSetServings(test.tables(), entryId, '', 2, 2000));
    test.apply(planSetServings(test.tables(), entryId, annaId, 0, 2000));
    test.apply(planChoose(test.tables(), `${entryId}/${marcoId}`, groupId, halloumi));

    const entry = buildPlanEntry(test.tables(), entryId, createDietLookup(test.tables()))!;
    expect(entry.eaters.map((eater) => [eater.name, eater.servings])).toEqual([
      ['Marco', 1],
      ['Gäste', 2],
    ]);
    expect(entry.eaters[0]!.choices[groupId]).toEqual({ optionId: halloumi, chosen: true });
    expect(entry.servings).toBe(3);
    expect(Object.values(entry.distribution[groupId]!)).toEqual([2, 1]);

    // Wieder dabei: dieselbe Zeile lebt wieder auf.
    test.apply(planSetServings(test.tables(), entryId, annaId, 1, 3000));
    expect(buildPlanEntry(test.tables(), entryId, () => '')!.servings).toBe(4);
  });

  it('plant ohne Personen mit Gäste-Portionen und listet nach Tag und Mahlzeit', () => {
    const test = createTestStore();
    const soup = test.addRecipe('Suppe', 4, ['1 l Brühe']);
    const ids = counterIds('e');
    const add = (date: string, meal: 'lunch' | 'dinner', recipeId: string, text = '') =>
      test.apply(planAddEntry(test.tables(), { date, meal, recipeId, text }, 1000, ids).writes);
    add('2026-10-07', 'dinner', soup);
    add('2026-10-06', 'dinner', '', 'Reste');
    add('2026-10-06', 'lunch', soup);
    add('2026-10-20', 'dinner', soup);

    const entries = listPlanEntries(test.tables(), '2026-10-06', '2026-10-12', () => '');
    expect(entries.map((entry) => [entry.date, entry.meal, entry.title, entry.servings])).toEqual([
      ['2026-10-06', 'lunch', 'Suppe', 4],
      ['2026-10-06', 'dinner', 'Reste', 2],
      ['2026-10-07', 'dinner', 'Suppe', 4],
    ]);
    expect(describePlanEntry(entries[1]!)).toBe('');

    test.apply(planUpdateEntry(test.tables(), entries[2]!.id, { date: '2026-10-08', status: 'cooked' }));
    expect(listPlanEntries(test.tables(), '2026-10-08', '2026-10-08', () => '')[0]).toMatchObject({ title: 'Suppe', status: 'cooked' });
  });

  it('blendet entfernte Personen aus', () => {
    const { test, salad, annaId } = household();
    const { entryId, writes } = planAddEntry(test.tables(), { date: '2026-10-06', meal: 'dinner', recipeId: salad, text: '' }, 1000, counterIds('e'));
    test.apply(writes);
    test.apply(removeMember(annaId, 2000));

    expect(listMembers(test.tables()).map((member) => member.name)).toEqual(['Marco']);
    expect(buildPlanEntry(test.tables(), entryId, () => '')!.eaters.map((eater) => eater.name)).toEqual(['Marco']);
  });
});
