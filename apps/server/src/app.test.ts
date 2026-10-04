import { describe, expect, it } from 'vitest';

import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import { createHousehold } from './household.ts';

function setUp() {
  const household = createHousehold(openDatabase(':memory:'));
  const revoked: string[] = [];
  const app = createApp(household, (deviceId) => revoked.push(deviceId));
  const post = (path: string, body: unknown, token?: string) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const get = (path: string, token?: string) =>
    app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { household, app, post, get, revoked };
}

describe('API', () => {
  it('meldet den Server als bereit', async () => {
    const { get } = setUp();
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', name: 'Zauberjournal' });
  });

  it('richtet das erste Gerät ein und verbindet ein zweites per Einladung', async () => {
    const { household, post, get } = setUp();

    expect((await post('/api/setup', { setupCode: 'falsch', deviceName: 'Handy A' })).status).toBe(403);
    expect((await post('/api/setup', { deviceName: 'Handy A' })).status).toBe(400);

    const setup = await post('/api/setup', { setupCode: household.ensureSetupCode(), deviceName: 'Handy A' });
    expect(setup.status).toBe(201);
    const first = (await setup.json()) as { deviceId: string; token: string };

    expect((await post('/api/invites', {})).status).toBe(401);
    const invite = (await (await post('/api/invites', {}, first.token)).json()) as { code: string };

    const pair = await post('/api/pair', { code: invite.code, deviceName: 'Handy B' });
    expect(pair.status).toBe(201);
    const second = (await pair.json()) as { token: string };

    const devices = (await (await get('/api/devices', second.token)).json()) as {
      devices: { name: string; current: boolean }[];
    };
    expect(devices.devices.map((device) => [device.name, device.current])).toEqual([
      ['Handy A', false],
      ['Handy B', true],
    ]);
  });

  it('meldet Geräte ab und sperrt danach ihr Token', async () => {
    const { household, app, get, revoked } = setUp();
    const first = household.setup(household.ensureSetupCode()!, 'Handy A')!;
    const second = household.pair(household.createInvite(null).code, 'Handy B')!;

    const res = await app.request(`/api/devices/${second.deviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${first.token}` },
    });
    expect(res.status).toBe(204);
    expect(revoked).toEqual([second.deviceId]);
    expect((await get('/api/session', second.token)).status).toBe(401);
    expect((await get('/api/session', first.token)).status).toBe(200);
  });
});
