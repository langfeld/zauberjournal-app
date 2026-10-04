import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { createId } from '@zauberjournal/core';

/** Crockford-Base32: ohne I, L, O, U; 32 Zeichen, damit `byte % 32` gleichverteilt ist. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SETUP_CODE_LENGTH = 12;
const INVITE_CODE_LENGTH = 8;
export const INVITE_LIFETIME_MS = 15 * 60 * 1000;

export type Device = { id: string; name: string; createdAt: number; lastSeenAt: number | null };
export type DeviceCredentials = { deviceId: string; token: string };

type DeviceRow = { id: string; name: string; created_at: number; last_seen_at: number | null };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomCode(length: number): string {
  let code = '';
  for (const byte of randomBytes(length)) code += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
  return code;
}

/** Großschreibung, Leerzeichen und Bindestriche entfernen; O/I/L wie 0/1 lesen, damit Tippfehler passen. */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

function toDevice(row: DeviceRow): Device {
  return { id: row.id, name: row.name, createdAt: row.created_at, lastSeenAt: row.last_seen_at };
}

/**
 * Der Haushalt auf diesem Server: Geräte, Einladungen und der Einrichtungscode.
 * Tokens und Codes werden nur als SHA-256-Hash gespeichert.
 */
export function createHousehold(db: DatabaseSync, now: () => number = Date.now) {
  const statements = {
    countActive: db.prepare('SELECT COUNT(*) AS count FROM devices WHERE revoked_at IS NULL'),
    insertDevice: db.prepare('INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)'),
    deviceByToken: db.prepare(
      'SELECT id, name, created_at, last_seen_at FROM devices WHERE token_hash = ? AND revoked_at IS NULL',
    ),
    touchDevice: db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?'),
    activeDevices: db.prepare(
      'SELECT id, name, created_at, last_seen_at FROM devices WHERE revoked_at IS NULL ORDER BY created_at',
    ),
    revokeDevice: db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
    deleteSetting: db.prepare('DELETE FROM settings WHERE key = ?'),
    insertInvite: db.prepare('INSERT INTO invites (code_hash, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    useInvite: db.prepare(
      'UPDATE invites SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?',
    ),
  };

  const hasActiveDevices = () => (statements.countActive.get() as { count: number }).count > 0;

  const addDevice = (name: string): DeviceCredentials => {
    const deviceId = createId();
    const token = randomBytes(32).toString('base64url');
    statements.insertDevice.run(deviceId, name, sha256(token), now());
    return { deviceId, token };
  };

  return {
    hasActiveDevices,

    /** Liefert den Einrichtungscode, solange noch kein Gerät verbunden ist; sonst `null`. */
    ensureSetupCode(): string | null {
      if (hasActiveDevices()) return null;
      const existing = statements.getSetting.get('setupCode') as { value: string } | undefined;
      if (existing) return existing.value;
      const code = randomCode(SETUP_CODE_LENGTH);
      statements.setSetting.run('setupCode', code);
      return code;
    },

    /** Richtet das erste Gerät mit dem Einrichtungscode ein. */
    setup(code: string, deviceName: string): DeviceCredentials | null {
      if (hasActiveDevices()) return null;
      const stored = statements.getSetting.get('setupCode') as { value: string } | undefined;
      if (!stored || sha256(normalizeCode(code)) !== sha256(stored.value)) return null;
      statements.deleteSetting.run('setupCode');
      return addDevice(deviceName);
    },

    /** Erzeugt einen Einmal-Code, mit dem ein weiteres Gerät beitreten kann. */
    createInvite(createdBy: string | null): { code: string; expiresAt: number } {
      const code = randomCode(INVITE_CODE_LENGTH);
      const expiresAt = now() + INVITE_LIFETIME_MS;
      statements.insertInvite.run(sha256(code), createdBy, now(), expiresAt);
      return { code, expiresAt };
    },

    /** Verbindet ein Gerät mit einem gültigen Einladungscode; der Code ist danach verbraucht. */
    pair(code: string, deviceName: string): DeviceCredentials | null {
      const result = statements.useInvite.run(now(), sha256(normalizeCode(code)), now());
      if (Number(result.changes) !== 1) return null;
      return addDevice(deviceName);
    },

    /** Prüft ein Token und merkt sich, wann das Gerät zuletzt da war. */
    authenticate(token: string): Device | null {
      const row = statements.deviceByToken.get(sha256(token)) as DeviceRow | undefined;
      if (!row) return null;
      statements.touchDevice.run(now(), row.id);
      return toDevice(row);
    },

    listDevices(): Device[] {
      return (statements.activeDevices.all() as DeviceRow[]).map(toDevice);
    },

    revokeDevice(deviceId: string): boolean {
      return Number(statements.revokeDevice.run(now(), deviceId).changes) === 1;
    },
  };
}

export type Household = ReturnType<typeof createHousehold>;
