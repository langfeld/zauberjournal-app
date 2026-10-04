import { DatabaseSync } from 'node:sqlite';

/** Öffnet die Server-Datenbank und legt die eigenen Tabellen an. `':memory:'` für Tests. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS invites (
      code_hash TEXT PRIMARY KEY,
      created_by TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}
