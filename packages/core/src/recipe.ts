import { formatIngredientLine, parseIngredientLine } from './ingredient-line.ts';
import type { MealId } from './meals.ts';
import { formatAmount, scaleAmount } from './quantity.ts';
import { recipeMealCells, recipeMealIds, type RecipeMealsBy } from './recipe-meals.ts';
import { activeSorted, changedCells, isActive, type CellValue, type RowWrite, type Table } from './rows.ts';
import { assignSortKeys } from './sort-keys.ts';
import { unitLabel } from './units.ts';

// ─── Zeilen, wie sie im Store liegen ───

export type IngredientKind = 'ingredient' | 'heading';

export type RecipeRow = {
  title: string;
  description: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string;
  notes: string;
  photo: string;
  /** Wozu das Rezept passt (seit M8), siehe `recipe-meals.ts` */
  mealBreakfast: boolean;
  mealLunch: boolean;
  mealDinner: boolean;
  mealSnack: boolean;
  mealsBy: RecipeMealsBy;
  /** Vor diesem Tag nicht vorschlagen; leer = keine Pause */
  pausedUntil: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type IngredientRow = {
  recipeId: string;
  optionId: string;
  sortKey: string;
  kind: IngredientKind;
  amount: number | null;
  amountMax: number | null;
  unit: string;
  name: string;
  note: string;
  deletedAt: number | null;
};

export type StepRow = {
  recipeId: string;
  optionId: string;
  sortKey: string;
  text: string;
  deletedAt: number | null;
};

export type ChoiceGroupRow = {
  recipeId: string;
  sortKey: string;
  name: string;
  deletedAt: number | null;
};

export type ChoiceOptionRow = {
  recipeId: string;
  groupId: string;
  sortKey: string;
  name: string;
  deletedAt: number | null;
};

export type RecipeTables = {
  recipes: Table<RecipeRow>;
  recipeIngredients: Table<IngredientRow>;
  recipeSteps: Table<StepRow>;
  choiceGroups: Table<ChoiceGroupRow>;
  choiceOptions: Table<ChoiceOptionRow>;
};

export type RecipeTableName = keyof RecipeTables;

// ─── Ansicht ───

export type IngredientItem = {
  id: string;
  kind: IngredientKind;
  amount: number | null;
  amountMax: number | null;
  unit: string;
  name: string;
  note: string;
};

export type StepItem = { id: string; text: string; optionId: string };

export type ChoiceOptionView = { id: string; name: string; ingredients: IngredientItem[] };

export type ChoiceGroupView = { id: string; name: string; options: ChoiceOptionView[] };

export type RecipeView = {
  id: string;
  title: string;
  description: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string;
  notes: string;
  /** ID des Rezeptfotos, leer = kein Foto. */
  photo: string;
  meals: MealId[];
  mealsBy: RecipeMealsBy;
  pausedUntil: string;
  ingredients: IngredientItem[];
  groups: ChoiceGroupView[];
  steps: StepItem[];
};

function toIngredientItem(id: string, row: IngredientRow): IngredientItem {
  return {
    id,
    kind: row.kind,
    amount: row.amount ?? null,
    amountMax: row.amountMax ?? null,
    unit: row.unit,
    name: row.name,
    note: row.note,
  };
}

function ingredientsOf(tables: RecipeTables, recipeId: string, optionId: string): IngredientItem[] {
  return activeSorted(tables.recipeIngredients, (row) => row.recipeId === recipeId && row.optionId === optionId).map(
    ([id, row]) => toIngredientItem(id, row),
  );
}

/** Liest ein Rezept samt Zutaten, Wahlkomponenten und Schritten; `undefined`, wenn es fehlt oder gelöscht ist. */
export function buildRecipeView(tables: RecipeTables, recipeId: string): RecipeView | undefined {
  const recipe = tables.recipes[recipeId];
  if (!recipe || !isActive(recipe)) return undefined;

  const groups = activeSorted(tables.choiceGroups, (row) => row.recipeId === recipeId).map(([groupId, group]) => ({
    id: groupId,
    name: group.name,
    options: activeSorted(tables.choiceOptions, (row) => row.groupId === groupId).map(([optionId, option]) => ({
      id: optionId,
      name: option.name,
      ingredients: ingredientsOf(tables, recipeId, optionId),
    })),
  }));

  return {
    id: recipeId,
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes ?? null,
    cookMinutes: recipe.cookMinutes ?? null,
    source: recipe.source,
    notes: recipe.notes,
    photo: recipe.photo ?? '',
    meals: recipeMealIds(recipe),
    mealsBy: recipe.mealsBy ?? '',
    pausedUntil: recipe.pausedUntil ?? '',
    ingredients: ingredientsOf(tables, recipeId, ''),
    groups,
    steps: activeSorted(tables.recipeSteps, (row) => row.recipeId === recipeId).map(([id, row]) => ({
      id,
      text: row.text,
      optionId: row.optionId,
    })),
  };
}

export type RecipeSummary = {
  id: string;
  title: string;
  servings: number;
  totalMinutes: number | null;
  optionNames: string[];
  photo: string;
  meals: MealId[];
  mealsBy: RecipeMealsBy;
  pausedUntil: string;
};

function normalizeForSearch(text: string): string {
  return text.toLocaleLowerCase('de').trim();
}

/** Rezeptliste, alphabetisch; die Suche prüft Titel, Zutaten und Optionen. */
export function listRecipes(tables: RecipeTables, query = ''): RecipeSummary[] {
  const needle = normalizeForSearch(query);
  const searchTexts = new Map<string, string[]>();
  const optionNames = new Map<string, string[]>();

  for (const row of Object.values(tables.recipeIngredients)) {
    if (isActive(row)) searchTexts.set(row.recipeId, [...(searchTexts.get(row.recipeId) ?? []), row.name]);
  }
  for (const [, row] of activeSorted(tables.choiceOptions, () => true)) {
    optionNames.set(row.recipeId, [...(optionNames.get(row.recipeId) ?? []), row.name]);
  }

  return Object.entries(tables.recipes)
    .filter(([, recipe]) => isActive(recipe))
    .filter(([id, recipe]) => {
      if (!needle) return true;
      const haystack = [recipe.title, ...(searchTexts.get(id) ?? []), ...(optionNames.get(id) ?? [])];
      return haystack.some((text) => normalizeForSearch(text).includes(needle));
    })
    .map(([id, recipe]) => {
      const minutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
      return {
        id,
        title: recipe.title,
        servings: recipe.servings,
        totalMinutes: minutes > 0 ? minutes : null,
        optionNames: optionNames.get(id) ?? [],
        photo: recipe.photo ?? '',
        meals: recipeMealIds(recipe),
        mealsBy: recipe.mealsBy ?? '',
        pausedUntil: recipe.pausedUntil ?? '',
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));
}

// ─── Anzeige mit Portionen ───

export type IngredientDisplay = {
  id: string;
  kind: IngredientKind;
  amount: string;
  unit: string;
  name: string;
  note: string;
};

/** Bereitet eine Zutat zur Anzeige auf, skaliert mit `factor` (gewünschte Portionen / Basisportionen). */
export function displayIngredient(item: IngredientItem, factor: number): IngredientDisplay {
  if (item.kind === 'heading') {
    return { id: item.id, kind: item.kind, amount: '', unit: '', name: item.name, note: '' };
  }
  const amount = item.amount === null ? null : scaleAmount(item.amount, factor, item.unit);
  const amountMax = item.amountMax === null ? null : scaleAmount(item.amountMax, factor, item.unit);
  const plural = (amountMax ?? amount ?? 0) > 1;
  return {
    id: item.id,
    kind: item.kind,
    amount: formatAmount(amount, amountMax, item.unit),
    unit: item.unit ? unitLabel(item.unit, plural) : '',
    name: item.name,
    note: item.note,
  };
}

/** Formatiert eine Dauer, z. B. 75 → „1 Std. 15 Min.“. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} Min.`;
  return rest === 0 ? `${hours} Std.` : `${hours} Std. ${rest} Min.`;
}

// ─── Verteilung der Portionen auf Optionen ───

/** Portionen je Option, gruppiert nach Wahlkomponente: `{ [groupId]: { [optionId]: Portionen } }`. */
export type Distribution = Record<string, Record<string, number>>;

/** Startverteilung: alle Portionen auf die erste Option jeder Wahlkomponente. */
export function createDistribution(groups: readonly ChoiceGroupView[], total: number): Distribution {
  return resizeDistribution({}, groups, total);
}

/**
 * Passt die Verteilung an eine neue Gesamtzahl an.
 * Mehr Portionen gehen an die erste Option, weniger werden von hinten abgezogen.
 */
export function resizeDistribution(
  distribution: Distribution,
  groups: readonly ChoiceGroupView[],
  total: number,
): Distribution {
  const result: Distribution = {};
  for (const group of groups) {
    const counts = group.options.map((option) => Math.max(0, distribution[group.id]?.[option.id] ?? 0));
    let sum = counts.reduce((a, b) => a + b, 0);
    if (counts.length > 0 && sum < total) {
      counts[0] = counts[0]! + (total - sum);
    }
    for (let i = counts.length - 1; i >= 0 && sum > total; i--) {
      const take = Math.min(counts[i]!, sum - total);
      counts[i] = counts[i]! - take;
      sum -= take;
    }
    result[group.id] = Object.fromEntries(group.options.map((option, i) => [option.id, counts[i]!]));
  }
  return result;
}

/**
 * Verschiebt eine Portion innerhalb einer Wahlkomponente.
 * `+1`: die Option bekommt eine Portion von der Option mit den meisten Portionen.
 * `-1`: die Option gibt eine Portion an die erste andere Option ab.
 */
export function shiftServing(
  distribution: Distribution,
  group: ChoiceGroupView,
  optionId: string,
  direction: 1 | -1,
): Distribution {
  const counts = { ...(distribution[group.id] ?? {}) };
  const others = group.options.filter((option) => option.id !== optionId);
  const own = counts[optionId] ?? 0;

  if (direction === 1) {
    let donor: string | undefined;
    for (const option of others) {
      const value = counts[option.id] ?? 0;
      if (value > 0 && (donor === undefined || value >= (counts[donor] ?? 0))) donor = option.id;
    }
    if (donor === undefined) return distribution;
    counts[donor] = (counts[donor] ?? 0) - 1;
    counts[optionId] = own + 1;
  } else {
    const recipient = others[0];
    if (!recipient || own <= 0) return distribution;
    counts[optionId] = own - 1;
    counts[recipient.id] = (counts[recipient.id] ?? 0) + 1;
  }
  return { ...distribution, [group.id]: counts };
}

// ─── Bearbeiten ───

export type IngredientDraft = { id: string; kind: IngredientKind; text: string };
export type StepDraft = { id: string; text: string; optionId: string };
export type ChoiceOptionDraft = { id: string; name: string; ingredients: IngredientDraft[] };
export type ChoiceGroupDraft = { id: string; name: string; options: ChoiceOptionDraft[] };

export type RecipeDraft = {
  title: string;
  description: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string;
  notes: string;
  photo: string;
  meals: MealId[];
  /** Leer, solange niemand die Mahlzeiten festgelegt hat; dann bleiben die gespeicherten. */
  mealsBy: RecipeMealsBy;
  ingredients: IngredientDraft[];
  groups: ChoiceGroupDraft[];
  steps: StepDraft[];
};

export function emptyRecipeDraft(): RecipeDraft {
  return {
    title: '',
    description: '',
    servings: 2,
    prepMinutes: null,
    cookMinutes: null,
    source: '',
    notes: '',
    photo: '',
    meals: [],
    mealsBy: '',
    ingredients: [],
    groups: [],
    steps: [],
  };
}

function toIngredientDraft(item: IngredientItem): IngredientDraft {
  return {
    id: item.id,
    kind: item.kind,
    text: item.kind === 'heading' ? item.name : formatIngredientLine(item),
  };
}

export function recipeViewToDraft(view: RecipeView): RecipeDraft {
  return {
    title: view.title,
    description: view.description,
    servings: view.servings,
    prepMinutes: view.prepMinutes,
    cookMinutes: view.cookMinutes,
    source: view.source,
    notes: view.notes,
    photo: view.photo,
    meals: view.meals,
    mealsBy: view.mealsBy,
    ingredients: view.ingredients.map(toIngredientDraft),
    groups: view.groups.map((group) => ({
      id: group.id,
      name: group.name,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        ingredients: option.ingredients.map(toIngredientDraft),
      })),
    })),
    steps: view.steps.map((step) => ({ id: step.id, text: step.text, optionId: step.optionId })),
  };
}

/** Prüft einen Entwurf vor dem Speichern; liefert Fehlermeldungen für die Oberfläche. */
export function validateRecipeDraft(draft: RecipeDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push('Bitte einen Titel eingeben.');
  if (!Number.isInteger(draft.servings) || draft.servings < 1) {
    errors.push('Die Portionenzahl muss eine ganze Zahl ab 1 sein.');
  }
  for (const group of draft.groups) {
    if (!group.name.trim()) errors.push('Jede Wahlkomponente braucht einen Namen.');
    if (group.options.length === 0) {
      errors.push(`Die Wahlkomponente „${group.name.trim() || 'ohne Namen'}“ braucht mindestens eine Option.`);
    }
    if (group.options.some((option) => !option.name.trim())) errors.push('Jede Option braucht einen Namen.');
  }
  return [...new Set(errors)];
}

function ingredientCells(item: IngredientDraft): Omit<IngredientRow, 'recipeId' | 'optionId' | 'sortKey' | 'deletedAt'> | null {
  if (item.kind === 'heading') {
    const name = item.text.trim();
    return name ? { kind: 'heading', amount: null, amountMax: null, unit: '', name, note: '' } : null;
  }
  const parsed = parseIngredientLine(item.text);
  return parsed ? { kind: 'ingredient', ...parsed } : null;
}

/**
 * Berechnet die Schreiboperationen, um einen Entwurf zu speichern.
 *
 * Es werden nur geänderte Zellen geschrieben; entfernte Einträge bekommen `deletedAt`.
 * Leere Zutaten und Schritte fallen weg. `recipeId` ist `null` für ein neues Rezept.
 */
export function planRecipeSave(
  tables: RecipeTables,
  recipeId: string | null,
  draft: RecipeDraft,
  now: number,
  createId: () => string,
): { recipeId: string; writes: RowWrite[] } {
  const id = recipeId ?? createId();
  const childWrites: RowWrite[] = [];

  const upsert = (table: RecipeTableName, rowId: string, desired: Record<string, CellValue>): RowWrite | null =>
    changedCells(table, rowId, tables[table][rowId], desired);
  const write = (table: RecipeTableName, rowId: string, desired: Record<string, CellValue>) => {
    const change = upsert(table, rowId, desired);
    if (change) childWrites.push(change);
  };
  const existingKey = (table: RecipeTableName, rowId: string): string | undefined => {
    const row = tables[table][rowId] as { sortKey?: string; deletedAt: number | null } | undefined;
    return row && isActive(row) ? row.sortKey : undefined;
  };
  const keysFor = (table: RecipeTableName, ids: string[]) => assignSortKeys(ids.map((rowId) => existingKey(table, rowId)));

  const kept = {
    choiceGroups: new Set<string>(),
    choiceOptions: new Set<string>(),
    recipeIngredients: new Set<string>(),
    recipeSteps: new Set<string>(),
  };

  const writeIngredients = (items: IngredientDraft[], optionId: string) => {
    const rows = items.flatMap((item) => {
      const cells = ingredientCells(item);
      return cells ? [{ id: item.id, cells }] : [];
    });
    const keys = keysFor('recipeIngredients', rows.map((row) => row.id));
    rows.forEach((row, index) => {
      kept.recipeIngredients.add(row.id);
      write('recipeIngredients', row.id, {
        recipeId: id,
        optionId,
        sortKey: keys[index]!,
        ...row.cells,
        deletedAt: null,
      });
    });
  };

  writeIngredients(draft.ingredients, '');

  const groupKeys = keysFor('choiceGroups', draft.groups.map((group) => group.id));
  draft.groups.forEach((group, groupIndex) => {
    kept.choiceGroups.add(group.id);
    write('choiceGroups', group.id, {
      recipeId: id,
      sortKey: groupKeys[groupIndex]!,
      name: group.name.trim(),
      deletedAt: null,
    });
    const optionKeys = keysFor('choiceOptions', group.options.map((option) => option.id));
    group.options.forEach((option, optionIndex) => {
      kept.choiceOptions.add(option.id);
      write('choiceOptions', option.id, {
        recipeId: id,
        groupId: group.id,
        sortKey: optionKeys[optionIndex]!,
        name: option.name.trim(),
        deletedAt: null,
      });
      writeIngredients(option.ingredients, option.id);
    });
  });

  const steps = draft.steps.filter((step) => step.text.trim());
  const stepKeys = keysFor('recipeSteps', steps.map((step) => step.id));
  steps.forEach((step, index) => {
    kept.recipeSteps.add(step.id);
    write('recipeSteps', step.id, {
      recipeId: id,
      optionId: kept.choiceOptions.has(step.optionId) ? step.optionId : '',
      sortKey: stepKeys[index]!,
      text: step.text.trim(),
      deletedAt: null,
    });
  });

  for (const table of ['choiceGroups', 'choiceOptions', 'recipeIngredients', 'recipeSteps'] as const) {
    for (const [rowId, row] of Object.entries(tables[table])) {
      if (row.recipeId === id && isActive(row) && !kept[table].has(rowId)) {
        childWrites.push({ table, rowId, cells: { deletedAt: now } });
      }
    }
  }

  const recipeDesired: Record<string, CellValue> = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    servings: draft.servings,
    prepMinutes: draft.prepMinutes,
    cookMinutes: draft.cookMinutes,
    source: draft.source.trim(),
    notes: draft.notes.trim(),
    photo: draft.photo,
    // Hat niemand Mahlzeiten festgelegt, bleibt, was inzwischen gespeichert ist, etwa von der KI.
    ...(draft.mealsBy ? recipeMealCells(draft.meals, draft.mealsBy) : {}),
    deletedAt: null,
  };
  if (!tables.recipes[id]) recipeDesired.createdAt = now;
  const recipeWrite = upsert('recipes', id, recipeDesired);

  if (!recipeWrite && childWrites.length === 0) return { recipeId: id, writes: [] };
  const recipeCells = { ...(recipeWrite?.cells ?? {}), updatedAt: now };
  return { recipeId: id, writes: [{ table: 'recipes', rowId: id, cells: recipeCells }, ...childWrites] };
}

/** Löscht ein Rezept weich; Zutaten und Schritte bleiben unverändert und hängen am gelöschten Rezept. */
export function planRecipeDelete(recipeId: string, now: number): RowWrite[] {
  return [{ table: 'recipes', rowId: recipeId, cells: { deletedAt: now, updatedAt: now } }];
}
