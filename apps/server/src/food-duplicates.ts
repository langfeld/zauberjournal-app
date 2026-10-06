import { categoryLabel, type FoodDuplicateGroup } from '@zauberjournal/core';

import { aiAvailable, askJson, type AiConfig } from './ai.ts';

/** Höchstens so viele Lebensmittel je Anfrage */
const MAX_FOODS = 2000;
const MAX_NAME_LENGTH = 100;
const MAX_REASON_LENGTH = 80;

/** Ein Lebensmittel, wie es die App zur Prüfung schickt */
export type DuplicateFood = { id: string; name: string; category: string };

export class DuplicatesError extends Error {
  readonly status: 502 | 503;

  constructor(message: string, status: 502 | 503) {
    super(message);
    this.status = status;
  }
}

/** Prüft den Body von `POST /api/foods/duplicates`; `null`, wenn etwas fehlt oder nicht passt. */
export function readDuplicatesRequest(body: Record<string, unknown>): DuplicateFood[] | null {
  if (!Array.isArray(body.foods) || body.foods.length > MAX_FOODS) return null;
  const foods: DuplicateFood[] = [];
  for (const food of body.foods as unknown[]) {
    if (typeof food !== 'object' || food === null) return null;
    const { id, name, category } = food as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof name !== 'string' || !name.trim() || name.length > MAX_NAME_LENGTH) return null;
    foods.push({ id, name: name.trim(), category: typeof category === 'string' ? category : '' });
  }
  return foods;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['groups'],
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['keep', 'same', 'reason'],
        properties: {
          keep: { type: 'integer' },
          same: { type: 'array', items: { type: 'integer' } },
          reason: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = [
  'Du hilfst, den Lebensmittel-Katalog einer deutschen Koch-App aufzuräumen.',
  'Die Lebensmittel entstehen aus den Zutaten der Rezepte und aus der Einkaufsliste; dabei landet dasselbe manchmal unter mehreren Namen im Katalog.',
  'Antworte ausschließlich mit JSON nach dem vorgegebenen Schema.',
].join(' ');

const TASK = `Unten stehen die Lebensmittel mit Nummer und Warengruppe. Finde Namen, die dasselbe meinen, also dasselbe, was man im Laden kauft:
- andere Schreibweise, Bindestrich, Leerzeichen oder Tippfehler (Tortilla-Chips, Tortillas Chips, Tortillaschips),
- Einzahl und Mehrzahl (Zwiebel, Zwiebeln),
- Zusätze, die beim Einkauf nichts ändern (Hähnchenbrust, Hähnchenbrustfilet; Mozzarella, Mozzarellakugeln),
- gleichbedeutende Wörter (Lauchzwiebeln, Frühlingszwiebeln; Möhren, Karotten).
Nicht zusammen gehört, was man verschieden kauft: Sorten und Varianten (Zwiebel und rote Zwiebel, Tomaten und Cherrytomaten, Quark und Magerquark, Joghurt und griechischer Joghurt, Öl und Olivenöl, Senf und Dijon-Senf, Romanasalat und Mini-Romana), verarbeitete Formen (Zitrone und Zitronensaft, Tomaten und stückige Tomaten, Knoblauch und Knoblauchgranulat) und Dinge, die nur ähnlich heißen (Tortillas und Tortilla-Chips). Im Zweifel nicht zusammenfassen.
Je Gruppe: keep ist die Nummer des Namens, der bleiben soll, also der übliche, richtig geschriebene Name, unter dem man das Lebensmittel sucht; same sind die Nummern der übrigen Namen. reason: auf Deutsch, höchstens fünf Wörter, z. B. „andere Schreibweise“, „Mehrzahl“ oder „Filet ist dasselbe“.
Jeder Name gehört zu höchstens einer Gruppe. Gibt es nichts zusammenzufassen, ist groups leer.`;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Übernimmt nur Gruppen aus mindestens zwei bekannten Lebensmitteln; jedes zählt höchstens einmal. */
function readGroups(data: unknown, foods: readonly DuplicateFood[]): FoodDuplicateGroup[] {
  const groups = isObject(data) && Array.isArray(data.groups) ? data.groups : [];
  const used = new Set<number>();
  const valid = (number: unknown): number is number =>
    Number.isInteger(number) && (number as number) >= 1 && (number as number) <= foods.length && !used.has(number as number);
  return groups.filter(isObject).flatMap((group) => {
    const numbers = [...new Set([group.keep, ...(Array.isArray(group.same) ? group.same : [])])].filter(valid);
    const [keep] = numbers;
    if (keep === undefined || keep !== group.keep || numbers.length < 2) return [];
    numbers.forEach((number) => used.add(number));
    const reason = typeof group.reason === 'string' ? group.reason.trim().slice(0, MAX_REASON_LENGTH) : '';
    return [{ keepId: foods[keep - 1]!.id, foodIds: numbers.map((number) => foods[number - 1]!.id), reason }];
  });
}

export type FoodDuplicatesConfig = { ai: AiConfig; fetch?: typeof fetch; log?: (message: string) => void };

/** Sucht mit der KI nach Lebensmitteln, die dasselbe meinen; zusammenführen entscheidet der Haushalt in der App. */
export function createFoodDuplicates({ ai, fetch: fetchImpl = fetch, log = console.warn }: FoodDuplicatesConfig) {
  return {
    async find(foods: readonly DuplicateFood[]): Promise<FoodDuplicateGroup[]> {
      if (!aiAvailable(ai)) throw new DuplicatesError('Dafür braucht der Server einen Requesty-Schlüssel (REQUESTY_API_KEY).', 503);
      if (foods.length < 2) return [];
      const list = foods.map((food, index) => `${index + 1}: ${food.name} (${categoryLabel(food.category)})`);
      const answer = await askJson(
        ai,
        { task: 'Dubletten-Suche', name: 'dubletten', system: SYSTEM, prompt: `${TASK}\n\n${list.join('\n')}`, schema: SCHEMA },
        fetchImpl,
        log,
      );
      if (answer === undefined) throw new DuplicatesError('Die KI ist gerade nicht erreichbar. Bitte versuch es später noch einmal.', 502);
      return readGroups(answer, foods);
    },
  };
}

export type FoodDuplicates = ReturnType<typeof createFoodDuplicates>;
