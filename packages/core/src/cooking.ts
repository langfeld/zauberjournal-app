import { stemVariants } from './food-catalog.ts';
import { normalizeFoodName } from './foods.ts';
import { optionDiet, type DietLookup } from './plan.ts';
import type { Distribution, IngredientItem, RecipeView } from './recipe.ts';

/**
 * Kochmodus: die Schritte für die gewählten Optionen, je Schritt die Zutaten, die er nennt (mit Menge für die
 * Portionen), und die Zeitangaben, für die es einen Timer gibt („10 Minuten köcheln“).
 */

/** Ein Timer aus dem Schritttext, z. B. „10–15 Minuten“ → 600 Sekunden (bei Spannen die untere Grenze). */
export type StepTimer = { seconds: number; label: string };

/** Eine Zutat mit dem Faktor für ihre Menge (Portionen ÷ Rezeptportionen). */
export type ScaledIngredient = { item: IngredientItem; factor: number };

export type CookingStep = {
  id: string;
  text: string;
  /** Leer = für alle. */
  optionId: string;
  optionName: string;
  /** Portionen der Option; bei Schritten für alle die Portionen insgesamt. */
  servings: number;
  /** Zutaten, die der Schritt nennt, in der Reihenfolge des Rezepts. */
  ingredients: ScaledIngredient[];
  timers: StepTimer[];
};

// ─── Zeitangaben ───

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einer: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60,
  neunzig: 90, anderthalb: 1.5, eineinhalb: 1.5,
};

const NUMBER = `(\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')})`;
/** Zahl, optional als Spanne („10–15“, „10 bis 15“), dann die Einheit; davor kein Buchstabe und keine Ziffer. */
const DURATION = new RegExp(
  `(^|[^a-zäöüß0-9])${NUMBER}(?:\\s*(?:-|–|bis)\\s*${NUMBER})?\\s*(sekunden?|sek\\.?|minuten?|min\\.?|stunden?|std\\.?)(?![a-zäöüß])`,
  'g',
);
/** „eine halbe Stunde“, „eine Viertelstunde“, „Dreiviertelstunde“ */
const FRACTION = /(^|[^a-zäöüß])((?:eine[rn]?\s+)?(?:halben?\s+stunde|viertelstunde|dreiviertelstunde))(?![a-zäöüß])/g;

function unitSeconds(unit: string): number {
  if (unit.startsWith('sek')) return 1;
  if (unit.startsWith('min')) return 60;
  return 3600;
}

function numberValue(text: string): number {
  return NUMBER_WORDS[text] ?? Number(text.replace(',', '.'));
}

type Found = { start: number; end: number; seconds: number; hours: boolean };

/**
 * Zeitangaben in einem Schritt, für die sich ein Timer lohnt. Bei Spannen gilt die untere Grenze: Dann lieber
 * einmal nachsehen. „1 Std. 20 Min.“ ist eine Angabe; ohne Zahl („einige Minuten“) gibt es keinen Timer.
 */
export function findTimers(text: string): StepTimer[] {
  // Klein geschrieben bleiben die Positionen gleich; die Beschriftung kommt aus dem Original.
  const lower = text.toLocaleLowerCase('de');
  const found: Found[] = [];
  for (const match of lower.matchAll(DURATION)) {
    const start = match.index + match[1]!.length;
    const unit = match[4]!;
    found.push({ start, end: match.index + match[0].length, seconds: numberValue(match[2]!) * unitSeconds(unit), hours: unit.startsWith('st') });
  }
  for (const match of lower.matchAll(FRACTION)) {
    const phrase = match[2]!;
    const minutes = phrase.includes('dreiviertel') ? 45 : phrase.includes('viertel') ? 15 : 30;
    const start = match.index + match[1]!.length;
    found.push({ start, end: start + phrase.length, seconds: minutes * 60, hours: false });
  }
  found.sort((a, b) => a.start - b.start);

  // „1 Std. 20 Min.“ und „1 Stunde und 15 Minuten“ zusammenfassen
  const merged: Found[] = [];
  for (const entry of found) {
    const previous = merged.at(-1);
    if (previous?.hours && !entry.hours && /^\s*(und\s+)?$/.test(lower.slice(previous.end, entry.start))) {
      merged[merged.length - 1] = { ...previous, end: entry.end, seconds: previous.seconds + entry.seconds, hours: false };
    } else merged.push(entry);
  }

  const timers: StepTimer[] = [];
  for (const entry of merged) {
    const seconds = Math.round(entry.seconds);
    if (seconds < 10 || seconds > 12 * 3600 || timers.some((timer) => timer.seconds === seconds)) continue;
    timers.push({ seconds, label: text.slice(entry.start, entry.end).trim() });
  }
  return timers;
}

// ─── Zutaten im Schritt ───

/** Wortteile am Ende, die nur die Form beschreiben: „Hähnchenstreifen“ ist Hähnchen, „Knoblauchzehen“ Knoblauch. */
const CUTS = [
  'brustfilets', 'brustfilet', 'filets', 'filet', 'brust', 'keulen', 'keule', 'schenkel', 'streifen', 'stückchen', 'stücke',
  'würfel', 'scheiben', 'zehen', 'zehe', 'ringe', 'spalten', 'hälften', 'blätter',
];

function withoutCut(word: string): string {
  const cut = CUTS.find((suffix) => word.endsWith(suffix) && word.length - suffix.length >= 3);
  return cut ? word.slice(0, -cut.length) : word;
}

function forms(word: string): readonly string[] {
  return stemVariants(word);
}

/** Wörter eines Schritts, klein geschrieben. */
function stepWords(text: string): string[] {
  return text
    .toLocaleLowerCase('de')
    .split(/[^a-zäöüß]+/)
    .filter((word) => word.length >= 2);
}

/** Kopfwort eines Zutatennamens: das letzte Wort („rote Linsen“ → „linsen“). */
function headOf(name: string): string {
  return normalizeFoodName(name).split(' ').filter(Boolean).at(-1) ?? '';
}

function sameWord(word: string, head: string): boolean {
  const own = new Set(forms(word));
  return forms(head).some((form) => own.has(form));
}

function sameBase(word: string, head: string): boolean {
  const own = new Set(forms(withoutCut(word)));
  return forms(withoutCut(head)).some((form) => own.has(form));
}

/** „Öl“ meint „Olivenöl“, „Reis“ den „Basmatireis“, „Hack“ das „Rinderhackfleisch“. */
function endsWithWord(word: string, head: string): boolean {
  // Kurze Wortformen wie „de“ aus „den“ würden zu vielem passen.
  const own = forms(word).filter((part) => part.length >= 3 || part === 'öl');
  return forms(withoutCut(head)).some((form) => own.some((part) => form.length > part.length && form.endsWith(part)));
}

/**
 * Zutaten, die ein Schritt nennt. Je Wort zählt zuerst der gleiche Name, dann der gleiche ohne Form
 * („Hähnchenstreifen“ = „Hähnchenbrustfilet“), dann ein Name, der darauf endet („Öl“ = „Olivenöl“).
 */
export function mentionedIngredients(text: string, candidates: readonly ScaledIngredient[]): ScaledIngredient[] {
  const heads = candidates.map((candidate) => ({ candidate, head: headOf(candidate.item.name) })).filter(({ head }) => head);
  const found = new Set<ScaledIngredient>();
  for (const word of stepWords(text)) {
    for (const test of [sameWord, sameBase, endsWithWord]) {
      const matches = heads.filter(({ head }) => test(word, head));
      if (matches.length === 0) continue;
      for (const { candidate } of matches) found.add(candidate);
      break;
    }
  }
  return candidates.filter((candidate) => found.has(candidate));
}

// ─── Schritte ───

/**
 * Schritte für die gewünschten Portionen: Schritte einer Option nur, wenn jemand sie bekommt. Ein Schritt einer
 * Option nennt nur Zutaten der Basis und dieser Option; ein Schritt für alle auch die der gewählten Optionen.
 */
export function cookingSteps(view: RecipeView, servings: number, distribution: Distribution): CookingStep[] {
  const base: ScaledIngredient[] = view.ingredients
    .filter((item) => item.kind === 'ingredient')
    .map((item) => ({ item, factor: servings / view.servings }));
  const options = new Map<string, { name: string; servings: number; ingredients: ScaledIngredient[] }>();
  for (const group of view.groups) {
    for (const option of group.options) {
      const count = distribution[group.id]?.[option.id] ?? 0;
      if (count <= 0) continue;
      const ingredients = option.ingredients
        .filter((item) => item.kind === 'ingredient')
        .map((item) => ({ item, factor: count / view.servings }));
      options.set(option.id, { name: option.name, servings: count, ingredients });
    }
  }
  const everyOption = [...options.values()].flatMap((option) => option.ingredients);

  return view.steps.flatMap((step): CookingStep[] => {
    const option = step.optionId ? options.get(step.optionId) : undefined;
    if (step.optionId && !option) return [];
    const candidates = option ? [...base, ...option.ingredients] : [...base, ...everyOption];
    return [
      {
        id: step.id,
        text: step.text,
        optionId: step.optionId,
        optionName: option?.name ?? '',
        servings: option?.servings ?? servings,
        ingredients: mentionedIngredients(step.text, candidates),
        timers: findTimers(step.text),
      },
    ];
  });
}

/** Ob Fleisch oder Fisch und etwas Vegetarisches zugleich entstehen: dann eigene Pfanne und eigenes Brett. */
export function needsSeparatePans(view: RecipeView, distribution: Distribution, dietOf: DietLookup): boolean {
  let animal = false;
  let plant = false;
  for (const group of view.groups) {
    for (const option of group.options) {
      if ((distribution[group.id]?.[option.id] ?? 0) <= 0) continue;
      const diet = optionDiet(option, dietOf);
      if (diet === 'meat' || diet === 'fish') animal = true;
      else plant = true;
    }
  }
  return animal && plant;
}
