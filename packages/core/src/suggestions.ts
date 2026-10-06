import { addDays, daysBetween, formatShortDate, weekday } from './dates.ts';
import { createFoodResolver, normalizeFoodName, type StockUnit } from './foods.ts';
import type { MealId } from './meals.ts';
import { listMembers, type MemberDiet } from './members.ts';
import { shelfLifeDays, stockStates, toStockAmount } from './pantry.ts';
import { purchaseSuggestions } from './pantry-bookings.ts';
import { createDietLookup, defaultOptionId, dietSuits, optionDiet, type PlanTables } from './plan.ts';
import { buildRecipeView, type IngredientItem } from './recipe.ts';
import { isRecipePaused, recipeMealIds } from './recipe-meals.ts';
import { isActive } from './rows.ts';
import { computeShoppingNeeds, type ShoppingTables } from './shopping.ts';

/**
 * Planvorschläge (M8): Jedes Rezept bekommt für einen Tag Punkte nach nachvollziehbaren Gründen, die der
 * Vorschlag auch nennt. Gerechnet wird mit dem freien Vorrat: Bestand und absehbarer Einkauf (offene Listen
 * mit ganzen Packungen), abzüglich dessen, was geplante Gerichte schon brauchen. Vorgeschlagen wird nur, was
 * zur Mahlzeit passt und nicht pausiert ist.
 */

export type SuggestionReasonKind =
  | 'unsuitable'
  | 'planned'
  | 'expiring'
  | 'leftover'
  | 'shopping'
  | 'favorite'
  | 'longAgo'
  | 'stock'
  | 'forAll';

export type SuggestionReason = { kind: SuggestionReasonKind; text: string };

export type Suggestion = { recipeId: string; title: string; photo: string; score: number; reasons: SuggestionReason[] };

/** Ein Gericht aus einem Entwurf, das noch nicht im Plan steht. */
export type DraftPick = { date: string; recipeId: string };

/** Unter der Woche gilt bis zu dieser Zeit als schnell; länger kostet ein wenig. */
const QUICK_MINUTES = 45;
/** So lange zählt ein Gericht als gerade erst gehabt. */
const RECENT_DAYS = 14;
/** Ab hier lohnt der Hinweis „zuletzt vor … Wochen“. */
const LONG_AGO_DAYS = 21;
/** Frisches, das bis dahin abläuft, nennt der Vorschlag mit den Tagen, die es noch hat. */
const EXPIRING_DAYS = 3;
const MAX_REASONS = 3;
/** Grundzutaten wie Butter oder Zucker stecken in vielen Rezepten; ein Rest davon macht kein Gericht interessanter. */
const BASIC_MIN_RECIPES = 5;
const BASIC_SHARE = 0.2;
/** Lieblingsessen kommen etwas öfter; Vorrat, der weg muss, geht trotzdem vor. */
const FAVORITE_BONUS = 1.5;
/** … aber dasselbe höchstens alle drei Wochen */
const FAVORITE_DAYS = 21;
/** Was höchstens so lange hält, verdirbt bald: Reste davon zählen viel. */
const PERISHABLE_DAYS = 14;
/** So weit sucht ein Entwurf höchstens nach freien Tagen. */
const MAX_LOOKAHEAD_DAYS = 90;

/** Am Titel erkennbar: Frühstück und Süßes passen selten als Mittag- oder Abendessen. */
const BREAKFAST_WORDS = ['pancake', 'waffel', 'porridge', 'müsli', 'granola', 'smoothie', 'frühstück', 'overnight', 'french toast'];
const SWEET_WORDS = ['kuchen', 'torte', 'muffin', 'cookie', 'keks', 'dessert', 'pudding', 'tiramisu', 'brownie', 'mousse'];
/** Herzhaftes, das nur nach Kuchen klingt */
const SAVORY_WORDS = ['flammkuchen', 'zwiebelkuchen', 'pfannkuchen', 'reibekuchen', 'kartoffelkuchen', 'gemüsekuchen', 'speckkuchen', 'lauchkuchen'];

type DishKind = 'breakfast' | 'sweet' | 'main';

/** Grundlagen, die Gerichte ähnlich machen: Zweimal Nudeln hintereinander ist langweilig. */
const FAMILIES: readonly (readonly [string, readonly string[]])[] = [
  [
    'Nudeln',
    [
      'nudel', 'pasta', 'spaghetti', 'penne', 'fusilli', 'farfalle', 'rigatoni', 'tagliatelle', 'linguine', 'lasagne',
      'makkaroni', 'maccheroni', 'tortellini', 'ravioli', 'gnocchi', 'spätzle', 'orecchiette', 'pappardelle',
    ],
  ],
  ['Reis', ['reis', 'risotto']],
  ['Kartoffeln', ['kartoffel']],
  ['Brot', ['brot', 'brötchen', 'baguette', 'tortilla', 'wrap', 'pita', 'naan']],
];

type Need = {
  foodId: string;
  name: string;
  amount: number;
  unit: string;
  /** Verdirbt bald (Gemüse, Kühlregal, Fleisch, Fisch, Brot; nicht Zwiebeln oder Kartoffeln): Reste davon zählen viel. */
  perishable: boolean;
  /** Grundzutat in vielen Rezepten, z. B. Zwiebeln: zählt wenig und wird nicht genannt. */
  basic: boolean;
};

type Candidate = {
  id: string;
  title: string;
  photo: string;
  minutes: number | null;
  /** Was es für alle Personen mit je einer Portion braucht; ohne „immer im Haus“ und ohne Mengenangabe. */
  needs: Need[];
  /** Grundlagen und Fleisch oder Fisch, an denen sich Ähnlichkeit zeigt. */
  families: Set<string>;
  /** Hinweis, wenn es nicht zu allen passt, die vegetarisch oder vegan essen: „nicht vegetarisch“ */
  unsuitable: string | null;
  /** Die Personen bekommen verschiedene Optionen („für beide“). */
  mixed: boolean;
  kind: DishKind;
  /** Mahlzeiten, zu denen es passt; `null`, solange niemand sie festgelegt hat (dann zählen Plan und Titel) */
  meals: MealId[] | null;
  pausedUntil: string;
  favorite: boolean;
};

/** Freier Vorrat eines Lebensmittels: Bestand (läuft bei Frischem ab) und was ein Einkauf noch bringt. */
type PoolEntry = { unit: StockUnit; stock: number; expiresOn: string | null; incoming: number };
type Pool = Map<string, PoolEntry>;

function buildCandidates(tables: ShoppingTables): Candidate[] {
  const resolver = createFoodResolver(tables);
  const dietOf = createDietLookup(tables);
  const members = listMembers(tables);
  const strict = members.filter((member) => member.diet !== 'omnivore');
  const candidates: Candidate[] = [];
  const usage = new Map<string, number>();
  for (const [id, row] of Object.entries(tables.recipes)) {
    if (!isActive(row)) continue;
    const view = buildRecipeView(tables, id);
    if (!view || view.servings <= 0) continue;
    const total = members.length > 0 ? members.length : view.servings;
    const sums = new Map<string, Need>();
    const families = new Set<string>();
    const used = new Set<string>();
    const add = (item: IngredientItem, factor: number) => {
      if (item.kind !== 'ingredient') return;
      const food = resolver.resolve(item.name);
      if (!food) return;
      used.add(food.id);
      const key = normalizeFoodName(item.name);
      for (const [family, words] of FAMILIES) if (words.some((word) => key.includes(word))) families.add(family);
      if (food.diet === 'meat' || food.diet === 'fish') families.add(food.id);
      const amount = item.amountMax ?? item.amount;
      // Was immer im Haus ist, ist da; ohne Menge („Salz“) zählt es nicht.
      if (amount === null || factor <= 0 || tables.foods[food.id]?.stock) return;
      const needKey = `${food.id}~${item.unit}`;
      const shelfLife = shelfLifeDays(food);
      const perishable = shelfLife !== null && shelfLife <= PERISHABLE_DAYS;
      const sum = sums.get(needKey) ?? { foodId: food.id, name: food.name, amount: 0, unit: item.unit, perishable, basic: false };
      sum.amount += amount * factor;
      sums.set(needKey, sum);
    };

    view.ingredients.forEach((item) => add(item, total / view.servings));
    let mixed = false;
    for (const group of view.groups) {
      // Jede Person bekommt ihre Option, wie beim Einplanen.
      const counts = new Map<string, number>();
      if (members.length === 0) counts.set(group.options[0]?.id ?? '', total);
      for (const member of members) {
        const optionId = defaultOptionId(group, member.diet, dietOf);
        counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
      }
      if (counts.size > 1) mixed = true;
      for (const option of group.options) option.ingredients.forEach((item) => add(item, (counts.get(option.id) ?? 0) / view.servings));
    }

    const fits = (diet: MemberDiet) =>
      view.ingredients.every((item) => item.kind !== 'ingredient' || dietSuits(dietOf(item.name), diet)) &&
      view.groups.every((group) => group.options.some((option) => dietSuits(optionDiet(option, dietOf), diet)));
    const unsuitable = strict.every((member) => fits(member.diet)) ? null : fits('vegetarian') ? 'nicht vegan' : 'nicht vegetarisch';
    for (const foodId of used) usage.set(foodId, (usage.get(foodId) ?? 0) + 1);
    const minutes = (row.prepMinutes ?? 0) + (row.cookMinutes ?? 0);
    const title = view.title.toLocaleLowerCase('de');
    const kind: DishKind = BREAKFAST_WORDS.some((word) => title.includes(word))
      ? 'breakfast'
      : SWEET_WORDS.some((word) => title.includes(word)) && !SAVORY_WORDS.some((word) => title.includes(word))
        ? 'sweet'
        : 'main';
    candidates.push({
      id,
      title: view.title,
      photo: view.photo,
      minutes: minutes > 0 ? minutes : null,
      needs: [...sums.values()],
      families,
      unsuitable,
      mixed,
      kind,
      meals: row.mealsBy ? recipeMealIds(row) : null,
      pausedUntil: row.pausedUntil ?? '',
      favorite: row.favorite ?? false,
    });
  }
  for (const candidate of candidates) {
    for (const need of candidate.needs) {
      const count = usage.get(need.foodId) ?? 0;
      need.basic = count >= BASIC_MIN_RECIPES && count / candidates.length >= BASIC_SHARE;
    }
  }
  return candidates;
}

/** Bestand und was offene Einkaufslisten bringen, in ganzen Packungen: Was davon übrig bleibt, ist frei. */
function basePool(tables: ShoppingTables, today: string): Pool {
  const pool: Pool = new Map();
  for (const [foodId, state] of stockStates(tables, today)) {
    if (state.level > 0) pool.set(foodId, { unit: state.unit, stock: state.level, expiresOn: state.expiresOn, incoming: 0 });
  }
  for (const [listId, list] of Object.entries(tables.shoppingLists)) {
    if (!isActive(list) || list.status !== 'open') continue;
    for (const item of purchaseSuggestions(tables, listId)) {
      if (item.amount === null || item.amount <= 0) continue;
      const entry = pool.get(item.foodId);
      if (!entry) {
        pool.set(item.foodId, { unit: item.unit, stock: 0, expiresOn: null, incoming: item.amount });
        continue;
      }
      const amount = toStockAmount(item.amount, item.unit, entry.unit);
      if (amount !== null) entry.incoming += amount;
    }
  }
  return pool;
}

/** Vergibt Vorrat an ein Gericht: erst den Bestand, dann den Einkauf. */
function reserve(pool: Pool, foodId: string, amount: number, unit: string): void {
  const entry = pool.get(foodId);
  const wanted = entry ? toStockAmount(amount, unit, entry.unit) : null;
  if (!entry || wanted === null) return;
  const fromStock = Math.min(entry.stock, wanted);
  entry.stock -= fromStock;
  entry.incoming = Math.max(0, entry.incoming - (wanted - fromStock));
}

function clonePool(pool: Pool): Pool {
  return new Map([...pool].map(([foodId, entry]) => [foodId, { ...entry }]));
}

/** Kleine, feste Streuung je Rezept und Tag: Gleichstände fallen jeden Tag anders aus, aber nicht bei jedem Aufruf. */
function jitter(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ((hash >>> 0) % 1000) / 1000 * 0.3;
}

function names(list: readonly string[]): string {
  return list.length > 2 ? `${list.slice(0, 2).join(', ')} …` : list.join(', ');
}

type Weighted = SuggestionReason & { weight: number };

/** Was über den Plan bekannt ist: Gerichte mit Tag, wofür ein Rezept bisher eingeplant war, wie viele essen mit. */
type Context = {
  today: string;
  meal: MealId;
  free: Pool;
  dated: readonly DraftPick[];
  byId: ReadonlyMap<string, Candidate>;
  /** Mahlzeiten, zu denen ein Rezept früher im Plan stand */
  meals: ReadonlyMap<string, ReadonlySet<MealId>>;
  memberCount: number;
};

/**
 * Passt das Gericht zur Mahlzeit, solange niemand das festgelegt hat? Erst nach dem Plan, sonst nach dem Titel.
 * Frühstück und Kuchen kommen als Mittag- oder Abendessen nur, wenn sonst nichts da ist.
 */
function mealFit(candidate: Candidate, meal: MealId, known: ReadonlySet<MealId> | undefined): number {
  if (known?.has(meal)) return 0.5;
  if (known && known.size > 0) return -2;
  if (meal === 'breakfast') return candidate.kind === 'breakfast' ? 2 : candidate.kind === 'sweet' ? 0.5 : -1;
  if (meal === 'snack') return candidate.kind === 'main' ? 0 : 1;
  return candidate.kind === 'main' ? 0 : -20;
}

function evaluate(candidate: Candidate, date: string, context: Context): Suggestion {
  const { today, free, dated, byId, memberCount } = context;
  let score = candidate.meals === null ? mealFit(candidate, context.meal, context.meals.get(candidate.id)) : 0;
  const reasons: Weighted[] = [];

  if (candidate.unsuitable) {
    score -= 20;
    reasons.push({ kind: 'unsuitable', text: candidate.unsuitable, weight: 100 });
  } else if (candidate.mixed) {
    reasons.push({ kind: 'forAll', text: memberCount === 2 ? 'für beide' : 'für alle', weight: 0.1 });
  }
  // Schon geplant, gerade erst gehabt oder lange nicht mehr?
  const same = dated.filter((entry) => entry.recipeId === candidate.id);
  // Lieblingsessen etwas öfter, aber nicht ständig und nicht zwei Tage hintereinander
  const favoriteNearby = dated.some(
    (entry) => entry.recipeId !== candidate.id && byId.get(entry.recipeId)?.favorite && Math.abs(daysBetween(entry.date, date)) <= 1,
  );
  if (candidate.favorite && !favoriteNearby && !same.some((entry) => Math.abs(daysBetween(entry.date, date)) < FAVORITE_DAYS)) {
    score += FAVORITE_BONUS;
    reasons.push({ kind: 'favorite', text: 'Lieblingsessen', weight: FAVORITE_BONUS });
  }
  const near = same.find((entry) => entry.date >= today && Math.abs(daysBetween(entry.date, date)) <= 6);
  if (near) {
    score -= 10;
    reasons.push({ kind: 'planned', text: `schon ${formatShortDate(near.date)} geplant`, weight: 90 });
  }
  const past = same.filter((entry) => entry.date < today).map((entry) => entry.date).sort();
  const last = past.at(-1);
  if (last) {
    const ago = daysBetween(last, date);
    if (ago < RECENT_DAYS) score -= 4 * (1 - ago / RECENT_DAYS);
    else if (ago >= LONG_AGO_DAYS) {
      const bonus = 1 + Math.min(1.5, past.length * 0.5);
      score += bonus;
      reasons.push({ kind: 'longAgo', text: `zuletzt vor ${Math.round(daysBetween(last, today) / 7)} Wochen`, weight: bonus });
    }
  }
  const similar = dated.some(
    (entry) =>
      entry.recipeId !== candidate.id &&
      Math.abs(daysBetween(entry.date, date)) <= 2 &&
      [...(byId.get(entry.recipeId)?.families ?? [])].some((family) => candidate.families.has(family)),
  );
  if (similar) score -= 2;

  // Was der freie Vorrat hergibt
  let missing = 0;
  const stocked: string[] = [];
  const leftovers: string[] = [];
  let stockWeight = 0;
  let leftoverWeight = 0;
  for (const need of candidate.needs) {
    const entry = free.get(need.foodId);
    const usable = entry && !(entry.expiresOn !== null && entry.expiresOn < date) ? entry.stock : 0;
    const available = usable + (entry?.incoming ?? 0);
    const wanted = entry ? toStockAmount(need.amount, need.unit, entry.unit) : null;
    const fraction = available <= 0 ? 0 : wanted === null ? 1 : Math.min(1, available / wanted);
    if (fraction < 1) missing++;
    if (!entry || fraction <= 0) continue;
    // Genannt wird nur, was sonst verdirbt und keine Grundzutat ist; Haltbares zählt wenig.
    const named = need.perishable && !need.basic;
    const scale = need.basic ? 0.2 : 1;
    if (usable > 0) {
      // Kurz vor dem Ablauf zählt alles viel und wird genannt, auch eine Grundzutat.
      const urgent = entry.expiresOn !== null && daysBetween(date, entry.expiresOn) <= 2;
      const weight = (urgent ? 6 : need.perishable ? 3 * scale : 0.3 * scale) * fraction;
      score += weight;
      if (!urgent && !named) continue;
      const days = entry.expiresOn === null ? null : daysBetween(today, entry.expiresOn);
      if (days !== null && days <= EXPIRING_DAYS) {
        const left = days <= 0 ? 'heute zuletzt' : `noch ${days} ${days === 1 ? 'Tag' : 'Tage'}`;
        reasons.push({ kind: 'expiring', text: `${need.name} · ${left}`, weight });
      } else {
        stocked.push(need.name);
        stockWeight += weight;
      }
    } else {
      // Was vom Einkauf übrig bleibt, etwa der Rest einer Packung
      const weight = (need.perishable ? 2 : 0.3) * fraction * scale;
      score += weight;
      if (named) {
        leftovers.push(need.name);
        leftoverWeight += weight;
      }
    }
  }
  if (leftovers.length > 0) reasons.push({ kind: 'leftover', text: `Rest vom Einkauf: ${names(leftovers)}`, weight: leftoverWeight });
  if (stocked.length > 0) reasons.push({ kind: 'stock', text: `aus dem Vorrat: ${names(stocked)}`, weight: stockWeight });
  if (candidate.needs.length > 0) {
    if (missing === 0) {
      score += 2;
      reasons.push({ kind: 'shopping', text: 'alles da', weight: 2 });
    } else if (missing <= 2 && missing < candidate.needs.length) {
      // Nur ein Bonus: Viele Zutaten sind kein Nachteil, solange nichts davon da ist.
      const bonus = missing === 1 ? 1 : 0.5;
      score += bonus;
      reasons.push({ kind: 'shopping', text: `nur ${missing} ${missing === 1 ? 'Zutat fehlt' : 'Zutaten fehlen'}`, weight: bonus });
    }
  }

  // Aufwand spielt nur eine kleine Rolle: unter der Woche lieber nicht zu lang.
  if (weekday(date) < 5 && candidate.minutes !== null && candidate.minutes > QUICK_MINUTES) score -= 0.5;
  score += jitter(`${candidate.id}~${date}`);

  return {
    recipeId: candidate.id,
    title: candidate.title,
    photo: candidate.photo,
    score: Math.round(score * 100) / 100,
    reasons: reasons
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_REASONS)
      .map(({ kind, text }) => ({ kind, text })),
  };
}

/** Tage, an denen für die Mahlzeit schon etwas im Plan steht, mit oder ohne Rezept */
function occupiedDays(tables: PlanTables, meal: MealId): Set<string> {
  const days = new Set<string>();
  for (const entry of Object.values(tables.planEntries)) if (isActive(entry) && entry.meal === meal) days.add(entry.date);
  return days;
}

/**
 * Tage für einen Entwurf mit `count` freien Tagen ab `start`. Belegte Tage davor fallen weg; belegte Tage
 * dazwischen bleiben drin, zählen aber nicht mit.
 */
export function draftDates(tables: PlanTables, start: string, count: number, meal: MealId): string[] {
  const occupied = occupiedDays(tables, meal);
  const dates: string[] = [];
  let free = 0;
  for (let offset = 0; free < count && offset < MAX_LOOKAHEAD_DAYS; offset++) {
    const date = addDays(start, offset);
    if (!occupied.has(date)) free++;
    else if (dates.length === 0) continue;
    dates.push(date);
  }
  return dates;
}

export type Planner = {
  /** Vorschläge für einen Tag, die besten zuerst; `picks` sind Gerichte eines Entwurfs, die noch nicht im Plan stehen. */
  suggest(date: string, options?: { picks?: readonly DraftPick[]; exclude?: readonly string[]; limit?: number }): Suggestion[];
  /** Entwurf für mehrere Tage: Jeder freie Tag bekommt das beste Gericht, das die Tage davor übrig lassen; belegte bleiben leer. */
  draft(dates: readonly string[]): DraftPick[];
};

/** Vorschläge für den Plan einer Mahlzeit, mit Blick auf Vorrat, geplante Gerichte und das, was ihr zuletzt hattet. */
export function createPlanner(tables: ShoppingTables, today: string, meal: MealId): Planner {
  const candidates = buildCandidates(tables);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const memberCount = listMembers(tables).length;
  const resolver = createFoodResolver(tables);
  const entries = Object.entries(tables.planEntries)
    .filter(([, entry]) => isActive(entry) && entry.recipeId)
    .map(([id, entry]) => ({ id, ...entry }));
  const dated: DraftPick[] = entries.map((entry) => ({ date: entry.date, recipeId: entry.recipeId }));
  const occupied = occupiedDays(tables, meal);
  const meals = new Map<string, Set<MealId>>();
  for (const entry of entries) {
    if (entry.date < today) meals.set(entry.recipeId, (meals.get(entry.recipeId) ?? new Set<MealId>()).add(entry.meal));
  }

  // Was geplante Gerichte brauchen, ist schon vergeben, das frühere zuerst.
  const pool = basePool(tables, today);
  const upcoming = entries.filter((entry) => entry.date >= today && entry.status !== 'cooked').sort((a, b) => a.date.localeCompare(b.date));
  for (const entry of upcoming) {
    for (const need of computeShoppingNeeds(tables, [entry.id], resolver)) {
      if (need.amount !== null) reserve(pool, need.foodId, need.amount, need.unit);
    }
  }

  const suggest: Planner['suggest'] = (date, { picks = [], exclude = [], limit = 5 } = {}) => {
    const free = clonePool(pool);
    for (const pick of picks) {
      for (const need of byId.get(pick.recipeId)?.needs ?? []) reserve(free, need.foodId, need.amount, need.unit);
    }
    const skip = new Set(exclude);
    return candidates
      .filter(
        (candidate) =>
          !skip.has(candidate.id) &&
          !isRecipePaused(candidate, date) &&
          (candidate.meals === null || candidate.meals.includes(meal)),
      )
      .map((candidate) => evaluate(candidate, date, { today, meal, free, dated: [...dated, ...picks], byId, meals, memberCount }))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'de'))
      .slice(0, limit);
  };

  return {
    suggest,
    draft(dates) {
      const picks: DraftPick[] = [];
      for (const date of dates) {
        if (occupied.has(date)) continue;
        const [best] = suggest(date, { picks, exclude: picks.map((pick) => pick.recipeId), limit: 1 });
        if (best) picks.push({ date, recipeId: best.recipeId });
      }
      return picks;
    },
  };
}
