import { createFoodResolver } from './foods.ts';
import { formatIngredientLine, parseIngredientLine } from './ingredient-line.ts';
import type { RecipeDraft, RecipeTables } from './recipe.ts';
import { importedRecipeToDraft, type ImportedRecipe } from './recipe-import.ts';
import { addReweFavorites } from './rewe-shopping.ts';
import { isActive, type RowWrite } from './rows.ts';
import type { ShoppingTables } from './shopping.ts';
import { findUnit } from './units.ts';

/**
 * Übernahme aus dem alten Zauberjournal (Stufe M7): Rezepte und REWE-Vorlieben aus dessen JSON-Export.
 * Hier steht nur die Umrechnung; Fotos, Sync und Server erledigt `apps/server/src/import-legacy.ts`.
 * Kategorien, Schwierigkeit, Favoriten-Markierung und Kochzeiten je Schritt gibt es in der App nicht;
 * sie fallen weg.
 */

export type LegacyIngredient = {
  name: string;
  amount: number | null;
  unit: string;
  /** Zwischenüberschrift im alten System; meist der Titel des Schritts, in dem die Zutat gebraucht wird. */
  group: string;
  order: number;
  optional: boolean;
  note: string;
};

/** Ein Rezept aus dem alten Export, mit den Feldern, die übernommen werden. */
export type LegacyRecipe = {
  title: string;
  description: string;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string;
  notes: string;
  /** Angelegt am, in Millisekunden; `null`, wenn unbekannt. */
  createdAt: number | null;
  ingredients: LegacyIngredient[];
  steps: { title: string; text: string }[];
  /** Foto als Base64, im alten System meist WebP. */
  image: { base64: string; mime: string } | null;
};

/** Ein bevorzugtes REWE-Produkt aus dem alten System; `timesSelected` zählt, wie oft es gewählt wurde. */
export type LegacyRewePreference = {
  ingredient: string;
  productId: string;
  name: string;
  /** Preis einer Packung in Cent, Stand des Exports. */
  price: number;
  grammage: string;
  timesSelected: number;
};

export type LegacyExport = { kind: 'recipes'; recipes: LegacyRecipe[] } | { kind: 'rewe'; preferences: LegacyRewePreference[] };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

/** Zahl größer 0, sonst `null`; im alten System steht 0 oft für „keine Angabe“. */
function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** „2026-03-08 08:07:00“ in Ortszeit. */
function timestamp(value: unknown): number | null {
  const parsed = Date.parse(text(value).replace(' ', 'T'));
  return Number.isNaN(parsed) ? null : parsed;
}

function readRecipe(value: Json): LegacyRecipe {
  const ingredients = (Array.isArray(value.ingredients) ? value.ingredients : []).filter(isObject).map(
    (item, index): LegacyIngredient => ({
      name: text(item.name),
      amount: positive(item.amount),
      unit: text(item.unit),
      group: text(item.group_name),
      order: typeof item.sort_order === 'number' ? item.sort_order : index,
      optional: item.is_optional === 1 || item.is_optional === true,
      note: text(item.notes),
    }),
  );
  const steps = (Array.isArray(value.steps) ? value.steps : [])
    .filter(isObject)
    .sort((a, b) => (Number(a.step_number) || 0) - (Number(b.step_number) || 0))
    .map((step) => ({ title: text(step.title), text: text(step.instruction) }));
  const base64 = text(value.image_base64);
  return {
    title: text(value.title),
    description: text(value.description),
    servings: positive(value.servings),
    prepMinutes: positive(value.prep_time),
    cookMinutes: positive(value.cook_time),
    source: text(value.source_url),
    notes: text(value.notes),
    createdAt: timestamp(value.created_at),
    ingredients: ingredients.filter((item) => item.name),
    steps: steps.filter((step) => step.text),
    image: base64 ? { base64, mime: text(value.image_mime) || 'image/webp' } : null,
  };
}

function readPreference(value: Json): LegacyRewePreference {
  return {
    ingredient: text(value.ingredient_name),
    productId: text(value.rewe_product_id),
    name: text(value.rewe_product_name),
    price: typeof value.rewe_price === 'number' && Number.isFinite(value.rewe_price) ? Math.round(value.rewe_price) : 0,
    grammage: text(value.rewe_package_size),
    timesSelected: typeof value.times_selected === 'number' ? value.times_selected : 0,
  };
}

/** Liest eine Exportdatei des alten Zauberjournals: Rezepte oder REWE-Vorlieben; `null`, wenn sie nicht passt. */
export function readLegacyExport(data: unknown): LegacyExport | null {
  if (!isObject(data)) return null;
  if (data.type === 'rewe-preferences' && Array.isArray(data.preferences)) {
    const preferences = data.preferences.filter(isObject).map(readPreference);
    return { kind: 'rewe', preferences: preferences.filter((entry) => entry.ingredient && entry.productId && entry.name) };
  }
  if (Array.isArray(data.recipes)) {
    return { kind: 'recipes', recipes: data.recipes.filter(isObject).map(readRecipe).filter((recipe) => recipe.title) };
  }
  return null;
}

// ─── Rezepte ───

function ingredientLine(item: LegacyIngredient): string {
  const note = [item.optional ? 'optional' : '', item.note].filter(Boolean).join(', ');
  const unit = item.unit ? (findUnit(item.unit)?.id ?? item.unit) : '';
  return formatIngredientLine({ amount: item.amount, amountMax: null, unit, name: item.name, note });
}

/** Der Titel eines Schritts steht vorn, damit Schritte und Zwischenüberschriften der Zutaten zusammenpassen. */
function stepText(step: { title: string; text: string }): string {
  const startsWithTitle = step.text.toLocaleLowerCase('de').startsWith(step.title.toLocaleLowerCase('de'));
  return step.title && !startsWithTitle ? `${step.title}: ${step.text}` : step.text;
}

/**
 * Das Rezept als Import, wie ihn auch die KI liefert. Die Zutaten stehen in der Reihenfolge der
 * Schritte, zu denen ihre Gruppe gehört; Gruppen werden Zwischenüberschriften, außer es gibt nur eine.
 */
export function legacyRecipeToImported(recipe: LegacyRecipe): ImportedRecipe {
  const stepIndex = new Map(recipe.steps.map((step, index) => [step.title, index] as const));
  const firstSeen = new Map<string, number>();
  recipe.ingredients.forEach((item, index) => {
    if (!firstSeen.has(item.group)) firstSeen.set(item.group, index);
  });
  const rank = (group: string) => stepIndex.get(group) ?? recipe.steps.length + firstSeen.get(group)!;
  const ingredients = [...recipe.ingredients].sort((a, b) => rank(a.group) - rank(b.group) || a.order - b.order);
  const sections = new Set(ingredients.map((item) => item.group));
  return {
    title: recipe.title,
    description: recipe.description,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    source: recipe.source,
    ingredients: ingredients.map((item) => ({ section: sections.size > 1 ? item.group : '', text: ingredientLine(item) })),
    steps: recipe.steps.map(stepText),
    notes: recipe.notes,
    uncertainties: [],
    vegetarian: null,
  };
}

/** Entwurf zum Speichern mit `planRecipeSave`; das Foto setzt das Werkzeug, sobald es hochgeladen ist. */
export function legacyRecipeDraft(recipe: LegacyRecipe, createId: () => string): RecipeDraft {
  return importedRecipeToDraft(legacyRecipeToImported(recipe), createId);
}

/** Zutatennamen, wie sie nach dem Speichern im Rezept stehen. */
export function legacyIngredientNames(recipe: LegacyRecipe): string[] {
  return recipe.ingredients.flatMap((item) => parseIngredientLine(ingredientLine(item))?.name ?? []);
}

/** Gibt es schon ein Rezept mit diesem Titel? Dann wird es nicht noch einmal übernommen. */
export function hasRecipeTitled(tables: RecipeTables, title: string): boolean {
  const wanted = title.trim().toLocaleLowerCase('de');
  return Object.values(tables.recipes).some((recipe) => isActive(recipe) && recipe.title.trim().toLocaleLowerCase('de') === wanted);
}

// ─── REWE-Vorlieben ───

/**
 * Merkt sich die bevorzugten REWE-Produkte je Lebensmittel, die am häufigsten gewählten zuerst, hinter
 * den schon gemerkten. `recipeIngredients` sind die Zutaten der übernommenen Rezepte: Sie werden zuerst
 * zugeordnet, damit z. B. „ei“ beim Lebensmittel „Eier“ landet. Neu angelegt werden nur Lebensmittel,
 * die ein gemerktes Produkt bekommen.
 */
export function legacyFavoriteWrites(
  tables: ShoppingTables,
  preferences: readonly LegacyRewePreference[],
  recipeIngredients: readonly string[],
): { writes: RowWrite[]; foods: number; products: number } {
  const resolver = createFoodResolver(tables);
  for (const name of recipeIngredients) resolver.resolve(name);
  const byFood = new Map<string, LegacyRewePreference[]>();
  for (const preference of preferences) {
    const food = resolver.resolve(preference.ingredient);
    if (food) byFood.set(food.id, [...(byFood.get(food.id) ?? []), preference]);
  }

  const favoriteWrites: RowWrite[] = [];
  let products = 0;
  for (const [foodId, list] of byFood) {
    const ranked = [...list].sort((a, b) => b.timesSelected - a.timesSelected);
    const writes = addReweFavorites(
      tables,
      foodId,
      ranked.map(({ productId, name, price, grammage }) => ({ productId, name, imageUrl: '', price, grammage })),
    );
    products += writes.filter((write) => !tables.reweFavorites[write.rowId]).length;
    favoriteWrites.push(...writes);
  }
  const foodWrites = resolver.newFoodWrites().filter((write) => byFood.has(write.rowId));
  return { writes: [...foodWrites, ...favoriteWrites], foods: byFood.size, products };
}
