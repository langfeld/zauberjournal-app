import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import { REWE_ORDER_STATUSES, type ReweOrder, type ReweOrderRequest, type ReweOrderStatus } from '@zauberjournal/core';

/**
 * Auftrag fürs Userscript: Die App legt ihn ab, das Userscript holt ihn auf rewe.de ab und meldet
 * je Produkt zurück. Es gibt immer nur einen; ein neuer ersetzt den alten.
 */

const MAX_PRODUCTS = 150;
const MAX_TEXT_LENGTH = 200;
const MAX_URL_LENGTH = 500;
const MAX_PACKS = 99;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH ? value.trim() : null;
}

/** Produktbild, nur über HTTPS; ältere App-Versionen schicken keins, dann bleibt es leer. */
function imageUrlOf(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_URL_LENGTH && value.startsWith('https://') ? value : '';
}

/** Prüft den Auftrag der App; `null`, wenn etwas fehlt oder nicht passt. */
export function readOrderRequest(body: JsonObject): ReweOrderRequest | null {
  const listId = text(body.listId);
  const listName = text(body.listName);
  const marketId = text(body.marketId);
  if (!listId || listName === null || !marketId || !Array.isArray(body.products) || body.products.length > MAX_PRODUCTS) return null;
  const products: ReweOrderRequest['products'] = [];
  for (const product of body.products) {
    if (!isObject(product)) return null;
    const productId = text(product.productId);
    const listingId = text(product.listingId);
    const name = text(product.name);
    const { packs, price, itemIds } = product;
    if (!productId || listingId === null || !name) return null;
    if (typeof packs !== 'number' || !Number.isInteger(packs) || packs < 1 || packs > MAX_PACKS) return null;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
    if (!Array.isArray(itemIds) || !itemIds.every((id) => typeof id === 'string' && id.length <= MAX_TEXT_LENGTH)) return null;
    products.push({ productId, listingId, name, imageUrl: imageUrlOf(product.imageUrl), packs, price, itemIds: itemIds as string[] });
  }
  return { listId, listName, marketId, products };
}

export type OrderResult = { productId: string; status: Exclude<ReweOrderStatus, 'pending'>; message: string };

/** Prüft die Rückmeldung des Userscripts; `order` ist der Zeitpunkt des Auftrags, für den sie gilt. */
export function readOrderResults(body: JsonObject): { order: number; results: OrderResult[] } | null {
  if (typeof body.order !== 'number' || !Array.isArray(body.results) || body.results.length > MAX_PRODUCTS) return null;
  const results: OrderResult[] = [];
  for (const result of body.results) {
    if (!isObject(result)) return null;
    const productId = text(result.productId);
    const status = result.status as ReweOrderStatus;
    if (!productId || status === 'pending' || !REWE_ORDER_STATUSES.includes(status)) return null;
    results.push({ productId, status, message: text(result.message ?? '') ?? '' });
  }
  return { order: body.order, results };
}

export type OrderStore = {
  get(): ReweOrder | null;
  replace(request: ReweOrderRequest): ReweOrder;
  /** Trägt Rückmeldungen ein; `null`, wenn es den Auftrag nicht (mehr) gibt. */
  report(order: number, results: readonly OrderResult[]): ReweOrder | null;
  clear(): void;
};

export function createOrderStore(db: DatabaseSync, now: () => number = Date.now): OrderStore {
  db.exec('CREATE TABLE IF NOT EXISTS rewe_order (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)');
  const read = db.prepare('SELECT body FROM rewe_order WHERE id = 1');
  const write = db.prepare('INSERT OR REPLACE INTO rewe_order (id, body) VALUES (1, ?)');
  const remove = db.prepare('DELETE FROM rewe_order WHERE id = 1');

  const get = (): ReweOrder | null => {
    const row = read.get() as { body: string } | undefined;
    return row ? (JSON.parse(row.body) as ReweOrder) : null;
  };
  const save = (order: ReweOrder): ReweOrder => {
    write.run(JSON.stringify(order));
    return order;
  };

  return {
    get,
    replace(request) {
      const time = now();
      return save({
        ...request,
        createdAt: time,
        updatedAt: time,
        products: request.products.map((product) => ({ ...product, status: 'pending', message: '' })),
      });
    },
    report(order, results) {
      const current = get();
      // Rückmeldungen zu einem älteren Auftrag gelten nicht mehr.
      if (!current || current.createdAt !== order) return null;
      const byProduct = new Map(results.map((result) => [result.productId, result]));
      return save({
        ...current,
        updatedAt: now(),
        products: current.products.map((product) => {
          const result = byProduct.get(product.productId);
          return result ? { ...product, status: result.status, message: result.message } : product;
        }),
      });
    },
    clear() {
      remove.run();
    },
  };
}

// ─── Userscript ausliefern ───

const USERSCRIPT_FILE = 'zauberjournal-rewe.user.js';

/** Im Docker-Image liegt das Userscript neben dem Bündel, beim Entwickeln im Repo. */
const USERSCRIPT_PATHS = [new URL(`./${USERSCRIPT_FILE}`, import.meta.url), new URL(`../../../userscript/${USERSCRIPT_FILE}`, import.meta.url)];

const SERVER_PLACEHOLDER = "const SERVER_FROM_INSTALL = '';";

/** Das Userscript mit der Adresse dieses Servers, damit beim Einrichten nur der Code fehlt. */
export function loadUserscript(serverUrl: string): string | null {
  for (const path of USERSCRIPT_PATHS) {
    let source: string;
    try {
      source = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    return source.replace(SERVER_PLACEHOLDER, `const SERVER_FROM_INSTALL = ${JSON.stringify(serverUrl)};`);
  }
  return null;
}
