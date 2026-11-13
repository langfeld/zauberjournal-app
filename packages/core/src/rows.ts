import type { TableName } from './schema.ts';
import { compareSortKeys } from './sort-keys.ts';

export type Table<R> = Readonly<Record<string, R>>;

export type CellValue = string | number | boolean | null;

/** Eine Schreiboperation: nur die geänderten Zellen einer Zeile (für `setPartialRow`). */
export type RowWrite = { table: TableName; rowId: string; cells: Record<string, CellValue> };

export function isActive(row: { deletedAt?: number | null }): boolean {
  return row.deletedAt === null || row.deletedAt === undefined;
}

/** Aktive Zeilen nach Sortierschlüssel, bei Gleichstand nach ID. */
export function activeSorted<R extends { sortKey: string; deletedAt: number | null }>(
  table: Table<R>,
  belongs: (row: R) => boolean,
): [string, R][] {
  return Object.entries(table)
    .filter(([, row]) => isActive(row) && belongs(row))
    .sort(([idA, a], [idB, b]) => compareSortKeys(a.sortKey, b.sortKey) || compareSortKeys(idA, idB));
}

/**
 * „Rückgängig“ für `writes`, ausgerechnet vor dem Schreiben: Jede Zelle bekommt ihren Wert aus `tables` zurück.
 * Zeilen, die es vorher nicht gab, gelten danach als gelöscht (`deletedAt`).
 */
export function revertWrites(
  tables: Readonly<Record<string, Table<Readonly<Record<string, unknown>>>>>,
  writes: readonly RowWrite[],
  now: number,
): RowWrite[] {
  const reverts = new Map<string, RowWrite>();
  for (const { table, rowId, cells } of writes) {
    const existing = tables[table]?.[rowId];
    const key = `${table}/${rowId}`;
    let revert = reverts.get(key);
    if (!revert) {
      revert = { table, rowId, cells: existing ? {} : { deletedAt: now } };
      reverts.set(key, revert);
    }
    if (!existing) continue;
    // Bei mehreren Änderungen derselben Zelle zählt der Wert vor der ersten.
    for (const cell of Object.keys(cells)) if (!(cell in revert.cells)) revert.cells[cell] = (existing[cell] ?? null) as CellValue;
  }
  return [...reverts.values()].filter((revert) => Object.keys(revert.cells).length > 0);
}

/** Schreibt nur die Zellen, die sich gegenüber `existing` ändern; `null`, wenn nichts zu tun ist. */
export function changedCells(
  table: TableName,
  rowId: string,
  existing: Readonly<Record<string, unknown>> | undefined,
  desired: Record<string, CellValue>,
): RowWrite | null {
  const cells: Record<string, CellValue> = {};
  for (const [cell, value] of Object.entries(desired)) {
    if (!existing || existing[cell] !== value) cells[cell] = value;
  }
  return Object.keys(cells).length > 0 ? { table, rowId, cells } : null;
}
