import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type OrderEntry = { orderId: string; orderedAt: number | null; total: number | null; pickupStart: number | null; pickupEnd: number | null };
type OrderDetail = Omit<OrderEntry, 'orderId'> & { items: { productId: string; name: string; quantity: number; price: number }[] };
type OrderReader = {
  readOrderList: (data: unknown) => OrderEntry[];
  readOrderDetail: (data: unknown) => OrderDetail;
  orderKey: (value: unknown) => string;
};

/**
 * Das Userscript liest die Bestellungen von rewe.de selbst. Der Teil dafür braucht keinen Browser; der Test nimmt ihn
 * aus dem Script und prüft ihn mit echten Antworten der Website (ohne persönliche Daten, Bestellnummern erfunden).
 */
function loadOrderReader(): OrderReader {
  const source = readFileSync(new URL('../../../userscript/zauberjournal-rewe.user.js', import.meta.url), 'utf8');
  const section = source.slice(source.indexOf('// ─── REWE-Bestellungen ───'), source.indexOf('// ─── Oberfläche ───'));
  return new Function(`${section}\nreturn { readOrderList, readOrderDetail, orderKey };`)() as OrderReader;
}

const { readOrderList, readOrderDetail, orderKey } = loadOrderReader();
const fixture = JSON.parse(readFileSync(new URL('./fixtures/rewe-orders.json', import.meta.url), 'utf8'));
const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).getTime();

describe('Bestellungen von rewe.de im Userscript', () => {
  it('liest die Liste mit Bestellzeit, Abholfenster und Wert in deutscher Zeit', () => {
    const orders = readOrderList(fixture.list);
    expect(orders.map((order) => order.orderId)).toEqual(['B-AB1-CD2-EF3', 'B-GH4-JK5-LM6', 'B-NP7-QR8-ST9']);
    expect(orders[0]).toEqual({ orderId: 'B-AB1-CD2-EF3', orderedAt: at(23, 23, 59), total: 3916, pickupStart: at(24, 13, 0), pickupEnd: at(24, 15, 30) });
    // Stornierte Bestellungen zählen nicht.
    expect(readOrderList({ orders: [{ ...fixture.list.orders[0], status: 'cancelled' }] })).toEqual([]);
    expect(readOrderList({})).toEqual([]);
  });

  it('nimmt nach dem Packen, was es wirklich gab, ohne Abholgebühr und Pfand', () => {
    const detail = readOrderDetail(fixture.detail);
    // Blattspinat fehlte, die Rispentomaten wogen 212 g statt „ca. 100 g“.
    expect(detail.items.map(({ name, quantity }) => [name, quantity])).toEqual([
      ['Salatgurke 1 Stück', 1],
      ['REWE Bio Mini Mozzarella 125g', 1],
      ['Marka Hellas Halloumi 225g', 3],
      ['Rispentomaten ca. 100g', 2.12],
      ['Kiwi grün 1 Stück', 2],
    ]);
    expect(detail.items[2]).toEqual({ productId: '8967097', name: 'Marka Hellas Halloumi 225g', quantity: 3, price: 279 });
    expect(detail).toMatchObject({ orderedAt: at(23, 23, 59), total: 3916, pickupStart: at(24, 13, 0), pickupEnd: at(24, 15, 30) });
  });

  it('nimmt vor dem Packen die bestellten Mengen', () => {
    const subOrder = fixture.detail.subOrders[0];
    const open = {
      ...fixture.detail,
      status: 'open',
      subOrders: [
        {
          ...subOrder,
          status: 'open',
          lineItems: subOrder.lineItems.map((line: object) => ({ ...line, actualAmount: null, actualTotalPrice: null, actualUnitPrice: null })),
        },
      ],
    };
    expect(readOrderDetail(open).items.map(({ name, quantity }) => [name, quantity])).toEqual([
      ['Salatgurke 1 Stück', 1],
      ['REWE Bio Mini Mozzarella 125g', 1],
      ['Blattspinat', 1],
      ['Marka Hellas Halloumi 225g', 3],
      ['Rispentomaten ca. 100g', 1],
      ['Kiwi grün 1 Stück', 2],
    ]);
    expect(readOrderDetail(null)).toEqual({ orderedAt: null, total: null, items: [], pickupStart: null, pickupEnd: null });
  });

  it('erkennt die Bestellnummer der Bestätigungsseite in jeder Schreibweise', () => {
    expect(orderKey(' b-ab1 cd2-ef3 ')).toBe(orderKey('B-AB1-CD2-EF3'));
    expect(orderKey('B-AB1-CD2-EF3')).not.toBe(orderKey('B-GH4-JK5-LM6'));
  });
});
