import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { openDatabase } from './database.ts';
import { createReweClient, matchItems, parseMarkets, parseProducts, readMatchRequest, type ReweClient } from './rewe.ts';

/** Echte Antworten der REWE-Website vom 5.10.2026, gekürzt; die Märkte sind erfunden. */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
}

const MARKET = '1234567';

describe('REWE', () => {
  it('liest die Märkte zu einer Postleitzahl', () => {
    const markets = parseMarkets(fixture('rewe-markets.json'));
    expect(markets).toEqual([
      { id: MARKET, name: 'REWE Muster oHG', street: 'Hauptstr. 1', zipCode: '12345', city: 'Musterstadt', distance: 2150 },
      { id: '7654321', name: 'REWE Beispiel GmbH', street: 'Bahnhofstr. 12', zipCode: '12346', city: 'Beispieldorf', distance: 8400 },
    ]);
  });

  it('liest Produkte aus der Suche', () => {
    const products = parseProducts(fixture('rewe-search-zwiebeln.json'));
    expect(products.map((product) => product.name)).toEqual(['Zwiebeln 1,5kg', 'REWE Bio Zwiebeln rot 500g', 'Zwiebel gelb ca. 100g']);
    expect(products[0]).toEqual({
      id: '9578896',
      name: 'Zwiebeln 1,5kg',
      brand: '',
      imageUrl: 'https://img.rewe-static.de/9578896/50530242_digital-image.png',
      price: 159,
      basePrice: 106,
      grammage: '1,50kg (1 kg = 1,06 €)',
      categoryPath: 'Obst & Gemüse/Frisches Gemüse/Zwiebeln & Knoblauch/',
      tags: [],
      listingId: '8-RHN5TTNE-00000000-0000-4000-8000-000000000000',
    });
    expect(products[1]?.tags).toEqual(['organic']);
    expect(parseProducts({})).toEqual([]);
  });

  it('speichert Suchergebnisse einige Stunden zwischen', async () => {
    const urls: string[] = [];
    let time = 0;
    const client = createReweClient({
      db: openDatabase(':memory:'),
      fetch: async (url) => {
        urls.push(String(url));
        return Response.json(fixture('rewe-search-zwiebeln.json'));
      },
      now: () => time,
      pauseMs: 0,
      log: () => {},
    });

    expect(await client.search('Zwiebeln', MARKET)).toHaveLength(3);
    expect(await client.search(' zwiebeln ', MARKET)).toHaveLength(3);
    expect(urls).toHaveLength(1);
    const params = new URL(urls[0]!).searchParams;
    expect([params.get('search'), params.get('market'), params.get('serviceTypes')]).toEqual(['Zwiebeln', MARKET, 'PICKUP']);

    time += 7 * 60 * 60 * 1000;
    await client.search('Zwiebeln', MARKET);
    expect(urls).toHaveLength(2);
  });

  it('fragt REWE nacheinander und mit Pause', async () => {
    const events: string[] = [];
    const client = createReweClient({
      db: openDatabase(':memory:'),
      fetch: async (url) => {
        const term = new URL(String(url)).searchParams.get('search');
        events.push(`start ${term}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        events.push(`end ${term}`);
        return Response.json({ _embedded: { products: [] } });
      },
      pauseMs: 30,
      log: () => {},
    });
    const started = Date.now();
    await Promise.all([client.search('Milch', MARKET), client.search('Eier', MARKET)]);
    expect(events).toEqual(['start Milch', 'end Milch', 'start Eier', 'end Eier']);
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
  });

  it('meldet Sperren und Ausfälle verständlich', async () => {
    const failing = (fetchImpl: typeof fetch) =>
      createReweClient({ db: openDatabase(':memory:'), fetch: fetchImpl, pauseMs: 0, log: () => {} });

    await expect(failing(async () => new Response('', { status: 403 })).markets('12345')).rejects.toThrow(
      'REWE lässt gerade keine Anfragen zu.',
    );
    await expect(failing(async () => new Response('', { status: 500 })).markets('12345')).rejects.toThrow('REWE meldet Fehler 500.');
    await expect(
      failing(async () => {
        throw new TypeError('fetch failed');
      }).markets('12345'),
    ).rejects.toThrow('REWE ist gerade nicht erreichbar.');
    await expect(failing(async () => new Response('<html>')).markets('12345')).rejects.toThrow('keine lesbare Antwort');
  });

  it('prüft die Anfrage für den Abgleich', () => {
    const item = { id: 'a', name: 'Zwiebeln', category: 'produce', amount: 2, unit: 'Stück' };
    expect(readMatchRequest({ market: MARKET, items: [item] })).toEqual({
      marketId: MARKET,
      organic: false,
      items: [{ id: 'a', need: { name: 'Zwiebeln', category: 'produce', amount: 2, unit: 'Stück' }, preferred: null }],
    });
    expect(readMatchRequest({ market: MARKET, organic: true, items: [{ ...item, amount: null, preferred: { productId: '1', name: 'X' } }] }))
      .toMatchObject({ organic: true, items: [{ need: { amount: null }, preferred: { productId: '1', name: 'X' } }] });
    expect(readMatchRequest({ items: [item] })).toBeNull();
    expect(readMatchRequest({ market: 'Musterstadt', items: [item] })).toBeNull();
    expect(readMatchRequest({ market: MARKET, items: [{ ...item, category: 'Gemüse' }] })).toBeNull();
    expect(readMatchRequest({ market: MARKET, items: [{ ...item, name: '' }] })).toBeNull();
    expect(readMatchRequest({ market: MARKET, items: Array.from({ length: 26 }, () => item) })).toBeNull();
  });

  it('gleicht Positionen ab und nimmt gelernte Produkte, wenn es sie gibt', async () => {
    const onions = parseProducts(fixture('rewe-search-zwiebeln.json'));
    const searches: string[] = [];
    const client: ReweClient = {
      markets: async () => [],
      search: async (query) => {
        searches.push(query);
        return query === 'Zwiebeln' ? onions : [];
      },
    };
    const need = { name: 'Zwiebeln', category: 'produce' as const, amount: 500, unit: 'g' };
    const results = await matchItems(client, {
      marketId: MARKET,
      organic: false,
      items: [
        { id: 'neu', need, preferred: null },
        { id: 'gelernt', need, preferred: { productId: '8919738', name: 'REWE Bio Zwiebeln rot 500g' } },
        { id: 'weg', need, preferred: { productId: '123', name: 'Alte Zwiebeln' } },
      ],
    });

    expect(results.map(({ id, confidence, learned }) => [id, confidence, learned])).toEqual([
      ['neu', 'sure', false],
      ['gelernt', 'sure', true],
      ['weg', 'sure', false],
    ]);
    expect(results[1]?.candidates[0]).toMatchObject({ id: '8919738', packs: 1, total: 175 });
    expect(results[1]?.candidates.filter((candidate) => candidate.id === '8919738')).toHaveLength(1);
    // Nicht in der ersten Suche: Das gelernte Produkt wird unter seinem Namen gesucht.
    expect(searches).toEqual(['Zwiebeln', 'Zwiebeln', 'Zwiebeln', 'Alte Zwiebeln']);
  });
});
