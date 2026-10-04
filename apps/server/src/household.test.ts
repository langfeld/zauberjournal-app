import { describe, expect, it } from 'vitest';

import { openDatabase } from './database.ts';
import { createHousehold, INVITE_LIFETIME_MS, normalizeCode } from './household.ts';

function setUp() {
  let time = 1_000_000;
  const household = createHousehold(openDatabase(':memory:'), () => time);
  return { household, advance: (ms: number) => (time += ms) };
}

describe('Einrichtung', () => {
  it('gibt einen Einrichtungscode aus, bis das erste Gerät verbunden ist', () => {
    const { household } = setUp();
    const code = household.ensureSetupCode()!;
    expect(code).toMatch(/^[0-9A-Z]{12}$/);
    expect(household.ensureSetupCode()).toBe(code);

    expect(household.setup('falsch', 'Handy')).toBeNull();
    const credentials = household.setup(code.toLowerCase(), 'Handy')!;
    expect(credentials.token.length).toBeGreaterThan(30);

    expect(household.ensureSetupCode()).toBeNull();
    expect(household.setup(code, 'Noch ein Handy')).toBeNull();
  });

  it('liest O, I und L wie 0 und 1', () => {
    expect(normalizeCode('o1-il ab')).toBe('0111AB');
  });
});

describe('Einladungen', () => {
  it('verbindet ein zweites Gerät genau einmal pro Code', () => {
    const { household } = setUp();
    household.setup(household.ensureSetupCode()!, 'Handy A');
    const { code } = household.createInvite(null);

    const second = household.pair(code, 'Handy B');
    expect(second).not.toBeNull();
    expect(household.pair(code, 'Handy C')).toBeNull();
    expect(household.listDevices().map((device) => device.name)).toEqual(['Handy A', 'Handy B']);
  });

  it('lässt abgelaufene Codes nicht mehr zu', () => {
    const { household, advance } = setUp();
    const { code } = household.createInvite(null);
    advance(INVITE_LIFETIME_MS + 1);
    expect(household.pair(code, 'Handy B')).toBeNull();
  });
});

describe('Anmeldung', () => {
  it('erkennt gültige Tokens und sperrt abgemeldete Geräte', () => {
    const { household } = setUp();
    const { deviceId, token } = household.setup(household.ensureSetupCode()!, 'Handy A')!;

    expect(household.authenticate(token)?.id).toBe(deviceId);
    expect(household.authenticate('unbekannt')).toBeNull();

    expect(household.revokeDevice(deviceId)).toBe(true);
    expect(household.authenticate(token)).toBeNull();
    expect(household.revokeDevice(deviceId)).toBe(false);
    // Ohne aktive Geräte gibt es wieder einen Einrichtungscode.
    expect(household.ensureSetupCode()).not.toBeNull();
  });
});
