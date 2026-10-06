import type { ImportedRecipe } from '@zauberjournal/core';

import { plainText } from './html.ts';

type JsonObject = Record<string, unknown>;

const JSON_LD_SCRIPT = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
const ISO_DURATION =
  /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i;
const MAX_DEPTH = 8;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^<!--|-->$/g, '').replace(/^<!\[CDATA\[|\]\]>$/g, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    // Manche Seiten haben Zeilenumbrüche mitten in Zeichenketten; als Leerzeichen ist das gültiges JSON.
    try {
      return JSON.parse(cleaned.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return undefined;
    }
  }
}

function isRecipeType(type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  return types.some((entry) => typeof entry === 'string' && /(^|[/:])Recipe$/.test(entry));
}

function findRecipes(node: unknown, found: JsonObject[], depth = 0): JsonObject[] {
  if (depth > MAX_DEPTH) return found;
  if (Array.isArray(node)) {
    for (const item of node) findRecipes(item, found, depth + 1);
  } else if (isObject(node)) {
    if (isRecipeType(node['@type'])) {
      found.push(node);
    } else {
      for (const value of Object.values(node)) findRecipes(value, found, depth + 1);
    }
  }
  return found;
}

function text(value: unknown): string {
  if (typeof value === 'string') return plainText(value);
  if (typeof value === 'number') return String(value);
  return '';
}

/** Dauer im ISO-8601-Format wie „PT1H30M“ in Minuten; `null`, wenn sie fehlt oder 0 ist. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value === 'number') return value > 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) > 0 ? Number(trimmed) : null;
  const match = ISO_DURATION.exec(trimmed);
  if (!match) return null;
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => (part ? Number(part.replace(',', '.')) : 0));
  const total = Math.round(days! * 24 * 60 + hours! * 60 + minutes! + seconds! / 60);
  return total > 0 ? total : null;
}

function parseYield(value: unknown): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const servings = parseYield(item);
      if (servings !== null) return servings;
    }
    return null;
  }
  if (typeof value === 'number') return value > 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const match = /\d+/.exec(value);
  return match && Number(match[0]) > 0 ? Number(match[0]) : null;
}

function listOfTexts(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\r?\n/).map(text).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

type StepGroup = { section: string; steps: string[] };

/** Schritte, gruppiert nach Abschnitten (HowToSection); einzelne Schritte bilden eine Gruppe ohne Namen. */
function stepGroups(value: unknown, depth = 0): StepGroup[] {
  if (depth > MAX_DEPTH) return [];
  if (typeof value === 'string') {
    const withBreaks = value.replace(/<\/?(br|p|li|div)\b[^>]*>/gi, '\n');
    return [{ section: '', steps: withBreaks.split(/\r?\n/).map(text).filter(Boolean) }];
  }
  if (Array.isArray(value)) return value.flatMap((item) => stepGroups(item, depth + 1));
  if (!isObject(value)) return [];
  if (value.itemListElement !== undefined) {
    const steps = stepGroups(value.itemListElement, depth + 1).flatMap((group) => group.steps);
    return [{ section: text(value.name), steps }];
  }
  const step = text(value.text) || text(value.name);
  return step ? [{ section: '', steps: [step] }] : [];
}

/**
 * Zubereitung als Liste von Schritten. Der Name eines Abschnitts kommt vor dessen ersten Schritt,
 * außer er umfasst alle Schritte (z. B. ein einzelner Abschnitt „Zubereitung“).
 */
function instructions(value: unknown): string[] {
  const groups = stepGroups(value).filter((group) => group.steps.length > 0);
  return groups.flatMap(({ section, steps }) =>
    section && groups.length > 1 ? [`${section}: ${steps[0]}`, ...steps.slice(1)] : steps,
  );
}

function toImportedRecipe(node: JsonObject): ImportedRecipe {
  let prepMinutes = parseIsoDuration(node.prepTime);
  const cookMinutes = parseIsoDuration(node.cookTime);
  const totalMinutes = parseIsoDuration(node.totalTime);
  // Nur die Gesamtzeit bekannt: als Vorbereitung übernehmen, damit die Rezeptliste sie zeigt.
  if (prepMinutes === null && cookMinutes === null) prepMinutes = totalMinutes;

  return {
    title: text(node.name),
    description: text(node.description),
    servings: parseYield(node.recipeYield ?? node.yield),
    prepMinutes,
    cookMinutes,
    source: '',
    ingredients: listOfTexts(node.recipeIngredient ?? node.ingredients).map((line) => ({ section: '', text: line })),
    steps: instructions(node.recipeInstructions),
    notes: '',
    meals: null,
    uncertainties: [],
    vegetarian: null,
  };
}

/**
 * Sucht in einer HTML-Seite nach schema.org-Rezeptdaten (JSON-LD), wie sie die meisten Rezeptseiten mitliefern.
 * Stehen mehrere Rezepte auf der Seite (z. B. Empfehlungen), gewinnt das mit den meisten Zutaten und Schritten.
 * Liefert `null`, wenn die Seite keine Rezeptdaten mit Zutaten oder Schritten enthält.
 */
export function extractJsonLdRecipe(html: string): ImportedRecipe | null {
  const nodes: JsonObject[] = [];
  for (const match of html.matchAll(JSON_LD_SCRIPT)) findRecipes(parseJson(match[1] ?? ''), nodes);

  let best: ImportedRecipe | null = null;
  const size = (recipe: ImportedRecipe) => recipe.ingredients.length + recipe.steps.length;
  for (const node of nodes) {
    const recipe = toImportedRecipe(node);
    if (size(recipe) > (best ? size(best) : 0)) best = recipe;
  }
  return best;
}
