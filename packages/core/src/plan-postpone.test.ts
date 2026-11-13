import { describe, expect, it } from 'vitest';

import { timeOfDay } from './dates.ts';
import { ensureFood } from './foods.ts';
import { correctStock, stockOf } from './pantry.ts';
import { planSetStatus } from './pantry-bookings.ts';
import { planAddEntry, planMoveDay, planUpdateEntry } from './plan.ts';
import { listPostponed, planAutoPostpone, planCookedAfterAll, planKeepPostponed } from './plan-postpone.ts';
import { revertWrites } from './rows.ts';
import { counterIds, createTestStore } from './test-helpers.ts';

const SUNDAY = '2026-11-08';
const MONDAY = '2026-11-09';
const TUESDAY = '2026-11-10';
const WEDNESDAY = '2026-11-11';
const THURSDAY = '2026-11-12';
const FRIDAY = '2026-11-13';
const SATURDAY = '2026-11-14';
const at = (day: string, hour: number) => timeOfDay(day, hour);

function setUp() {
  const test = createTestStore();
  const ids = counterIds('e');
  const curry = test.addRecipe('Curry', 2, ['300 g Reis']);
  const add = (date: string, meal: 'lunch' | 'dinner' = 'dinner', recipeId = curry, text = '') => {
    const { entryId, writes } = planAddEntry(test.tables(), { date, meal, recipeId, text }, 1000, ids);
    test.apply(writes);
    return entryId;
  };
  const dayOf = (...entryIds: string[]) => entryIds.map((id) => test.tables().planEntries[id]?.date);
  /** Der Lauf am Morgen bzw. Abend von `today`; geprüft war bis `checkedBefore`. */
  const run = (today: string, checkedBefore: string, hour = 8) =>
    test.apply(planAutoPostpone(test.tables(), checkedBefore, today, hour, at(today, hour)));
  return { test, curry, add, dayOf, run };
}

describe('Nicht Gekochtes rückt weiter', () => {
  it('auf den nächsten Tag, die folgenden Gerichte rücken bis zum nächsten freien Tag nach', () => {
    const { test, add, dayOf, run } = setUp();
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    const wednesday = add(WEDNESDAY);
    const friday = add(FRIDAY);
    test.apply(planSetStatus(test.tables(), monday, 'shopped', at(SUNDAY, 12)));

    run(TUESDAY, MONDAY);
    expect(dayOf(monday, tuesday, wednesday, friday)).toEqual([TUESDAY, WEDNESDAY, THURSDAY, FRIDAY]);
    // Eingekauft bleibt eingekauft; nur das nicht gekochte Gericht steht in der Meldung.
    expect(test.tables().planEntries[monday]).toMatchObject({ status: 'shopped', postponedFrom: MONDAY, postponedAt: at(TUESDAY, 8) });
    expect(test.tables().planEntries[tuesday]).toMatchObject({ postponedFrom: TUESDAY, postponedAt: at(TUESDAY, 8) });
    expect(test.tables().planEntries[friday]).toMatchObject({ postponedFrom: '', postponedAt: null });
    expect(listPostponed(test.tables(), TUESDAY)).toEqual([
      { id: monday, recipeId: test.tables().planEntries[monday]!.recipeId, meal: 'dinner', from: MONDAY, date: TUESDAY },
    ]);
  });

  it('lässt Gekochtes stehen und rückt nur, was seit der letzten Prüfung vorbei ist', () => {
    const { test, add, dayOf, run } = setUp();
    const sunday = add(SUNDAY);
    const cooked = add(MONDAY);
    test.apply(planSetStatus(test.tables(), cooked, 'cooked', at(MONDAY, 20)));

    // Noch nie geprüft: Ältere Einträge stammen aus der Zeit vor dem Weiterrücken.
    expect(planAutoPostpone(test.tables(), '', TUESDAY, 8, at(TUESDAY, 8))).toEqual([]);
    expect(planAutoPostpone(test.tables(), TUESDAY, TUESDAY, 8, at(TUESDAY, 8))).toEqual([]);
    run(TUESDAY, MONDAY);
    expect(dayOf(sunday, cooked)).toEqual([SUNDAY, MONDAY]);
  });

  it('ab 15 Uhr bleibt heute, wie es ist', () => {
    const { add, dayOf, run } = setUp();
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    const wednesday = add(WEDNESDAY);
    run(TUESDAY, MONDAY, 16);
    expect(dayOf(monday, tuesday, wednesday)).toEqual([WEDNESDAY, TUESDAY, THURSDAY]);
  });

  it('überspringt Tage mit Gekochtem oder ohne Rezept und rückt je Mahlzeit', () => {
    const { test, add, dayOf, run } = setUp();
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    const out = add(WEDNESDAY, 'dinner', '', 'Essen gehen');
    const thursday = add(THURSDAY);
    const lunch = add(TUESDAY, 'lunch');
    const early = add(FRIDAY);
    test.apply(planSetStatus(test.tables(), early, 'cooked', at(TUESDAY, 7)));

    run(TUESDAY, MONDAY);
    expect(dayOf(monday, tuesday, out, thursday, lunch, early)).toEqual([TUESDAY, THURSDAY, WEDNESDAY, SATURDAY, TUESDAY, FRIDAY]);
  });

  it('rückt mehrere nicht gekochte Tage der Reihe nach weiter', () => {
    const { add, dayOf, run } = setUp();
    const sunday = add(SUNDAY);
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    const thursday = add(THURSDAY);
    // Zwei Tage niemand in der App: Sonntag und Montag rücken beide, also zwei freie Tage.
    run(TUESDAY, SUNDAY);
    expect(dayOf(sunday, monday, tuesday, thursday)).toEqual([TUESDAY, WEDNESDAY, THURSDAY, FRIDAY]);
  });
});

describe('Doch gekocht', () => {
  it('nimmt das Gericht auf seinen Tag zurück, bucht ab und rückt den Rest zurück', () => {
    const { test, add, dayOf, run } = setUp();
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    const wednesday = add(WEDNESDAY);
    const rice = ensureFood(test.tables(), 'Reis')!;
    test.apply(rice.writes);
    test.apply(correctStock(test.tables(), rice.foodId, 1000, at(SUNDAY, 9), counterIds('b'), 'g'));
    run(TUESDAY, MONDAY);

    const before = test.tables();
    const writes = planCookedAfterAll(before, monday, TUESDAY, 9, at(TUESDAY, 9));
    test.apply(writes);
    expect(dayOf(monday, tuesday, wednesday)).toEqual([MONDAY, TUESDAY, WEDNESDAY]);
    expect(test.tables().planEntries[monday]).toMatchObject({ status: 'cooked', postponedFrom: '', postponedAt: null });
    expect(test.tables().planEntries[tuesday]).toMatchObject({ postponedFrom: '', postponedAt: null });
    expect(stockOf(test.tables(), rice.foodId, TUESDAY)).toBe(700);
    expect(listPostponed(test.tables(), TUESDAY)).toEqual([]);

    // Rückgängig: wieder weitergerückt, die Abbuchung entfällt.
    test.apply(revertWrites(before, writes, at(TUESDAY, 10)));
    expect(dayOf(monday, tuesday, wednesday)).toEqual([TUESDAY, WEDNESDAY, THURSDAY]);
    expect(test.tables().planEntries[monday]).toMatchObject({ status: 'planned', postponedFrom: MONDAY });
    expect(stockOf(test.tables(), rice.foodId, TUESDAY)).toBe(1000);
  });

  it('lässt andere nicht gekochte Gerichte desselben Laufs wieder weiterrücken', () => {
    const { test, add, dayOf, run } = setUp();
    const sunday = add(SUNDAY);
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    run(TUESDAY, SUNDAY);
    expect(dayOf(sunday, monday, tuesday)).toEqual([TUESDAY, WEDNESDAY, THURSDAY]);

    // Montag war gekocht, Sonntag nicht: wie ein Lauf, in dem nur Sonntag weitergerückt wäre.
    test.apply(planCookedAfterAll(test.tables(), monday, TUESDAY, 9, at(TUESDAY, 9)));
    expect(dayOf(sunday, monday, tuesday)).toEqual([TUESDAY, MONDAY, WEDNESDAY]);
    expect(listPostponed(test.tables(), TUESDAY).map((entry) => [entry.id, entry.from])).toEqual([[sunday, SUNDAY]]);
  });

  it('lässt von Hand Verschobenes stehen', () => {
    const { test, add, dayOf, run } = setUp();
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    const wednesday = add(WEDNESDAY);
    const friday = add(FRIDAY);
    run(TUESDAY, MONDAY);
    test.apply(planUpdateEntry(test.tables(), tuesday, { date: SATURDAY }));
    test.apply(planMoveDay(test.tables(), THURSDAY, FRIDAY));
    expect(dayOf(monday, tuesday, wednesday, friday)).toEqual([TUESDAY, SATURDAY, FRIDAY, THURSDAY]);

    test.apply(planCookedAfterAll(test.tables(), monday, TUESDAY, 9, at(TUESDAY, 9)));
    expect(dayOf(monday, tuesday, wednesday, friday)).toEqual([MONDAY, SATURDAY, FRIDAY, THURSDAY]);
  });

  it('„Passt so“ lässt alles stehen und nimmt die Meldung weg', () => {
    const { test, add, dayOf, run } = setUp();
    const monday = add(MONDAY);
    const tuesday = add(TUESDAY);
    run(TUESDAY, MONDAY);
    test.apply(planKeepPostponed(test.tables(), [monday]));
    expect(dayOf(monday, tuesday)).toEqual([TUESDAY, WEDNESDAY]);
    expect(listPostponed(test.tables(), TUESDAY)).toEqual([]);
    expect(test.tables().planEntries[tuesday]).toMatchObject({ postponedFrom: '', postponedAt: null });
    // Ohne Weiterrücken trägt „Doch gekocht“ nur „gekocht“ ein.
    test.apply(planCookedAfterAll(test.tables(), monday, TUESDAY, 9, at(TUESDAY, 9)));
    expect(test.tables().planEntries[monday]).toMatchObject({ date: TUESDAY, status: 'cooked' });
  });
});
