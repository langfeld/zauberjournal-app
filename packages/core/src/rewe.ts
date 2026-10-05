/**
 * REWE-Abgleich: Produkte aus der Website-Suche bewerten und die Packungsanzahl für den Bedarf bestimmen.
 * Die Suche selbst macht der Server; hier liegt nur Logik ohne Netz.
 */

import type { FoodCategory } from './food-catalog.ts';

/** Ein Produkt aus der REWE-Suche, so wie Server und App es verwenden. */
export type ReweProduct = {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  /** Preis einer Packung in Cent. */
  price: number;
  /** Grundpreis in Cent je kg, l oder Stück; 0, wenn unbekannt. */
  basePrice: number;
  /** Packungsangabe mit Grundpreis, z. B. „500g (1 kg = 3,50 €)“. */
  grammage: string;
  /** z. B. „Obst & Gemüse/Frisches Gemüse/Tomaten/“. */
  categoryPath: string;
  /** Merkmale aus der Suche, z. B. `organic`, `regional`, `vegan`, `discounted`. */
  tags: string[];
  /** Listing-ID im gewählten Markt. */
  listingId: string;
};

export type ReweMarket = { id: string; name: string; street: string; zipCode: string; city: string; distance: number };

// ─── Packungen ───

/**
 * Inhalt einer Packung. Gramm und Milliliter gelten als gleich (bei Lebensmitteln nah genug dran);
 * Stückware hat oft ein ungefähres Gewicht („1 Stück ca. 420 g“).
 */
export type PackSize = { amount: number; unit: 'g' | 'Stück'; approxGrams?: number };

const METRIC_FACTORS: Record<string, number> = { g: 1, kg: 1000, ml: 1, cl: 10, l: 1000 };

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const METRIC_UNIT = '(kg|g|ml|cl|l)';

function toNumber(text: string): number {
  return Number(text.replace(',', '.'));
}

/** Liest die Packungsgröße aus der Angabe der Suche, notfalls aus dem Namen („Zwiebeln 1,5kg“). */
export function parsePackSize(grammage: string, name = ''): PackSize | null {
  const text = (grammage.split('(')[0] ?? '').trim().toLocaleLowerCase('de');
  let match = new RegExp(`^(\\d+)\\s*x\\s*${NUMBER}\\s*${METRIC_UNIT}$`).exec(text);
  if (match) return { amount: Number(match[1]) * toNumber(match[2]!) * METRIC_FACTORS[match[3]!]!, unit: 'g' };
  match = new RegExp(`^${NUMBER}\\s*${METRIC_UNIT}$`).exec(text);
  if (match) return { amount: toNumber(match[1]!) * METRIC_FACTORS[match[2]!]!, unit: 'g' };
  match = new RegExp(`^(\\d+)\\s*stück(?:\\s*ca\\.?\\s*${NUMBER}\\s*(kg|g))?`).exec(text);
  if (match) {
    const pack: PackSize = { amount: Number(match[1]), unit: 'Stück' };
    if (match[2]) pack.approxGrams = toNumber(match[2]) * METRIC_FACTORS[match[3]!]!;
    return pack;
  }
  const fromName = new RegExp(`${NUMBER}\\s*${METRIC_UNIT}\\b`).exec(name.toLocaleLowerCase('de'));
  return fromName ? { amount: toNumber(fromName[1]!) * METRIC_FACTORS[fromName[2]!]!, unit: 'g' } : null;
}

/**
 * Rezept-Einheiten, die sich mit Packungen vergleichen lassen. Bei Dosen nennt REWE meist das
 * Abtropfgewicht; eine übliche Dose Kichererbsen oder Bohnen hat etwa 240 g.
 */
const COMPARABLE: Record<string, { unit: 'g' | 'Stück'; factor: number }> = {
  g: { unit: 'g', factor: 1 },
  kg: { unit: 'g', factor: 1000 },
  ml: { unit: 'g', factor: 1 },
  cl: { unit: 'g', factor: 10 },
  dl: { unit: 'g', factor: 100 },
  l: { unit: 'g', factor: 1000 },
  Dose: { unit: 'g', factor: 240 },
  '': { unit: 'Stück', factor: 1 },
  Stück: { unit: 'Stück', factor: 1 },
};

/** Eine dieser Einheiten entspricht einer ganzen Packung, z. B. „2 Becher Sahne“. */
const PACK_UNITS = new Set(['Pck.', 'Becher', 'Glas', 'Kopf', 'Beutel', 'Flasche', 'Bund', 'Würfel', 'Knolle', 'Stange']);

/** Ob sich der Bedarf mit einer Packungsgröße vergleichen lässt (und nicht nur „eine Packung“ heißt). */
function hasComparableAmount(amount: number | null, unit: string): boolean {
  return amount !== null && amount > 0 && (unit in COMPARABLE || PACK_UNITS.has(unit));
}

/** Hier sind Stück einzelne Früchte oder Filets; ein Netz oder eine Schale enthält mehrere. */
const LOOSE: ReadonlySet<FoodCategory> = new Set(['produce', 'meat', 'fish']);

export function isLooseCategory(category: FoodCategory): boolean {
  return LOOSE.has(category);
}

function atLeastOne(packs: number): number {
  return Math.max(1, Math.ceil(packs - 1e-9));
}

/**
 * Wie viele Packungen den Bedarf decken. Teilmengen wie EL, Zehe oder Prise und Bedarf ohne Menge
 * brauchen eine Packung; passen Bedarf und Packung nicht zusammen, ebenfalls eine. Stück abgepackter
 * Ware sind Packungen („2 Butter“); bei Obst, Gemüse, Fleisch und Fisch reicht eine Packung nach Gewicht.
 */
export function packsFor(amount: number | null, unit: string, pack: PackSize | null, category: FoodCategory = 'other'): number {
  if (amount === null || amount <= 0) return 1;
  if (PACK_UNITS.has(unit)) return atLeastOne(amount);
  const need = COMPARABLE[unit];
  if (!need || !pack) return 1;
  const needed = amount * need.factor;
  if (need.unit === pack.unit) return atLeastOne(needed / pack.amount);
  // Bedarf in Gramm, Packung als Stück „ca. 420 g“
  if (need.unit === 'g' && pack.approxGrams) return atLeastOne(needed / (pack.amount * pack.approxGrams));
  if (need.unit === 'Stück' && !LOOSE.has(category)) return atLeastOne(needed);
  return 1;
}

// ─── Warengruppen ───

/** Wo REWE die Warengruppen des Lebensmittel-Katalogs führt (Anfang des Kategoriepfads). */
const CATEGORY_PATHS: Record<FoodCategory, readonly string[]> = {
  produce: ['Obst & Gemüse/'],
  bakery: ['Backwaren, Cerealien & Aufstriche/Brot & Backwaren/'],
  dairy: ['Käse, Eier & Molkerei/'],
  meat: ['Fleisch, Wurst & Fisch/Fleisch', 'Fleisch, Wurst & Fisch/Wurst'],
  fish: ['Fleisch, Wurst & Fisch/Fisch', 'Tiefkühlkost/Tiefkühl-Fisch', 'Fertiggerichte & Konserven/Fischkonserven'],
  frozen: ['Tiefkühlkost/'],
  dry: ['Kochen & Backen/'],
  canned: ['Fertiggerichte & Konserven/'],
  spices: ['Öle, Soßen & Gewürze/'],
  sweets: ['Süßes & Salziges/', 'Backwaren, Cerealien & Aufstriche/'],
  drinks: ['Getränke & Genussmittel/'],
  household: ['Küche & Haushalt/', 'Drogerie'],
  other: [],
};

/** Warengruppen, bei denen ein Vorrat sinnvoll ist: Bei kleinem Bedarf zählt der Grundpreis. */
const KEEPS: ReadonlySet<FoodCategory> = new Set(['dry', 'canned', 'spices', 'sweets', 'drinks', 'household', 'other']);

/** Rubriken, in denen REWE Produkte zusätzlich führt; sie sagen nichts über die Warengruppe. */
const NEUTRAL_PATHS = ['Bewusste Ernährung/', 'Monats-Highlights/'];

/** Kommt für Zutaten nie infrage. */
const EXCLUDED_PATHS = ['Tierbedarf/', 'Baby & Kind/', 'Weihnachtswelt/'];

type CategoryFit = 'match' | 'neutral' | 'mismatch';

function categoryFit(category: FoodCategory, path: string): CategoryFit {
  const paths = CATEGORY_PATHS[category];
  if (paths.length === 0 || NEUTRAL_PATHS.some((prefix) => path.startsWith(prefix))) return 'neutral';
  return paths.some((prefix) => path.startsWith(prefix)) ? 'match' : 'mismatch';
}

// ─── Namen vergleichen ───

const STOPWORDS = new Set(['und', 'oder', 'mit', 'ohne', 'frisch', 'frische', 'frischer']);

/** Wörter in Produktnamen, die nichts über die Art des Produkts sagen. */
const LABEL_WORDS = new Set(['rewe', 'bio', 'beste', 'wahl', 'ja', 'feine', 'welt', 'original', 'regional', 'ca', 'stück', 'x']);

/** Wortteile, die nur die Form angeben: „Lachsfilet“ ist Lachs, „Knoblauchzehen“ sind Knoblauch. */
const FORM_PARTS = new Set([
  'filet', 'filets', 'steak', 'steaks', 'würfel', 'scheibe', 'scheiben', 'stück', 'stücke', 'streifen',
  'zehe', 'zehen', 'knolle', 'knollen', 'hälfte', 'hälften',
]);

function words(text: string): string[] {
  return text
    .toLocaleLowerCase('de')
    .replace(/ß/g, 'ss')
    .split(/[^a-z0-9äöü]+/)
    .filter(Boolean);
}

/** Einfache Mehrzahl abschneiden, damit „Zwiebeln“ und „Zwiebel“ zusammenpassen. */
function stem(word: string): string {
  for (const suffix of ['en', 'er', 'n', 'e', 's']) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

/** Ob `word` aus `base`, einem Fugenlaut und einem Wortteil für die Form besteht. */
function isFormOf(word: string, base: string): boolean {
  if (!word.startsWith(base) || word.length === base.length) return false;
  return FORM_PARTS.has(word.slice(base.length).replace(/^(en|n|e|s)(?=.)/, ''));
}

/** Wie gut ein Wort des Lebensmittels zu einem Wort des Produktnamens passt (0 bis 1). */
function wordFit(foodWord: string, productWord: string): number {
  const target = stem(foodWord);
  const candidate = stem(productWord);
  if (candidate === target) return 1;
  if (isFormOf(productWord, target) || isFormOf(foodWord, candidate)) return 0.95;
  // Im Deutschen bestimmt der letzte Wortteil, was es ist: „Rispentomaten“ sind Tomaten, „Tomatenmark“ nicht.
  if (candidate.endsWith(target)) return 0.9;
  if (productWord.startsWith(target)) return 0.6;
  return 0;
}

/** Getrennt geschrieben mit anderem Wortteil dazwischen, z. B. „Cherry Romatomaten“ für „Cherrytomaten“. */
function splitFit(foodWord: string, productWords: readonly string[]): number {
  for (const first of productWords) {
    if (first.length < 3 || first.length >= foodWord.length || !foodWord.startsWith(first)) continue;
    const rest = stem(foodWord.slice(first.length));
    if (rest.length >= 3 && productWords.some((other) => other !== first && stem(other).endsWith(rest))) return 0.85;
  }
  return 0;
}

/**
 * Ähnlichkeit von Lebensmittel und Produktname, 0 bis 1. Was nach „mit“ steht, ist nur eine Zutat:
 * „Streichfett mit Butter“ ist keine Butter.
 */
export function nameFit(foodName: string, productName: string): number {
  const foodWords = words(foodName).filter((word) => !STOPWORDS.has(word));
  if (foodWords.length === 0) return 0;
  const productWords = words(productName);
  const withIndex = productWords.indexOf('mit');
  const joined = productWords.join('');
  let total = 0;
  for (const word of foodWords) {
    let best = 0;
    productWords.forEach((productWord, index) => {
      const fit = wordFit(word, productWord) * (withIndex >= 0 && index > withIndex ? 0.3 : 1);
      best = Math.max(best, fit);
    });
    // Über Wortgrenzen hinweg, z. B. „Hähnchen Brustfilet“ für „Hähnchenbrust“
    const target = stem(word);
    if (best === 0 && target.length >= 6 && joined.includes(target)) best = 0.9;
    if (best === 0) best = splitFit(word, productWords);
    total += best;
  }
  return total / foodWords.length;
}

/**
 * Suchbegriff für ein Lebensmittel, ohne Zusatz nach dem Komma. „Salz und Pfeffer“ sind zwei
 * Lebensmittel: Gesucht wird das erste, und ein Treffer ist nie sicher.
 */
export function reweSearchTerm(name: string): { term: string; ambiguous: boolean } {
  const main = name.split(',')[0]!.trim() || name.trim();
  const parts = main
    .split(/\s+(?:und|oder|&|\+)\s+|\s*\/\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return { term: parts[0] ?? main, ambiguous: parts.length > 1 };
}

/** Wörter im Produktnamen, die weder zum Lebensmittel noch zur Marke oder Größe gehören. */
function extraWords(foodName: string, product: ReweProduct): number {
  const food = words(foodName).map(stem);
  const brand = new Set(words(product.brand));
  return words(product.name).filter((word) => {
    if (word.length < 3 || brand.has(word) || LABEL_WORDS.has(word) || STOPWORDS.has(word) || /\d/.test(word)) return false;
    const stemmed = stem(word);
    return !food.some((part) => stemmed.includes(part) || part.includes(stemmed));
  }).length;
}

// ─── Bewertung ───

/** Was gebraucht wird, z. B. 680 g Hähnchenbrust aus der Warengruppe Fleisch. */
export type ReweNeed = { name: string; category: FoodCategory; amount: number | null; unit: string };

export type ReweCandidate = ReweProduct & {
  packs: number;
  /** Preis aller Packungen in Cent. */
  total: number;
  score: number;
};

/**
 * `sure`: passendes Produkt mit eindeutigem Namen und passender Warengruppe;
 * `unsure`: bitte prüfen; `none`: nichts Passendes gefunden.
 */
export type ReweConfidence = 'sure' | 'unsure' | 'none';

export type ReweMatch = { candidates: ReweCandidate[]; confidence: ReweConfidence };

export type ReweMatchOptions = { organic?: boolean; limit?: number };

/** Querverweise wie „Bewusste Ernährung“ sind meist echte Lebensmittel, nur ohne erkennbare Warengruppe. */
const CATEGORY_POINTS: Record<CategoryFit, number> = { match: 20, neutral: 12, mismatch: -25 };

/** Grundpreis in Cent je kg, l oder Stück; bei Packungen von genau 1 kg nennt REWE ihn oft nicht. */
function unitPrice(product: ReweProduct, pack: PackSize | null): number {
  if (product.basePrice > 0) return product.basePrice;
  if (pack?.unit === 'g') return (product.price / pack.amount) * 1000;
  if (pack?.unit === 'Stück') return product.price / pack.amount;
  return product.price;
}

/** Packungen und Gesamtpreis eines Produkts für den Bedarf, ohne Bewertung (z. B. für ein Stammprodukt). */
export function rateProduct(need: Omit<ReweNeed, 'name'>, product: ReweProduct): ReweCandidate {
  const packs = packsFor(need.amount, need.unit, parsePackSize(product.grammage, product.name), need.category);
  return { ...product, packs, total: packs * product.price, score: 0 };
}

/**
 * Bewertet die Suchergebnisse für einen Bedarf. Am meisten zählt der Name, dann die Warengruppe,
 * dann der Preis: für alle nötigen Packungen, bei kleinem Bedarf an Vorratsdingen der Grundpreis.
 * Viele kleine Packungen und Wörter, die nicht zum Lebensmittel gehören, kosten Punkte.
 * Mit `organic` haben Bio-Produkte Vorrang. Produkte ohne passenden Namen stehen hinten, in der
 * Reihenfolge der REWE-Suche; passt gar kein Name, ist der beste davon nur ein Vorschlag zum Prüfen.
 */
export function matchReweProducts(need: ReweNeed, products: readonly ReweProduct[], options: ReweMatchOptions = {}): ReweMatch {
  const { organic = false, limit = 8 } = options;
  const { term, ambiguous } = reweSearchTerm(need.name);
  // Ohne Menge (z. B. „nachkaufen“) und bei kleinem Bedarf an Vorratsdingen zählt der Grundpreis.
  const byBasePrice = need.amount === null || (KEEPS.has(need.category) && !hasComparableAmount(need.amount, need.unit));
  const rated = products
    .filter((product) => product.price > 0 && !EXCLUDED_PATHS.some((prefix) => product.categoryPath.startsWith(prefix)))
    .map((product) => {
      const candidate = rateProduct(need, product);
      const pack = parsePackSize(product.grammage, product.name);
      return {
        candidate,
        cost: byBasePrice ? unitPrice(product, pack) : candidate.total,
        // Lieber eine passende Packung als mehrere kleine (Stückware wie Tomaten ausgenommen).
        smallPacks: pack?.unit === 'g' ? Math.max(0, candidate.packs - 1) : 0,
        name: nameFit(term, product.name),
        fit: categoryFit(need.category, product.categoryPath),
        extra: extraWords(term, product),
      };
    });

  // Der Preis zählt im Vergleich zum günstigsten gut passenden Produkt.
  const named = rated.filter((entry) => entry.name > 0);
  const good = named.filter((entry) => entry.name >= 0.6 && entry.fit !== 'mismatch');
  const cheapest = Math.min(...(good.length > 0 ? good : named).map((entry) => entry.cost));

  const scored = rated
    .map((entry) => {
      if (entry.name === 0) return { entry, score: 0 };
      // Teurer als das günstigste gut passende Produkt kostet Punkte, billiger bringt keine.
      const pricePoints = Math.max(-30, Math.min(0, -12 * Math.log2(entry.cost / cheapest)));
      const tags = new Set(entry.candidate.tags);
      const tagPoints = (organic && tags.has('organic') ? 10 : 0) + (tags.has('discounted') ? 2 : 0);
      const score =
        50 * entry.name +
        CATEGORY_POINTS[entry.fit] +
        pricePoints +
        tagPoints -
        Math.min(25, 4 * entry.smallPacks) -
        3 * Math.min(4, entry.extra);
      return { entry, score: Math.round(score * 10) / 10 };
    })
    // Stabil sortiert: Ohne passenden Namen bleibt die Reihenfolge der REWE-Suche.
    .sort((a, b) => Number(b.entry.name > 0) - Number(a.entry.name > 0) || b.score - a.score);

  const best = scored[0]?.entry;
  return {
    candidates: scored.slice(0, limit).map(({ entry, score }) => ({ ...entry.candidate, score })),
    confidence: !best ? 'none' : !ambiguous && best.name >= 0.85 && best.fit !== 'mismatch' ? 'sure' : 'unsure',
  };
}

/** Ein gemerktes Produkt, so wie der Server es im Markt sucht. */
export type RewePreferred = { productId: string; name: string };

/** So viele gemerkte Produkte je Lebensmittel prüft der Abgleich höchstens. */
export const REWE_MAX_PREFERRED = 5;

/** Eine Position für den Abgleich; `id` ist die ID des Lebensmittels. */
export type ReweMatchRequestItem = ReweNeed & {
  id: string;
  /** Gemerkte Produkte in ihrer Reihenfolge; der Server nimmt das erste, das im Markt zu finden ist. */
  preferred: RewePreferred[];
};

/** Ergebnis für eine Position; `learned`: Ein gemerktes Produkt ist im Markt zu finden und steht vorn. */
export type ReweMatchResult = { id: string; confidence: ReweConfidence; learned: boolean; candidates: ReweCandidate[] };

// ─── Gespeicherte Zuordnung ───

/**
 * Stand des REWE-Produkts eines Lebensmittels:
 * - `sure`, `unsure`: Vorschlag des Abgleichs, passend bzw. bitte prüfen
 * - `none`: nichts gefunden
 * - `chosen`: ein gemerktes Produkt, beim Abgleich gefunden oder vom Haushalt gewählt
 * - `missing`: Keins der gemerkten Produkte war zu finden; das Produkt ist ein Vorschlag zum Prüfen
 * - `skip`: nicht bei REWE kaufen
 */
export const REWE_STATES = ['sure', 'unsure', 'none', 'chosen', 'missing', 'skip'] as const;

export type ReweState = (typeof REWE_STATES)[number];

/** Zeile der Tabelle `reweProducts`; die Zeilen-ID ist die ID des Lebensmittels. */
export type ReweProductRow = {
  state: ReweState;
  productId: string;
  name: string;
  imageUrl: string;
  /** Preis einer Packung in Cent, Stand des letzten Abgleichs. */
  price: number;
  grammage: string;
  listingId: string;
  updatedAt: number;
};

/** Zeile der Tabelle `reweFavorites`: ein gemerktes Produkt eines Lebensmittels, ID `<Lebensmittel>~<Produkt>`. */
export type ReweFavoriteRow = {
  foodId: string;
  productId: string;
  sortKey: string;
  name: string;
  imageUrl: string;
  /** Preis einer Packung in Cent, Stand der letzten Suche. */
  price: number;
  grammage: string;
  deletedAt: number | null;
};

/** Preis in Euro für die Anzeige, z. B. „1,29 €“. */
export function formatPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Verkleinertes Produktbild als JPEG; REWE liefert sonst PNGs mit 1200 × 1200 Pixeln. */
export function reweImageUrl(url: string, size: number): string {
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}resize=${size}px:${size}px&output-format=jpg`;
}
