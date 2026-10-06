import { IMPORT_LIMITS, MEAL_IDS, type ImportedRecipe, type VegetarianSuggestion } from '@zauberjournal/core';

import { htmlToText } from './html.ts';
import { extractJsonLdRecipe } from './json-ld.ts';

export const DEFAULT_IMPORT_MODEL = 'anthropic/claude-sonnet-5-5';
export const DEFAULT_FALLBACK_MODEL = 'google/gemini-3.6-flash';
export const REQUESTY_BASE_URL = 'https://router.requesty.ai/v1';

const MODEL_TIMEOUT_MS = 75_000;
const PAGE_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 3_000_000;
const MAX_PAGE_TEXT = 40_000;
const MAX_IMAGE_BASE64 = 8_000_000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.6',
};

export type ImportImage = { data: string; mimeType: string };
export type ImportRequest = { images: ImportImage[]; text: string; url: string; suggestVegetarian: boolean };

export type ImporterConfig = {
  /** Requesty-Schlüssel; ohne ihn gehen nur Links mit schema.org-Rezeptdaten. */
  apiKey: string;
  /** Modelle in der Reihenfolge, in der sie versucht werden; die weiteren sind der Fallback. */
  models: string[];
  baseUrl?: string;
  fetch?: typeof fetch;
  log?: (message: string) => void;
};

export class ImportError extends Error {
  readonly status: 400 | 422 | 502 | 503;

  constructor(message: string, status: 400 | 422 | 502 | 503) {
    super(message);
    this.status = status;
  }
}

type JsonObject = Record<string, unknown>;
type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Prüft den Body von `POST /api/import`. */
export function readImportRequest(body: unknown): ImportRequest {
  const data = isObject(body) ? body : {};
  const rawImages = Array.isArray(data.images) ? data.images : [];
  if (rawImages.length > IMPORT_LIMITS.images) {
    throw new ImportError(`Höchstens ${IMPORT_LIMITS.images} Bilder auf einmal.`, 400);
  }
  const images = rawImages.map((image): ImportImage => {
    const valid =
      isObject(image) &&
      typeof image.data === 'string' &&
      image.data.length > 0 &&
      image.data.length <= MAX_IMAGE_BASE64 &&
      typeof image.mimeType === 'string' &&
      IMAGE_TYPES.includes(image.mimeType);
    if (!valid) throw new ImportError('Ein Bild ist zu groß oder hat ein unbekanntes Format.', 400);
    return { data: image.data as string, mimeType: image.mimeType as string };
  });

  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (text.length > IMPORT_LIMITS.textLength) throw new ImportError('Der Text ist zu lang.', 400);

  const url = typeof data.url === 'string' ? data.url.trim() : '';
  if (url && (url.length > IMPORT_LIMITS.urlLength || !/^https?:\/\/\S+$/i.test(url))) {
    throw new ImportError('Der Link muss mit http:// oder https:// beginnen.', 400);
  }

  if (images.length === 0 && !text && !url) {
    throw new ImportError('Bitte ein Foto, einen Link oder einen Text angeben.', 400);
  }
  return { images, text, url, suggestVegetarian: data.suggestVegetarian === true };
}

const SYSTEM_PROMPT = `Du überträgst Rezepte aus Fotos, Screenshots, Webseiten oder Text in ein festes JSON-Format für eine deutsche Kochbuch-App.

Regeln:
- Übernimm das Rezept vollständig und so, wie es in der Vorlage steht. Erfinde nichts dazu; nur der vegetarische Vorschlag (siehe unten) ist eigene Arbeit.
- Schreib alles auf Deutsch. Übersetze fremdsprachige Rezepte und rechne amerikanische Maße (cups, oz, lb, °F) in g, ml und °C um.
- "title": der Name des Gerichts, ohne Zusätze wie „Rezept“ oder den Namen der Website.
- Zutaten: eine Zutat pro Eintrag in "text", im Format „Menge Einheit Zutat, Zusatz“, z. B. „200 g Mehl“, „2 EL Olivenöl“, „1 Zwiebel, fein gewürfelt“, „2–3 Zehen Knoblauch“, „1 Prise Salz“, „Pfeffer“. Einheiten: g, kg, ml, l, EL, TL, Prise, Stück, Zehe, Bund, Dose, Becher, Packung, Scheibe, Handvoll. Brüche als ½, ¼ oder ¾, Dezimalzahlen mit Komma.
- Zwischenüberschriften der Zutatenliste (z. B. „Für das Dressing“) gehören in "section" jeder zugehörigen Zutat; ohne Überschrift bleibt "section" leer.
- Schritte: ganze Sätze ohne Nummerierung, ein Arbeitsschritt pro Eintrag, in der Reihenfolge der Vorlage. Lange Absätze darfst du in sinnvolle Schritte teilen.
- Portionen und Zeiten in Minuten nur angeben, wenn sie in der Vorlage stehen oder eindeutig ableitbar sind, sonst 0. Fehlt die Portionenzahl, schätze sie und vermerke das in "uncertainties".
- "source": die Quelle, falls sie in der Vorlage erkennbar ist (z. B. Buchtitel und Seitenzahl), sonst leer.
- "notes": Tipps, Varianten oder Hinweise aus der Vorlage, die weder Zutat noch Schritt sind, sonst leer.
- "meals": wozu das Gericht passt, eins oder mehrere von "breakfast" (Frühstück), "lunch" (Mittagessen), "dinner" (Abendessen) und "snack" (Snack, auch Kuchen, Gebäck und Desserts). Hauptgerichte passen meist zu Mittag- und Abendessen. Beilagen, Saucen, Dips, Getränke und Grundrezepte wie Teig oder Brühe sind kein eigenes Gericht: leere Liste.
- "uncertainties": kurze Hinweise auf Stellen, die du nicht sicher lesen konntest oder geschätzt hast, z. B. „Menge Zucker schlecht lesbar (100 oder 180 g?)“. Leer, wenn alles klar ist.
- Ist in der Vorlage kein Rezept zu finden, gib leere Listen für Zutaten und Schritte zurück.

Vegetarischer Vorschlag ("vegetarian"):
- Nur wenn er gewünscht ist und das Rezept Fleisch oder Fisch enthält: "needed" = true. Sonst "needed" = false, leere Texte und leere Listen.
- Der Haushalt kocht gemeinsam: Eine Person isst vegetarisch, die andere bekommt das Original. Die Fleisch- oder Fischzutaten werden deshalb zu einer Option, die vegetarische Variante zu einer zweiten.
- "meatIngredientIndexes": die Positionen (ab 0) der Fleisch- und Fischzutaten in "ingredients", die ersetzt werden.
- "meatStepIndexes": die Positionen (ab 0) der Schritte in "steps", die nur für die Fleischvariante gelten.
- "groupName": Name der Wahl, z. B. „Protein“ oder „Einlage“. "meatOptionName": z. B. „Hähnchen“. "vegetarianOptionName": z. B. „Halloumi“.
- "ingredients": Zutaten der vegetarischen Option im selben Format und für dieselbe Portionenzahl.
- "steps": Schritte für die vegetarische Option. Weise darauf hin, die vegetarische Komponente zuerst oder in einer eigenen Pfanne zuzubereiten, wenn beide in derselben Küche entstehen.
- Wähle eine Alternative, die zum Gericht passt und gut erhältlich ist, z. B. Halloumi, Tofu, Räuchertofu, Tempeh, Kichererbsen, Bohnen, Linsen oder Pilze.
- Lässt sich eine tierische Zutat nicht getrennt zubereiten (z. B. Hühnerbrühe in einer gemeinsamen Suppe), nenne den Austausch in "uncertainties", z. B. „Für die vegetarische Variante Gemüsebrühe statt Hühnerbrühe nehmen“.`;

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'description',
    'servings',
    'prepMinutes',
    'cookMinutes',
    'source',
    'ingredients',
    'steps',
    'notes',
    'meals',
    'uncertainties',
    'vegetarian',
  ],
  properties: {
    title: { type: 'string' },
    description: { type: 'string', description: 'Kurze Beschreibung aus der Vorlage, sonst leer' },
    servings: { type: 'integer', description: 'Portionen, 0 = unbekannt' },
    prepMinutes: { type: 'integer', description: 'Vorbereitungszeit in Minuten, 0 = unbekannt' },
    cookMinutes: { type: 'integer', description: 'Koch- oder Backzeit in Minuten, 0 = unbekannt' },
    source: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['section', 'text'],
        properties: { section: { type: 'string' }, text: { type: 'string' } },
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    meals: { type: 'array', items: { type: 'string', enum: MEAL_IDS } },
    uncertainties: { type: 'array', items: { type: 'string' } },
    vegetarian: {
      type: 'object',
      additionalProperties: false,
      required: [
        'needed',
        'groupName',
        'meatOptionName',
        'vegetarianOptionName',
        'meatIngredientIndexes',
        'meatStepIndexes',
        'ingredients',
        'steps',
      ],
      properties: {
        needed: { type: 'boolean' },
        groupName: { type: 'string' },
        meatOptionName: { type: 'string' },
        vegetarianOptionName: { type: 'string' },
        meatIngredientIndexes: { type: 'array', items: { type: 'integer' } },
        meatStepIndexes: { type: 'array', items: { type: 'integer' } },
        ingredients: { type: 'array', items: { type: 'string' } },
        steps: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str) : [];
}

function minutesOrCount(value: unknown): number | null {
  const number = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : value;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function indexes(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item) && item >= 0) : [];
}

/** Manche Modelle verpacken die Antwort in ein weiteres Objekt, z. B. `{ "rezept": { … } }`. */
function unwrapAnswer(value: unknown): JsonObject {
  if (!isObject(value)) return {};
  if ('title' in value || 'ingredients' in value || 'steps' in value) return value;
  const inner = Object.values(value);
  return inner.length === 1 && isObject(inner[0]) ? inner[0] : value;
}

/**
 * Übernimmt die Antwort des Modells vorsichtig: falsche Typen werden zu leeren Werten.
 * Leere Zutaten und Schritte bleiben stehen, damit die Indizes des vegetarischen Vorschlags passen.
 */
export function toImportedRecipe(value: unknown): ImportedRecipe {
  const data = unwrapAnswer(value);
  const veg = isObject(data.vegetarian) ? data.vegetarian : {};
  const vegetarian: VegetarianSuggestion | null =
    veg.needed === true
      ? {
          groupName: str(veg.groupName),
          meatOptionName: str(veg.meatOptionName),
          vegetarianOptionName: str(veg.vegetarianOptionName),
          meatIngredientIndexes: indexes(veg.meatIngredientIndexes),
          meatStepIndexes: indexes(veg.meatStepIndexes),
          ingredients: strings(veg.ingredients).filter(Boolean),
          steps: strings(veg.steps).filter(Boolean),
        }
      : null;

  return {
    title: str(data.title),
    description: str(data.description),
    servings: minutesOrCount(data.servings),
    prepMinutes: minutesOrCount(data.prepMinutes),
    cookMinutes: minutesOrCount(data.cookMinutes),
    source: str(data.source),
    ingredients: (Array.isArray(data.ingredients) ? data.ingredients : []).map((item) => ({
      section: isObject(item) ? str(item.section) : '',
      text: isObject(item) ? str(item.text) : str(item),
    })),
    steps: strings(data.steps),
    notes: str(data.notes),
    meals: Array.isArray(data.meals) ? MEAL_IDS.filter((id) => (data.meals as unknown[]).includes(id)) : null,
    uncertainties: strings(data.uncertainties).filter(Boolean),
    vegetarian,
  };
}

function hasContent(recipe: ImportedRecipe): boolean {
  return recipe.ingredients.some((item) => item.text) || recipe.steps.some(Boolean);
}

/** Entfernt einen Markdown-Codeblock um die Antwort, falls ein Modell trotz JSON-Schema einen schreibt. */
function stripCodeFence(content: string): string {
  return content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (bytes < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

/**
 * KI-Import über Requesty (OpenAI-kompatibel): Fotos, Text oder eine Webseite werden zu einem Rezept.
 * Links mit schema.org-Rezeptdaten gehen auch ohne Schlüssel; mit Schlüssel bereitet die KI sie zusätzlich auf.
 */
export function createImporter({
  apiKey,
  models,
  baseUrl = REQUESTY_BASE_URL,
  fetch: fetchImpl = fetch,
  log = console.warn,
}: ImporterConfig) {
  const available = apiKey !== '' && models.length > 0;

  const loadPage = async (url: string): Promise<string> => {
    let response: Response;
    try {
      response = await fetchImpl(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    } catch (error) {
      log(`Import: ${url} nicht erreichbar: ${errorText(error)}`);
      throw new ImportError('Die Seite ließ sich nicht laden. Stimmt der Link?', 502);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new ImportError(
        `Die Seite antwortet mit Fehler ${response.status}. Manche Seiten sperren Abrufe von Servern; dann hilft ein Screenshot oder der kopierte Text.`,
        502,
      );
    }
    return readText(response, MAX_PAGE_BYTES);
  };

  const callModel = async (model: string, content: ContentPart[]): Promise<{ recipe: ImportedRecipe; answer: string }> => {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'rezept', strict: true, schema: RECIPE_SCHEMA } },
        max_tokens: 8000,
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const answer = data.choices?.[0]?.message?.content;
    if (typeof answer !== 'string') throw new Error('Antwort ohne Inhalt');
    return { recipe: toImportedRecipe(JSON.parse(stripCodeFence(answer))), answer };
  };

  /**
   * Fragt die Modelle der Reihe nach. Das nächste kommt dran, wenn das vorige ausfällt oder
   * kein Rezept erkennt (das kommt vereinzelt vor). Erkennt keins ein Rezept, bleibt es dabei.
   */
  const askModels = async (content: ContentPart[]): Promise<ImportedRecipe> => {
    let empty: ImportedRecipe | null = null;
    for (const model of models) {
      try {
        const { recipe, answer } = await callModel(model, content);
        if (hasContent(recipe)) return recipe;
        empty = recipe;
        log(`Import mit ${model}: kein Rezept erkannt. Antwort: ${answer.slice(0, 300)}`);
      } catch (error) {
        log(`Import mit ${model} fehlgeschlagen: ${errorText(error)}`);
      }
    }
    if (empty) return empty;
    throw new ImportError('Die KI konnte das Rezept gerade nicht lesen. Bitte versuch es später noch einmal.', 502);
  };

  return {
    /** `true`, wenn ein Schlüssel für Requesty hinterlegt ist. */
    available,
    models,

    async importRecipe(request: ImportRequest): Promise<ImportedRecipe> {
      let structured: ImportedRecipe | null = null;
      let pageText = '';
      if (request.url) {
        const html = await loadPage(request.url);
        structured = extractJsonLdRecipe(html);
        if (!structured) pageText = htmlToText(html).slice(0, MAX_PAGE_TEXT);
      }
      const onlyLink = request.images.length === 0 && !request.text;
      const fromPage = (recipe: ImportedRecipe): ImportedRecipe => ({ ...recipe, source: request.url || recipe.source });

      if (!available) {
        if (structured && onlyLink) return fromPage(structured);
        throw new ImportError(
          request.url && onlyLink
            ? 'Die Seite enthält keine lesbaren Rezeptdaten. Für alles Weitere braucht der Server einen Requesty-Schlüssel (REQUESTY_API_KEY).'
            : 'Für den Import per Foto oder Text braucht der Server einen Requesty-Schlüssel (REQUESTY_API_KEY).',
          503,
        );
      }

      const task = request.suggestVegetarian
        ? 'Lies das Rezept aus der folgenden Vorlage. Enthält es Fleisch oder Fisch, schlag eine vegetarische Option vor.'
        : 'Lies das Rezept aus der folgenden Vorlage. Kein vegetarischer Vorschlag: "vegetarian.needed" = false.';
      const content: ContentPart[] = [{ type: 'text', text: task }];
      if (structured) {
        content.push({ type: 'text', text: `Rezeptdaten der Seite ${request.url}:\n${JSON.stringify(structured)}` });
      } else if (request.url) {
        content.push({ type: 'text', text: `Text der Seite ${request.url}:\n${pageText}` });
      }
      if (request.text) content.push({ type: 'text', text: `Text:\n${request.text}` });
      for (const image of request.images) {
        content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
      }

      let recipe: ImportedRecipe;
      try {
        recipe = await askModels(content);
      } catch (error) {
        // Die Rezeptdaten der Seite reichen auch ohne KI, nur ohne vegetarischen Vorschlag.
        if (!structured || !onlyLink) throw error;
        return {
          ...fromPage(structured),
          uncertainties: ['Die KI war nicht erreichbar. Das Rezept stammt direkt von der Seite, ohne vegetarischen Vorschlag.'],
        };
      }
      if (!hasContent(recipe)) {
        throw new ImportError(
          request.url && onlyLink
            ? 'Auf der Seite wurde kein Rezept gefunden. Bei Instagram & Co. klappt es besser mit einem Screenshot oder dem kopierten Text.'
            : 'Darin wurde kein Rezept gefunden.',
          422,
        );
      }
      return fromPage(recipe);
    },
  };
}

export type Importer = ReturnType<typeof createImporter>;
