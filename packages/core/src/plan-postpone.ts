import { addDays, compareDates, dayOf } from './dates.ts';
import type { MealId } from './meals.ts';
import { planSetStatus } from './pantry-bookings.ts';
import { NOT_POSTPONED, PLAN_FROM_TOMORROW_HOUR, wasPostponed, type PlanEntryRow, type PlanTables } from './plan.ts';
import { isActive, type RowWrite } from './rows.ts';
import type { ShoppingTables } from './shopping.ts';

/**
 * Nicht Gekochtes rückt weiter (seit November 2026). Als gekocht gilt nur, was jemand einträgt: mit dem Haken im
 * Plan, im Kochmodus oder am Eintrag. Ist der Tag eines anderen Gerichts vorbei, kommt es auf den nächsten Tag
 * derselben Mahlzeit, und die Gerichte danach rücken je einen Tag nach, bis ein freier Tag die Lücke schließt; was
 * danach kommt, bleibt. Tage mit Gekochtem oder einem Eintrag ohne Rezept („Essen gehen“, „Reste“) bleiben, wie sie
 * sind, die Gerichte überspringen sie. Wer doch gekocht hat, nimmt das mit „Doch gekocht“ zurück.
 */

/** So weit sucht das Weiterrücken höchstens nach einem freien Tag. */
const MAX_DAYS = 366;

/** Ab welchem Tag ein Gericht weiterrückt: vor 15 Uhr heute, danach morgen, weil das Essen für heute dann meist steht. */
export function postponeStart(today: string, hour: number): string {
  return hour < PLAN_FROM_TOMORROW_HOUR ? today : addDays(today, 1);
}

/** Bleibt auf seinem Tag; andere Gerichte überspringen den Tag. */
function isFixed(entry: PlanEntryRow): boolean {
  return !entry.recipeId || entry.status === 'cooked';
}

/** Weitergerückt, weil sein Tag vorbei war, nicht nur mitgerückt: Der Tag davor lag vor dem Tag des Laufs. */
function wasOverdue(entry: PlanEntryRow): boolean {
  return wasPostponed(entry) && entry.postponedFrom !== '' && entry.postponedFrom < dayOf(entry.postponedAt);
}

/**
 * Rückt die nicht gekochten Gerichte `overdueIds` ab `start` weiter, je Mahlzeit und der Reihe nach. Wer auf einem
 * freien Tag steht, rückt nach, bis ein freier Tag die Lücke schließt. Gerichte desselben Tages bleiben zusammen.
 */
function postpone(tables: PlanTables, overdueIds: readonly string[], start: string, now: number): RowWrite[] {
  const writes: RowWrite[] = [];
  const overdue = new Set(overdueIds);
  for (const meal of new Set(overdueIds.map((id) => tables.planEntries[id]!.meal))) {
    const slots = new Map<string, { movable: string[]; fixed: boolean }>();
    for (const [id, entry] of Object.entries(tables.planEntries)) {
      if (!isActive(entry) || entry.meal !== meal || entry.date < start || overdue.has(id)) continue;
      const slot = slots.get(entry.date) ?? { movable: [], fixed: false };
      if (isFixed(entry)) slot.fixed = true;
      else slot.movable.push(id);
      slots.set(entry.date, slot);
    }

    const byDay = new Map<string, string[]>();
    for (const id of overdueIds) {
      const { date, meal: entryMeal } = tables.planEntries[id]!;
      if (entryMeal === meal) byDay.set(date, [...(byDay.get(date) ?? []), id]);
    }
    const queue = [...byDay.keys()].sort(compareDates).map((date) => byDay.get(date)!);

    for (let offset = 0; queue.length > 0 && offset < MAX_DAYS; offset++) {
      const date = addDays(start, offset);
      const slot = slots.get(date);
      if (slot?.fixed) continue;
      if (slot && slot.movable.length > 0) queue.push(slot.movable);
      for (const id of queue.shift()!) {
        writes.push({ table: 'planEntries', rowId: id, cells: { date, postponedFrom: tables.planEntries[id]!.date, postponedAt: now } });
      }
    }
  }
  return writes;
}

/**
 * Lässt nicht Gekochtes weiterrücken, dessen Tag seit der letzten Prüfung vorbei ist: von `checkedBefore` bis
 * gestern. Danach gilt `today` als geprüft. Was später jemand auf einen vergangenen Tag legt, bleibt dort. Ohne
 * `checkedBefore` (noch nie geprüft) rückt nichts: Ältere Einträge stammen aus der Zeit, als Eingekauftes nach
 * seinem Tag von selbst als gekocht galt.
 */
export function planAutoPostpone(tables: PlanTables, checkedBefore: string, today: string, hour: number, now: number): RowWrite[] {
  if (!checkedBefore || checkedBefore >= today) return [];
  const overdue = Object.entries(tables.planEntries)
    .filter(([, entry]) => {
      const recipe = tables.recipes[entry.recipeId];
      return isActive(entry) && entry.status !== 'cooked' && entry.date >= checkedBefore && entry.date < today && !!recipe && isActive(recipe);
    })
    .map(([id]) => id);
  return overdue.length > 0 ? postpone(tables, overdue, postponeStart(today, hour), now) : [];
}

export type PostponedEntry = { id: string; recipeId: string; meal: MealId; from: string; date: string };

/**
 * Gerichte, die von selbst weitergerückt sind, weil sie nicht als gekocht eingetragen waren, und noch anstehen;
 * für die Meldung im Plan mit „Doch gekocht“. Mitgerückte zählen nicht.
 */
export function listPostponed(tables: PlanTables, today: string): PostponedEntry[] {
  return Object.entries(tables.planEntries)
    .filter(([, entry]) => isActive(entry) && entry.status !== 'cooked' && entry.date >= today && wasOverdue(entry))
    .map(([id, entry]) => ({ id, recipeId: entry.recipeId, meal: entry.meal, from: entry.postponedFrom, date: entry.date }))
    .sort((a, b) => compareDates(a.date, b.date) || compareDates(a.from, b.from));
}

/** Ob ein Eintrag von selbst weitergerückt ist, weil er nicht als gekocht eingetragen war: dann gibt es „Doch gekocht“. */
export function isPostponedEntry(entry: PlanEntryRow): boolean {
  return isActive(entry) && entry.status !== 'cooked' && wasOverdue(entry);
}

/**
 * „Doch gekocht“: Das Gericht war an seinem Tag gekocht, nur nicht eingetragen. Es kommt auf den Tag zurück und gilt
 * als gekocht, die Zutaten gehen vom Vorrat ab. Was mit ihm weitergerückt ist, rückt zurück; andere nicht gekochte
 * Gerichte desselben Laufs rücken danach wieder weiter. Ohne Weiterrücken trägt es nur „gekocht“ ein.
 */
export function planCookedAfterAll(tables: ShoppingTables, entryId: string, today: string, hour: number, now: number): RowWrite[] {
  const entry = tables.planEntries[entryId];
  if (!entry || !isActive(entry)) return [];
  if (!wasOverdue(entry)) return planSetStatus(tables, entryId, 'cooked', now);

  // Derselbe Lauf, dieselbe Mahlzeit; von Hand Verschobenes gehört nicht mehr dazu, Gekochtes bleibt.
  const run = Object.entries(tables.planEntries).filter(
    ([id, row]) =>
      isActive(row) &&
      row.meal === entry.meal &&
      row.postponedAt === entry.postponedAt &&
      row.postponedFrom !== '' &&
      (id === entryId || row.status !== 'cooked'),
  );
  const back = run.map(([id, row]): RowWrite => ({ table: 'planEntries', rowId: id, cells: { date: row.postponedFrom, ...NOT_POSTPONED } }));

  const again = run.filter(([id, row]) => id !== entryId && wasOverdue(row)).map(([id]) => id);
  let forward: RowWrite[] = [];
  if (again.length > 0) {
    const restored: Record<string, PlanEntryRow> = { ...tables.planEntries };
    for (const [id, row] of run) restored[id] = { ...row, date: row.postponedFrom, ...NOT_POSTPONED };
    restored[entryId] = { ...restored[entryId]!, status: 'cooked' };
    forward = postpone({ ...tables, planEntries: restored }, again, postponeStart(today, hour), now);
  }
  return [...back, ...planSetStatus(tables, entryId, 'cooked', now), ...forward];
}

/** „Passt so“: Die Meldung verschwindet, die Gerichte bleiben, wo sie sind. */
export function planKeepPostponed(tables: PlanTables, entryIds: readonly string[]): RowWrite[] {
  const runs = new Set<number>();
  for (const id of entryIds) {
    const entry = tables.planEntries[id];
    if (entry && wasPostponed(entry)) runs.add(entry.postponedAt);
  }
  return Object.entries(tables.planEntries)
    .filter(([, entry]) => wasPostponed(entry) && runs.has(entry.postponedAt))
    .map(([id]): RowWrite => ({ table: 'planEntries', rowId: id, cells: { ...NOT_POSTPONED } }));
}
