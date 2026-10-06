import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';

import { NUTRIENTS, type NutritionLookupItem, type NutritionResult, type Per100 } from '@zauberjournal/core';

import blsData from './data/bls.json' with { type: 'json' };

/**
 * Nährwerte für die Lebensmittel des Haushalts (M6). Grundlebensmittel kommen aus dem Bundeslebensmittelschlüssel
 * (BLS, Max Rubner-Institut, CC BY 4.0; erzeugt mit scripts/create-bls-data.py). Für die REWE-Produkte des
 * Haushalts fragt der Server Open Food Facts per EAN (ODbL) und hält die Antworten vor. Welcher BLS-Eintrag zu
 * einer Zutat passt, sucht der Server über die Namen vor und lässt die KI wählen; ohne KI nimmt er den besten Treffer.
 */

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product';
const OFF_FIELDS = 'product_name,product_name_de,brands,nutriments';
/** Open Food Facts bittet darum, sich mit Namen und Kontakt zu melden. */
const OFF_USER_AGENT = 'Zauberjournal/1.0 (privates Haushalts-Kochbuch; https://github.com/langfeld/zauberjournal-app)';
const DAY = 24 * 60 * 60 * 1000;
/** Gefundene Produkte werden nach einem Monat aufgefrischt, nicht gefundene nach einer Woche neu gesucht. */
const OFF_TTL = 30 * DAY;
const OFF_MISSING_TTL = 7 * DAY;
const CANDIDATES = 12;
const SEARCH_RESULTS = 20;
const MAX_LOOKUP_ITEMS = 60;
const MAX_TEXT_LENGTH = 80;
const MODEL_TIMEOUT_MS = 120_000;

// ─── BLS ───

/** Kleinschreibung ohne Satzzeichen; Wörter mit Bindestrich („Sahne-Käsesauce“) gelten als ein Wort. */
function normalize(text: string): string {
  return text
    .toLocaleLowerCase('de')
    .replace(/ß/g, 'ss')
    .replace(/(?<=[a-zäöü])-(?=[a-zäöü])/g, '')
    .replace(/[^a-z0-9äöü]+/g, ' ')
    .trim();
}

/**
 * Einfache Mehrzahl und Endungen abschneiden, damit „Zwiebeln“ zu „Speisezwiebel“ und „rote“ zu „rot“ passt.
 * „-er“ bleibt: Butter, Zucker und Pfeffer enden einfach so.
 */
function stem(word: string): string {
  for (const suffix of ['en', 'n', 'e', 's']) {
    const rest = word.length - suffix.length;
    if (word.endsWith(suffix) && (rest >= 4 || (suffix === 'e' && rest >= 3))) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Zubereitet: Wer eine Zutat einkauft, meint meist das Rohe. */
const PREPARED = new Set([
  'gebraten', 'gekocht', 'gebacken', 'überbacken', 'frittiert', 'gegrillt', 'gedünstet', 'gedämpft', 'paniert', 'geröstet',
  'getrocknet', 'tiefgefroren', 'pulver',
]);

/** Danach folgt nur der Zusammenhang, nicht das Lebensmittel selbst. */
const CONTEXT_WORDS = new Set(['ohne', 'in']);

/** Endungen, die nur beugen: „Zwiebel“ → „Zwiebeln“, „rot“ → „rote“. */
const INFLECTIONS = new Set(['n', 'e', 'en', 'er', 'es', 's', 'ns', 'ern']);

/** Wörter, die nichts über das Lebensmittel sagen. */
const STOPWORDS = new Set(['und', 'oder', 'mit', 'ohne', 'in', 'frisch', 'frische', 'frischer', 'gehackt', 'fein', 'grob', 'bio', 'etwas']);

type Word = { raw: string; stem: string };

function words(text: string): Word[] {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
    .map((raw) => ({ raw, stem: stem(raw) }));
}

type BlsFood = { code: string; name: string; per100: Per100; words: Word[]; compact: string; dish: boolean };

const BLS_FOODS: BlsFood[] = (blsData.foods as (string | number | null)[][]).flatMap((row) => {
  const [code, name, ...values] = row as [string, string, ...(number | null)[]];
  // Ohne Energie taugt ein Eintrag nicht für die Berechnung.
  if (typeof values[0] !== 'number') return [];
  const per100 = Object.fromEntries(NUTRIENTS.map((key, index) => [key, values[index] ?? null])) as Per100;
  const normalized = normalize(name);
  // „(ohne Salz)“ ist kein Treffer für Salz, „Lachs in Öl“ keiner für Öl.
  const parts = normalized
    .split(' ')
    .filter((raw, index, all) => !CONTEXT_WORDS.has(raw) && !CONTEXT_WORDS.has(all[index - 1] ?? ''))
    .map((raw) => ({ raw, stem: stem(raw) }));
  return [{ code, name, per100, words: parts, compact: normalized.replace(/ /g, ''), dish: / mit /.test(` ${normalized} `) }];
});
const BLS_BY_CODE = new Map(BLS_FOODS.map((food) => [food.code, food]));

/**
 * Wie gut ein Wort der Zutat zu einem Wort des BLS-Namens passt. Bei zusammengesetzten Wörtern steht das
 * Kernwort hinten: „Speisezwiebel“ ist eine Zwiebel, „Zuckermais“ aber Mais und kein Zucker.
 */
function wordScore(query: Word, word: Word): number {
  if (word.raw === query.raw || word.stem === query.stem) return 10;
  // Nur gebeugt: „Zwiebeln“, „Linsen“ (aber nicht „salzig“)
  if (word.raw.startsWith(query.stem) && INFLECTIONS.has(word.raw.slice(query.stem.length))) return 9;
  if (word.raw.endsWith(query.stem) && query.stem.length >= 4) return 8;
  // Kurze Kernwörter: „Rapsöl“ ist Öl, „Hühnerei“ ein Ei.
  if (word.raw.endsWith(query.raw) && query.raw.length >= 2) return 6;
  // Die Zutat endet auf das BLS-Wort: „Basmatireis“ ist Reis, „Cherrytomaten“ sind Tomaten.
  if ((query.raw.endsWith(word.raw) || query.stem.endsWith(word.stem)) && word.stem.length >= 4) return 6;
  if (word.raw.startsWith(query.stem)) return 5;
  if (query.stem.length >= 4 && word.raw.includes(query.stem)) return 4;
  if (word.raw.length >= 4 && query.stem.startsWith(word.raw)) return 3;
  return 0;
}

/** Punkte für einen BLS-Eintrag; `null`, wenn kein Wort der Zutat darin vorkommt. */
function score(food: BlsFood, query: readonly Word[], compact: string): number | null {
  let total = 0;
  let matched = false;
  for (const part of query) {
    let best = 0;
    for (const word of food.words) best = Math.max(best, wordScore(part, word));
    if (best === 0 && part.stem.length >= 4 && food.compact.includes(part.stem)) best = 3;
    if (best > 0) matched = true;
    total += best || -6;
  }
  if (!matched) return null;
  if (compact.length >= 5 && food.compact.includes(compact)) total += 5;
  if (food.words.some((word) => word.raw === 'roh')) total += 2;
  for (const word of food.words) {
    if (PREPARED.has(word.raw) && !query.some((part) => part.raw === word.raw)) total -= 3;
  }
  // Zubereitete Gerichte („… mit …“) passen selten zu einer Zutat.
  if (food.dish) total -= 4;
  return total - Math.max(0, food.words.length - 4) * 0.5;
}

function rank(query: readonly Word[]): { food: BlsFood; score: number }[] {
  if (query.length === 0) return [];
  const compact = query.map((word) => word.stem).join('');
  return BLS_FOODS.flatMap((food) => {
    const points = score(food, query, compact);
    return points === null ? [] : [{ food, score: points }];
  }).sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length);
}

/**
 * BLS-Einträge, die nach dem Namen zu einer Zutat passen könnten, die besten zuerst. Bei mehreren Wörtern
 * („Salz und Pfeffer“) kommen auch die besten Treffer der einzelnen Wörter dazu.
 */
export function searchBls(query: string, limit = SEARCH_RESULTS): { food: BlsFood; score: number }[] {
  const parts = words(query);
  if (parts.length <= 1) return rank(parts).slice(0, limit);
  // Abwechselnd aus der Suche nach allem und nach jedem einzelnen Wort, damit jedes zum Zug kommt.
  const lists = [rank(parts), ...parts.map((part) => rank([part]))];
  const results: { food: BlsFood; score: number }[] = [];
  const seen = new Set<BlsFood>();
  for (let index = 0; results.length < limit && lists.some((list) => index < list.length); index++) {
    for (const list of lists) {
      const entry = list[index];
      if (!entry || seen.has(entry.food) || results.length >= limit) continue;
      seen.add(entry.food);
      results.push(entry);
    }
  }
  return results;
}

/** Ein Treffer gilt ohne KI nur, wenn alle Wörter der Zutat darin gut vorkommen. */
function confidentMatch(query: string): BlsFood | null {
  const parts = words(query);
  const [best] = rank(parts);
  return best && best.score >= parts.length * 6 ? best.food : null;
}

function blsResult(id: string, food: BlsFood, gramsPerPiece: number | null): NutritionResult {
  return { id, source: 'bls', code: food.code, label: food.name, per100: food.per100, gramsPerPiece, ean: '' };
}

// ─── Open Food Facts ───

type OffProduct = { label: string; per100: Per100 };

/** Pflichtangaben der Nährwerttabelle in der EU; Ballaststoffe sind freiwillig und fehlen oft. */
const REQUIRED = NUTRIENTS.filter((key) => key !== 'fiber');

/** Ob ein Produkt alle Pflichtangaben hat; sonst ist ein passender BLS-Eintrag die bessere Quelle. */
function isComplete(per100: Per100): boolean {
  return REQUIRED.every((key) => per100[key] !== null);
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

/**
 * Nährwerte je 100 g aus der Antwort von Open Food Facts; `null`, wenn Energie, Fett, Kohlenhydrate oder Eiweiß
 * fehlen. Dann ist der BLS die bessere Quelle. Fehlt nur ein Wert wie Ballaststoffe, bleibt er unbekannt.
 */
export function parseOffProduct(data: unknown): OffProduct | null {
  const product = isObject(data) ? data.product : undefined;
  if (!isObject(product) || !isObject(product.nutriments)) return null;
  const n = product.nutriments;
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) === null ? null : num(n['energy_100g'])! / 4.184);
  const values = {
    kcal,
    fat: num(n['fat_100g']),
    saturatedFat: num(n['saturated-fat_100g']),
    carbs: num(n['carbohydrates_100g']),
    sugar: num(n['sugars_100g']),
    fiber: num(n['fiber_100g']),
    protein: num(n['proteins_100g']),
    salt: num(n['salt_100g']),
  };
  if (kcal === null || values.fat === null || values.carbs === null || values.protein === null) return null;
  const name = [product.product_name_de, product.product_name].find((value) => typeof value === 'string' && value.trim());
  const brand = typeof product.brands === 'string' ? product.brands.split(',')[0]!.trim() : '';
  const label = [typeof name === 'string' ? name.trim() : 'Produkt', brand ? `(${brand})` : ''].filter(Boolean).join(' ');
  const per100 = Object.fromEntries(
    NUTRIENTS.map((key) => {
      const value = values[key];
      return [key, value === null ? null : Math.round(value * 10) / 10];
    }),
  ) as Per100;
  per100.kcal = Math.round(kcal);
  return { label, per100 };
}

// ─── KI ───

export type NutritionAiConfig = { apiKey: string; models: string[]; baseUrl: string };

const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'code', 'search', 'gramsPerPiece'],
        properties: {
          id: { type: 'string' },
          code: { type: ['string', 'null'] },
          search: { type: ['string', 'null'] },
          gramsPerPiece: { type: ['number', 'null'] },
        },
      },
    },
  },
};

const AI_SYSTEM = [
  'Du ordnest Zutaten aus deutschen Rezepten Einträgen des Bundeslebensmittelschlüssels (BLS) zu, damit eine Koch-App Nährwerte berechnen kann.',
  'Antworte ausschließlich mit JSON nach dem vorgegebenen Schema, mit genau einem Eintrag je Zutat.',
].join(' ');

const AI_TASK = [
  'Unter jeder Zutat stehen Kandidaten aus dem BLS (Code: Name).',
  'Wähle den Code, der dem Lebensmittel am besten entspricht, so wie man es einkauft: meist roh bzw. unverarbeitet,',
  'Konserven als Konserve, Gewürze, Soßen und Öle so, wie sie im Glas oder in der Flasche sind.',
  'Nennt eine Zutat mehrere Lebensmittel („Salz und Pfeffer“), nimm das wichtigste.',
  'Passt kein Kandidat, setze code = null und gib in search einen besseren Suchbegriff im Stil der BLS-Namen an,',
  'z. B. „Hühnerei roh“ für „Eier“ oder „Speisesalz“ für „Salz“. Sonst ist search null.',
  'gramsPerPiece: Steht eine Stück-Einheit dabei, das typische Gewicht in Gramm für 1 dieser Einheit, wie in Rezepten gemeint',
  '(1 Zwiebel etwa 80, 1 Ei etwa 60, 1 Zehe Knoblauch etwa 4, 1 Dose Kichererbsen etwa 240 abgetropft, 1 Dose Kokosmilch etwa 400,',
  '1 Kopf Romanasalat etwa 300, 1 Bund Petersilie etwa 30); ohne Stück-Einheit null.',
].join(' ');

type AiAnswer = { id: string; code: string | null; search: string | null; gramsPerPiece: number | null };

/** Was die KI für eine Zutat gewählt hat; `food: null` heißt, nichts passt. */
type AiMatch = { food: BlsFood | null; gramsPerPiece: number | null };

function stripCodeFence(content: string): string {
  return content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}

function readAiAnswer(content: string): AiAnswer[] {
  const data: unknown = JSON.parse(stripCodeFence(content));
  const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
  return items.filter(isObject).map((item) => ({
    id: typeof item.id === 'string' ? item.id : '',
    code: typeof item.code === 'string' && item.code ? item.code : null,
    search: typeof item.search === 'string' && item.search.trim() ? item.search.trim().slice(0, MAX_TEXT_LENGTH) : null,
    gramsPerPiece: num(item.gramsPerPiece) !== null && num(item.gramsPerPiece)! > 0 ? Math.round(num(item.gramsPerPiece)!) : null,
  }));
}

// ─── Zusammen ───

export type NutritionConfig = {
  db: DatabaseSync;
  ai?: NutritionAiConfig;
  fetch?: typeof fetch;
  now?: () => number;
  /** Pause zwischen zwei Anfragen an Open Food Facts. */
  pauseMs?: number;
  log?: (message: string) => void;
};

export function createNutrition({
  db,
  ai = { apiKey: '', models: [], baseUrl: '' },
  fetch: fetchImpl = fetch,
  now = Date.now,
  pauseMs = 300,
  log = console.warn,
}: NutritionConfig) {
  db.exec('CREATE TABLE IF NOT EXISTS off_cache (ean TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, body TEXT NOT NULL)');
  const readCache = db.prepare('SELECT fetched_at, body FROM off_cache WHERE ean = ?');
  const writeCache = db.prepare('INSERT OR REPLACE INTO off_cache (ean, fetched_at, body) VALUES (?, ?, ?)');
  const aiAvailable = ai.apiKey !== '' && ai.models.length > 0;

  /** Produkt bei Open Food Facts, aus dem Zwischenspeicher oder frisch; `null`, wenn es fehlt oder keine Werte hat. */
  const offProduct = async (ean: string): Promise<OffProduct | null> => {
    const cached = readCache.get(ean) as { fetched_at: number; body: string } | undefined;
    if (cached) {
      const product = cached.body ? (JSON.parse(cached.body) as OffProduct) : null;
      if (now() - cached.fetched_at < (product ? OFF_TTL : OFF_MISSING_TTL)) return product;
    }
    let product: OffProduct | null = null;
    try {
      const response = await fetchImpl(`${OFF_URL}/${encodeURIComponent(ean)}.json?fields=${OFF_FIELDS}`, {
        headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 404) product = null;
      else if (!response.ok) throw new Error(`HTTP ${response.status}`);
      else product = parseOffProduct(await response.json());
    } catch (error) {
      log(`Open Food Facts für ${ean} nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`);
      // Ein alter Stand ist besser als keiner; sonst beim nächsten Mal noch einmal versuchen.
      return cached?.body ? (JSON.parse(cached.body) as OffProduct) : null;
    }
    writeCache.run(ean, now(), product ? JSON.stringify(product) : '');
    await sleep(pauseMs);
    return product;
  };

  const askAi = async (prompt: string): Promise<AiAnswer[]> => {
    for (const model of ai.models) {
      try {
        const response = await fetchImpl(`${ai.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ai.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: AI_SYSTEM },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'zuordnung', strict: true, schema: AI_SCHEMA } },
            max_tokens: 8000,
          }),
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string') throw new Error('Antwort ohne Inhalt');
        return readAiAnswer(content);
      } catch (error) {
        log(`Nährwert-Zuordnung mit ${model} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return [];
  };

  const prompt = (items: readonly { item: NutritionLookupItem; query: string }[]): string =>
    [
      AI_TASK,
      ...items.map(({ item, query }) => {
        const unit = item.pieceUnit ? ` (Stück-Einheit: ${item.pieceUnit})` : '';
        const candidates = searchBls(query, CANDIDATES).map(({ food }) => `- ${food.code}: ${food.name}`);
        return `\nZutat id=${item.id}: „${item.name}“${unit}\n${candidates.length > 0 ? candidates.join('\n') : '- (keine Kandidaten)'}`;
      }),
    ].join('\n');

  /**
   * Wählt BLS-Einträge mit der KI, in bis zu zwei Runden. Was die KI nicht beantwortet (etwa weil sie ausfällt),
   * fehlt im Ergebnis.
   */
  const matchWithAi = async (items: readonly NutritionLookupItem[]): Promise<Map<string, AiMatch>> => {
    const found = new Map<string, AiMatch>();
    let round = items.map((item) => ({ item, query: item.name }));
    for (let attempt = 0; attempt < 2 && round.length > 0; attempt++) {
      const answers = await askAi(prompt(round));
      if (answers.length === 0) break;
      const next: typeof round = [];
      for (const { item } of round) {
        const answer = answers.find((entry) => entry.id === item.id);
        if (!answer) continue;
        const food = answer.code ? (BLS_BY_CODE.get(answer.code) ?? null) : null;
        const gramsPerPiece = answer.gramsPerPiece ?? found.get(item.id)?.gramsPerPiece ?? null;
        if (food || !answer.search || attempt === 1) found.set(item.id, { food, gramsPerPiece });
        else {
          found.set(item.id, { food: null, gramsPerPiece });
          next.push({ item, query: answer.search });
        }
      }
      round = next;
    }
    return found;
  };

  return {
    /**
     * Nährwerte für Lebensmittel: Open Food Facts über die EAN des REWE-Produkts, wenn es alle Pflichtangaben hat,
     * sonst ein BLS-Eintrag; gibt es keinen passenden, auch lückenhafte Werte des Produkts.
     * Lebensmittel ohne Treffer kommen mit `source: 'none'` zurück.
     */
    async lookup(items: readonly NutritionLookupItem[]): Promise<NutritionResult[]> {
      const products = new Map<string, OffProduct>();
      for (const item of items) {
        const product = item.ean ? await offProduct(item.ean) : null;
        if (product) products.set(item.id, product);
      }
      // Die KI ordnet zu, wofür Open Food Facts nichts Vollständiges hat, und schätzt Stückgewichte, wo Stück gebraucht werden.
      const open = items.filter((item) => {
        const product = products.get(item.id);
        return !product || !isComplete(product.per100) || item.pieceUnit;
      });
      const matched = aiAvailable && open.length > 0 ? await matchWithAi(open) : new Map<string, AiMatch>();
      return items.map((item): NutritionResult => {
        const product = products.get(item.id);
        const ai = matched.get(item.id);
        const gramsPerPiece = ai?.gramsPerPiece ?? null;
        const fromOff: NutritionResult | null = product
          ? { id: item.id, source: 'off', code: item.ean, label: product.label, per100: product.per100, gramsPerPiece, ean: item.ean }
          : null;
        if (fromOff && product && isComplete(product.per100)) return fromOff;
        // Ohne Antwort der KI hilft ein sicherer Treffer nach dem Namen.
        const food = ai ? ai.food : confidentMatch(item.name);
        if (food) return { ...blsResult(item.id, food, gramsPerPiece), ean: item.ean };
        if (fromOff) return fromOff;
        // Hat die KI gar nicht geantwortet, später noch einmal versuchen.
        const temporary = aiAvailable && !ai;
        return { id: item.id, source: 'none', code: '', label: '', per100: null, gramsPerPiece, ean: item.ean, temporary };
      });
    },

    /** BLS-Einträge zum Auswählen von Hand. */
    search(query: string): { code: string; name: string; per100: Per100 }[] {
      return searchBls(query).map(({ food }) => ({ code: food.code, name: food.name, per100: food.per100 }));
    },
  };
}

export type Nutrition = ReturnType<typeof createNutrition>;

/** Prüft die Anfrage der App; `null`, wenn etwas fehlt oder nicht passt. */
export function readLookupRequest(body: JsonObject): NutritionLookupItem[] | null {
  if (!Array.isArray(body.foods) || body.foods.length === 0 || body.foods.length > MAX_LOOKUP_ITEMS) return null;
  const items: NutritionLookupItem[] = [];
  for (const food of body.foods) {
    if (!isObject(food)) return null;
    const { id, name, ean, pieceUnit } = food;
    if (typeof id !== 'string' || !id || id.length > MAX_TEXT_LENGTH) return null;
    if (typeof name !== 'string' || !name.trim() || name.length > MAX_TEXT_LENGTH) return null;
    items.push({
      id,
      name: name.trim(),
      ean: typeof ean === 'string' && /^\d{8,14}$/.test(ean) ? ean : '',
      pieceUnit: typeof pieceUnit === 'string' ? pieceUnit.slice(0, 20) : '',
    });
  }
  return items;
}
