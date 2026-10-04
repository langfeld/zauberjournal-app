import type { FoodDiet } from './food-catalog.ts';
import { createFoodResolver, type FoodTables } from './foods.ts';
import { MEALS, type MealId } from './meals.ts';
import { listMembers, type MemberDiet, type MemberRow } from './members.ts';
import { buildRecipeView, type ChoiceGroupView, type ChoiceOptionView, type Distribution, type RecipeTables, type RecipeView } from './recipe.ts';
import { changedCells, isActive, type RowWrite, type Table } from './rows.ts';

export type PlanStatus = 'planned' | 'shopped' | 'cooked';

export type PlanEntryRow = {
  date: string;
  meal: MealId;
  /** Leer bei einem Eintrag ohne Rezept, z. B. „Reste“ oder „Essen gehen“. */
  recipeId: string;
  text: string;
  status: PlanStatus;
  shoppingListId: string;
  createdAt: number;
  deletedAt: number | null;
};

/** Wer isst mit. Leere `memberId` = Gäste. */
export type PlanEaterRow = { entryId: string; memberId: string; servings: number; deletedAt: number | null };

export type PlanChoiceRow = { eaterId: string; groupId: string; optionId: string };

export type PlanTables = RecipeTables &
  FoodTables & {
    members: Table<MemberRow>;
    planEntries: Table<PlanEntryRow>;
    planEaters: Table<PlanEaterRow>;
    planChoices: Table<PlanChoiceRow>;
  };

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  planned: 'geplant',
  shopped: 'eingekauft',
  cooked: 'gekocht',
};

/**
 * Esser und Wahlen haben feste IDs aus Eintrag, Person und Wahlkomponente.
 * So bearbeiten zwei Geräte dieselbe Zeile, statt doppelte anzulegen.
 */
export function eaterIdFor(entryId: string, memberId: string): string {
  return `${entryId}/${memberId || 'guests'}`;
}

export function choiceIdFor(eaterId: string, groupId: string): string {
  return `${eaterId}/${groupId}`;
}

/** Ernährungsklasse eines Zutatennamens, aus dem Lebensmittel-Katalog oder geschätzt. */
export type DietLookup = (ingredientName: string) => FoodDiet;

export function createDietLookup(tables: FoodTables): DietLookup {
  const { resolve } = createFoodResolver(tables);
  return (name) => resolve(name)?.diet ?? '';
}

const DIET_RANK: Record<FoodDiet, number> = { '': 0, vegan: 1, vegetarian: 2, fish: 3, meat: 4 };

/** Ernährungsklasse einer Option: die strengste ihrer Zutaten (Fleisch vor Fisch vor vegetarisch vor vegan). */
export function optionDiet(option: ChoiceOptionView, dietOf: DietLookup): FoodDiet {
  let result: FoodDiet = '';
  for (const item of option.ingredients) {
    if (item.kind !== 'ingredient') continue;
    const diet = dietOf(item.name);
    if (DIET_RANK[diet] > DIET_RANK[result]) result = diet;
  }
  return result;
}

function suits(diet: FoodDiet, member: MemberDiet): boolean {
  if (member === 'vegan') return diet === 'vegan' || diet === '';
  if (member === 'vegetarian') return diet !== 'meat' && diet !== 'fish';
  return true;
}

/** Automatische Wahl: Wer vegetarisch oder vegan isst, bekommt die erste passende Option, alle anderen die erste. */
export function defaultOptionId(group: ChoiceGroupView, diet: MemberDiet | 'guest', dietOf: DietLookup): string {
  if (diet === 'vegetarian' || diet === 'vegan') {
    const diets = group.options.map((option) => optionDiet(option, dietOf));
    let index = diets.findIndex((value) => suits(value, diet));
    if (index < 0 && diet === 'vegan') index = diets.findIndex((value) => suits(value, 'vegetarian'));
    if (index >= 0) return group.options[index]!.id;
  }
  return group.options[0]?.id ?? '';
}

export type EaterView = {
  id: string;
  /** Leer bei Gästen. */
  memberId: string;
  name: string;
  diet: MemberDiet | 'guest';
  servings: number;
  /** Option je Wahlkomponente; `chosen` = ausdrücklich gewählt, sonst automatisch. */
  choices: Record<string, { optionId: string; chosen: boolean }>;
};

export type PlanEntryView = {
  id: string;
  date: string;
  meal: MealId;
  recipeId: string;
  title: string;
  text: string;
  status: PlanStatus;
  shoppingListId: string;
  createdAt: number;
  recipe: RecipeView | undefined;
  /** Nur wer mitisst; Personen in ihrer Reihenfolge, Gäste zuletzt. */
  eaters: EaterView[];
  servings: number;
  /** Portionen je Option, wie in der Rezeptansicht. */
  distribution: Distribution;
};

/** Liest einen Planeintrag samt Essern und Optionen; `undefined`, wenn er fehlt oder gelöscht ist. */
export function buildPlanEntry(tables: PlanTables, entryId: string, dietOf: DietLookup): PlanEntryView | undefined {
  const row = tables.planEntries[entryId];
  if (!row || !isActive(row)) return undefined;
  const recipe = row.recipeId ? buildRecipeView(tables, row.recipeId) : undefined;
  const members = new Map(listMembers(tables).map((member, index) => [member.id, { ...member, index }]));

  const eaters = Object.entries(tables.planEaters)
    .filter(([, eater]) => eater.entryId === entryId && isActive(eater) && eater.servings > 0)
    .filter(([, eater]) => !eater.memberId || members.has(eater.memberId))
    .map(([id, eater]): EaterView & { order: number } => {
      const member = members.get(eater.memberId);
      const diet = member?.diet ?? 'guest';
      const choices: EaterView['choices'] = {};
      for (const group of recipe?.groups ?? []) {
        const stored = tables.planChoices[choiceIdFor(id, group.id)]?.optionId;
        choices[group.id] =
          stored && group.options.some((option) => option.id === stored)
            ? { optionId: stored, chosen: true }
            : { optionId: defaultOptionId(group, diet, dietOf), chosen: false };
      }
      return {
        id,
        memberId: eater.memberId,
        name: member?.name || 'Gäste',
        diet,
        servings: eater.servings,
        choices,
        order: member?.index ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...eater }) => eater);

  const distribution: Distribution = {};
  for (const group of recipe?.groups ?? []) {
    const counts: Record<string, number> = Object.fromEntries(group.options.map((option) => [option.id, 0]));
    for (const eater of eaters) {
      const optionId = eater.choices[group.id]?.optionId;
      if (optionId) counts[optionId] = (counts[optionId] ?? 0) + eater.servings;
    }
    distribution[group.id] = counts;
  }

  return {
    id: entryId,
    date: row.date,
    meal: row.meal,
    recipeId: row.recipeId,
    title: recipe?.title ?? (row.text || 'Gelöschtes Rezept'),
    text: row.text,
    status: row.status,
    shoppingListId: row.shoppingListId,
    createdAt: row.createdAt,
    recipe,
    eaters,
    servings: eaters.reduce((sum, eater) => sum + eater.servings, 0),
    distribution,
  };
}

const MEAL_ORDER = new Map(MEALS.map((meal, index) => [meal.id as string, index]));

/** Einträge von `from` bis einschließlich `to`, nach Tag, Mahlzeit und Anlagezeit. */
export function listPlanEntries(tables: PlanTables, from: string, to: string, dietOf: DietLookup): PlanEntryView[] {
  return Object.entries(tables.planEntries)
    .filter(([, row]) => isActive(row) && row.date >= from && row.date <= to)
    .flatMap(([id]) => {
      const entry = buildPlanEntry(tables, id, dietOf);
      return entry ? [entry] : [];
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (MEAL_ORDER.get(a.meal) ?? 0) - (MEAL_ORDER.get(b.meal) ?? 0) ||
        a.createdAt - b.createdAt,
    );
}

function portions(count: number): string {
  return `${count} ${count === 1 ? 'Portion' : 'Portionen'}`;
}

/** Kurzbeschreibung für den Plan, z. B. „2 Portionen · 1× Hähnchen, 1× Halloumi“. */
export function describePlanEntry(entry: PlanEntryView): string {
  if (!entry.recipe) return entry.recipeId ? 'Das Rezept wurde gelöscht.' : '';
  if (entry.servings === 0) return 'Niemand isst mit';
  const parts = [portions(entry.servings)];
  for (const group of entry.recipe.groups) {
    const chosen = group.options.filter((option) => (entry.distribution[group.id]?.[option.id] ?? 0) > 0);
    if (chosen.length === 1) parts.push(chosen[0]!.name);
    else if (chosen.length > 1) {
      parts.push(chosen.map((option) => `${entry.distribution[group.id]![option.id]}× ${option.name}`).join(', '));
    }
  }
  return parts.join(' · ');
}

// ─── Schreiben ───

export type NewPlanEntry = { date: string; meal: MealId; recipeId: string; text: string };

/**
 * Plant ein Gericht ein. Alle Personen des Haushalts essen mit je einer Portion mit;
 * ohne eingetragene Personen gibt es Gäste-Portionen in Höhe der Rezeptportionen.
 */
export function planAddEntry(
  tables: PlanTables,
  input: NewPlanEntry,
  now: number,
  createId: () => string,
): { entryId: string; writes: RowWrite[] } {
  const entryId = createId();
  const writes: RowWrite[] = [
    {
      table: 'planEntries',
      rowId: entryId,
      cells: { ...input, text: input.text.trim(), status: 'planned', shoppingListId: '', createdAt: now, deletedAt: null },
    },
  ];
  const members = listMembers(tables);
  const eaters = members.length > 0
    ? members.map((member) => ({ memberId: member.id, servings: 1 }))
    : [{ memberId: '', servings: input.recipeId ? (tables.recipes[input.recipeId]?.servings ?? 2) : 2 }];
  for (const { memberId, servings } of eaters) {
    writes.push({
      table: 'planEaters',
      rowId: eaterIdFor(entryId, memberId),
      cells: { entryId, memberId, servings, deletedAt: null },
    });
  }
  return { entryId, writes };
}

/** Portionen einer Person oder der Gäste; 0 heißt: isst nicht mit. */
export function planSetServings(
  tables: PlanTables,
  entryId: string,
  memberId: string,
  servings: number,
  now: number,
): RowWrite[] {
  const id = eaterIdFor(entryId, memberId);
  const existing = tables.planEaters[id];
  if (servings <= 0) return existing && isActive(existing) ? [{ table: 'planEaters', rowId: id, cells: { deletedAt: now } }] : [];
  const write = changedCells('planEaters', id, existing, { entryId, memberId, servings, deletedAt: null });
  return write ? [write] : [];
}

export function planChoose(tables: PlanTables, eaterId: string, groupId: string, optionId: string): RowWrite[] {
  const id = choiceIdFor(eaterId, groupId);
  const write = changedCells('planChoices', id, tables.planChoices[id], { eaterId, groupId, optionId });
  return write ? [write] : [];
}

export function planUpdateEntry(
  tables: PlanTables,
  entryId: string,
  cells: Partial<Pick<PlanEntryRow, 'date' | 'meal' | 'status' | 'text' | 'shoppingListId'>>,
): RowWrite[] {
  const write = changedCells('planEntries', entryId, tables.planEntries[entryId], cells);
  return write ? [write] : [];
}

export function planRemoveEntry(entryId: string, now: number): RowWrite[] {
  return [{ table: 'planEntries', rowId: entryId, cells: { deletedAt: now } }];
}
