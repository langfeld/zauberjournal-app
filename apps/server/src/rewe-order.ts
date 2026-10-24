import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import {
  REWE_ORDER_STATUSES,
  type RewePlacedItem,
  type RewePlacementReport,
  type ReweOrder,
  type ReweOrderRequest,
  type ReweOrderStatus,
} from '@zauberjournal/core';

/**
 * Auftrag fürs Userscript: Die App legt ihn ab, das Userscript holt ihn auf rewe.de ab und meldet
 * je Produkt zurück, nach dem Bestellen auch die Bestellung. Es gibt immer nur einen; ein neuer ersetzt den alten.
 */

const MAX_PRODUCTS = 150;
/** Eine Bestellung kann mehr enthalten als der Auftrag, z. B. Angebote. */
const MAX_ORDER_ITEMS = 300;
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

/** Zeitpunkt oder Betrag; `null` = unbekannt, `undefined` = ungültig. */
function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readPlacedItem(value: unknown): RewePlacedItem | null {
  if (!isObject(value)) return null;
  const productId = text(value.productId);
  const name = text(value.name ?? '');
  const { quantity, price } = value;
  if (!productId || name === null) return null;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_PACKS) return null;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  return { productId, name, quantity, price };
}

/**
 * Prüft die Meldung einer Bestellung bei REWE; `order` ist der Zeitpunkt des Auftrags, für den sie gilt. Fehlen die
 * Positionen (`items` `null`), konnte das Userscript sie nicht lesen.
 */
export function readPlacementReport(body: JsonObject): { order: number; report: RewePlacementReport } | null {
  const orderId = text(body.orderId);
  const times = [body.orderedAt, body.pickupStart, body.pickupEnd, body.total].map(optionalNumber);
  if (typeof body.order !== 'number' || !orderId || times.includes(undefined)) return null;
  const [orderedAt, pickupStart, pickupEnd, total] = times as (number | null)[];
  let items: RewePlacedItem[] | null = null;
  if (body.items !== undefined && body.items !== null) {
    if (!Array.isArray(body.items) || body.items.length > MAX_ORDER_ITEMS) return null;
    items = [];
    for (const value of body.items) {
      const item = readPlacedItem(value);
      if (!item) return null;
      items.push(item);
    }
  }
  return { order: body.order, report: { orderId, orderedAt: orderedAt!, pickupStart: pickupStart!, pickupEnd: pickupEnd!, total: total!, items } };
}

function sameReport(a: RewePlacementReport, b: RewePlacementReport): boolean {
  const fields = ({ orderId, orderedAt, pickupStart, pickupEnd, total, items }: RewePlacementReport) =>
    JSON.stringify([orderId, orderedAt, pickupStart, pickupEnd, total, items]);
  return fields(a) === fields(b);
}

export type OrderStore = {
  get(): ReweOrder | null;
  replace(request: ReweOrderRequest): ReweOrder;
  /** Trägt Rückmeldungen ein; `null`, wenn es den Auftrag nicht (mehr) gibt. */
  report(order: number, results: readonly OrderResult[]): ReweOrder | null;
  /**
   * Trägt die Bestellung bei REWE ein; `null`, wenn es den Auftrag nicht (mehr) gibt. Dieselbe Meldung noch einmal
   * ändert nichts; eine andere (geänderte Bestellung) übernimmt die App noch einmal.
   */
  place(order: number, report: RewePlacementReport): ReweOrder | null;
  /**
   * Vergibt die Übernahme der Meldung `reportedAt` an ein Gerät, damit nicht zwei Handys gleichzeitig dieselbe
   * Bestellung übernehmen. Dasselbe Gerät darf noch einmal fragen; `null`, wenn ein anderes sie schon hat oder die
   * Meldung nicht mehr gilt.
   */
  claim(order: number, reportedAt: number, deviceId: string): ReweOrder | null;
  clear(): void;
};

export function createOrderStore(db: DatabaseSync, now: () => number = Date.now): OrderStore {
  db.exec('CREATE TABLE IF NOT EXISTS rewe_order (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)');
  const read = db.prepare('SELECT body FROM rewe_order WHERE id = 1');
  const write = db.prepare('INSERT OR REPLACE INTO rewe_order (id, body) VALUES (1, ?)');
  const remove = db.prepare('DELETE FROM rewe_order WHERE id = 1');

  const get = (): ReweOrder | null => {
    const row = read.get() as { body: string } | undefined;
    // Aufträge älterer Versionen kennen noch keine Bestellung.
    return row ? { placed: null, ...(JSON.parse(row.body) as Omit<ReweOrder, 'placed'>) } : null;
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
        placed: null,
      });
    },
    place(order, report) {
      const current = get();
      if (!current || current.createdAt !== order) return null;
      if (current.placed && sameReport(current.placed, report)) return current;
      const time = now();
      // Jede neue Meldung bekommt einen neuen Zeitpunkt; daran erkennt die App, dass sie noch nicht übernommen ist.
      const reportedAt = Math.max(time, (current.placed?.reportedAt ?? 0) + 1);
      return save({ ...current, updatedAt: time, placed: { ...report, reportedAt, claimedBy: '' } });
    },
    claim(order, reportedAt, deviceId) {
      const current = get();
      const placed = current?.placed;
      if (!current || current.createdAt !== order || !placed || placed.reportedAt !== reportedAt) return null;
      if (placed.claimedBy) return placed.claimedBy === deviceId ? current : null;
      return save({ ...current, placed: { ...placed, claimedBy: deviceId } });
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
