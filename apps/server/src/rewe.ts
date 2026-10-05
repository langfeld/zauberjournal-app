import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  FOOD_CATEGORY_IDS,
  matchReweProducts,
  rateProduct,
  REWE_MAX_PREFERRED,
  reweSearchTerm,
  type FoodCategory,
  type ReweMarket,
  type ReweMatchResult,
  type ReweNeed,
  type RewePreferred,
  type ReweProduct,
} from '@zauberjournal/core';

/**
 * Anbindung an die Produktsuche der REWE-Website (inoffiziell, siehe Konzept 8.2).
 * Ergebnisse werden zwischengespeichert, Anfragen laufen nacheinander mit kurzen Pausen.
 */

const BASE_URL = 'https://www.rewe.de/shop/api';
/** Wie ein üblicher Browser; mit dem Standard von Node antwortet REWE nicht verlässlich. */
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const DAY = 24 * 60 * 60 * 1000;
const MARKETS_TTL = 7 * DAY;
const SEARCH_TTL = DAY / 4;
const SEARCH_LIMIT = 30;
/** Die App schickt lange Listen in Teilen, damit sie den Fortschritt zeigen kann. */
const MAX_MATCH_ITEMS = 25;
const MAX_TEXT_LENGTH = 80;

export class ReweError extends Error {
  readonly status: 400 | 502;

  constructor(message: string, status: 400 | 502 = 502) {
    super(message);
    this.status = status;
  }
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function at(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) current = isObject(current) ? current[key] : undefined;
  return current;
}

function first(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Märkte aus der Marktauswahl der Website. */
export function parseMarkets(data: unknown): ReweMarket[] {
  return (Array.isArray(data) ? data : [])
    .filter(isObject)
    .map((market) => ({
      id: str(market.wwIdent),
      name: str(market.companyName) || str(market.displayName),
      street: [str(market.street), str(market.houseNumber)].filter(Boolean).join(' '),
      zipCode: str(market.zipCode),
      city: str(market.city),
      distance: num(market.distance),
    }))
    .filter((market) => market.id);
}

/** Produkte aus der Website-Suche (HAL-Format); Produkte ohne Preis oder Listing fallen weg. */
export function parseProducts(data: unknown): ReweProduct[] {
  const products = at(data, '_embedded', 'products');
  return (Array.isArray(products) ? products : [])
    .filter(isObject)
    .map((product): ReweProduct => {
      const listing = at(first(at(product, '_embedded', 'articles')), '_embedded', 'listing');
      const tags = at(product, 'attributes', 'tags');
      return {
        id: str(product.id),
        name: str(product.productName),
        brand: str(at(product, 'brand', 'name')),
        imageUrl: str(at(first(at(product, 'media', 'images')), '_links', 'self', 'href')),
        price: num(at(listing, 'pricing', 'currentRetailPrice')),
        basePrice: num(at(listing, 'pricing', 'basePrice')),
        grammage: str(at(listing, 'pricing', 'grammage')),
        categoryPath: str(at(product, '_embedded', 'categoryPath')),
        tags: isObject(tags) ? Object.keys(tags) : [],
        listingId: str(at(listing, 'id')),
      };
    })
    .filter((product) => product.id && product.name && product.price > 0 && product.listingId);
}

export type ReweClient = {
  markets(zipCode: string): Promise<ReweMarket[]>;
  search(query: string, marketId: string): Promise<ReweProduct[]>;
};

export type ReweClientConfig = {
  db: DatabaseSync;
  fetch?: typeof fetch;
  now?: () => number;
  /** Pause nach jeder Anfrage an REWE, bevor die nächste startet. */
  pauseMs?: number;
  log?: (message: string) => void;
};

export function createReweClient({ db, fetch: fetchImpl = fetch, now = Date.now, pauseMs = 400, log = console.log }: ReweClientConfig): ReweClient {
  db.exec('CREATE TABLE IF NOT EXISTS rewe_cache (key TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, body TEXT NOT NULL)');
  const readCache = db.prepare('SELECT fetched_at, body FROM rewe_cache WHERE key = ?');
  const writeCache = db.prepare('INSERT OR REPLACE INTO rewe_cache (key, fetched_at, body) VALUES (?, ?, ?)');
  const pruneCache = db.prepare('DELETE FROM rewe_cache WHERE fetched_at < ?');

  // Alle Anfragen laufen nacheinander, mit einer Pause dazwischen.
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestEnd = 0;

  const request = async (url: string): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ReweError('REWE ist gerade nicht erreichbar.');
    }
    if (!response.ok) {
      log(`REWE antwortet mit ${response.status} auf ${url}`);
      throw new ReweError(
        response.status === 403 || response.status === 429
          ? 'REWE lässt gerade keine Anfragen zu. Bitte später noch einmal versuchen.'
          : `REWE meldet Fehler ${response.status}.`,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ReweError('REWE hat keine lesbare Antwort geschickt.');
    }
  };

  const fetchJson = (url: string): Promise<unknown> => {
    const run = async () => {
      const wait = lastRequestEnd + pauseMs - now();
      if (wait > 0) await sleep(wait);
      try {
        return await request(url);
      } finally {
        lastRequestEnd = now();
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };

  const cached = async <T>(key: string, ttl: number, url: string, parse: (data: unknown) => T): Promise<T> => {
    const row = readCache.get(key) as { fetched_at: number; body: string } | undefined;
    if (row && now() - row.fetched_at < ttl) return JSON.parse(row.body) as T;
    const value = parse(await fetchJson(url));
    writeCache.run(key, now(), JSON.stringify(value));
    pruneCache.run(now() - MARKETS_TTL);
    return value;
  };

  return {
    markets: (zipCode) =>
      cached(`markets:${zipCode}`, MARKETS_TTL, `${BASE_URL}/marketselection/zipcodes/${zipCode}/services/pickup`, parseMarkets),
    search(query, marketId) {
      const term = query.trim();
      const params = new URLSearchParams({
        search: term,
        storeId: marketId,
        market: marketId,
        objectsPerPage: String(SEARCH_LIMIT),
        page: '1',
        serviceTypes: 'PICKUP',
      });
      return cached(`search:${marketId}:${term.toLocaleLowerCase('de')}`, SEARCH_TTL, `${BASE_URL}/products?${params}`, parseProducts);
    },
  };
}

// ─── Abgleich einer Einkaufsliste ───

export type MatchItem = {
  id: string;
  need: ReweNeed;
  /** Gemerkte Produkte in ihrer Reihenfolge; das erste, das im Markt zu finden ist, hat Vorrang. */
  preferred: RewePreferred[];
};

export type MatchRequest = { marketId: string; organic: boolean; items: MatchItem[] };

export function isMarketId(value: string): boolean {
  return /^\d{1,12}$/.test(value);
}

function shortText(value: unknown): string | null {
  const text = str(value);
  return text && text.length <= MAX_TEXT_LENGTH ? text : null;
}

/** Gemerkte Produkte einer Position; unvollständige fallen weg, mehr als `REWE_MAX_PREFERRED` auch. */
function readPreferred(value: unknown): RewePreferred[] {
  return (Array.isArray(value) ? value : [])
    .filter(isObject)
    .flatMap((entry) => {
      const productId = shortText(entry.productId);
      const name = shortText(entry.name);
      return productId && name ? [{ productId, name }] : [];
    })
    .slice(0, REWE_MAX_PREFERRED);
}

/** Prüft die Anfrage der App; `null`, wenn etwas fehlt oder nicht passt. */
export function readMatchRequest(body: JsonObject): MatchRequest | null {
  const marketId = str(body.market);
  if (!isMarketId(marketId) || !Array.isArray(body.items) || body.items.length > MAX_MATCH_ITEMS) return null;
  const items: MatchItem[] = [];
  for (const item of body.items) {
    if (!isObject(item)) return null;
    const id = shortText(item.id);
    const name = shortText(item.name);
    const category = str(item.category) as FoodCategory;
    if (!id || !name || !FOOD_CATEGORY_IDS.includes(category)) return null;
    const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null;
    items.push({ id, need: { name, category, amount, unit: str(item.unit) }, preferred: readPreferred(item.preferred) });
  }
  return { marketId, organic: body.organic === true, items };
}

/** Sucht und bewertet Produkte für alle Positionen, nacheinander; gemerkte Produkte in ihrer Reihenfolge. */
export async function matchItems(client: ReweClient, request: MatchRequest): Promise<ReweMatchResult[]> {
  const results: ReweMatchResult[] = [];
  for (const item of request.items) {
    const products = await client.search(reweSearchTerm(item.need.name).term, request.marketId);
    const match = matchReweProducts(item.need, products, { organic: request.organic });
    let learned: ReweProduct | undefined;
    for (const { productId, name } of item.preferred) {
      // Ein Abruf per Produkt-ID ist nicht bekannt; also prüfen, ob es in der Suche nach seinem Namen auftaucht.
      learned = products.find((product) => product.id === productId);
      learned ??= (await client.search(name, request.marketId)).find((product) => product.id === productId);
      if (learned) break;
    }
    results.push(
      learned
        ? {
            id: item.id,
            confidence: 'sure',
            learned: true,
            candidates: [rateProduct(item.need, learned), ...match.candidates.filter((candidate) => candidate.id !== learned.id)],
          }
        : { id: item.id, confidence: match.confidence, learned: false, candidates: match.candidates },
    );
  }
  return results;
}
