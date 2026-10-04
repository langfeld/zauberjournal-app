import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createId } from '@zauberjournal/core';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import { createHousehold } from './household.ts';
import { createImporter } from './importer.ts';
import { createPhotoStore } from './photos.ts';

const temporaryDirs: string[] = [];
afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function setUp() {
  const household = createHousehold(openDatabase(':memory:'));
  const dir = mkdtempSync(join(tmpdir(), 'zauberjournal-test-'));
  temporaryDirs.push(dir);
  const revoked: string[] = [];
  const app = createApp({
    household,
    photos: createPhotoStore(dir),
    importer: createImporter({ apiKey: '', models: [], log: () => {} }),
    onDeviceRevoked: (deviceId) => revoked.push(deviceId),
  });
  const post = (path: string, body: unknown, token?: string) =>
    app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const get = (path: string, token?: string) =>
    app.request(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const put = (path: string, body: Uint8Array, token?: string) =>
    app.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
    });
  return { household, app, post, get, put, revoked };
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

  it('speichert Fotos und liefert sie wieder aus', async () => {
    const { household, get, put } = setUp();
    const { token } = household.setup(household.ensureSetupCode()!, 'Handy A')!;
    const id = createId();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

    expect((await put(`/api/photos/${id}`, jpeg)).status).toBe(401);
    expect((await put(`/api/photos/${id}`, jpeg, token)).status).toBe(204);
    // Eine ID gehört immer zum selben Foto; ein zweiter Upload ändert nichts.
    expect((await put(`/api/photos/${id}`, new Uint8Array([0xff, 0xd8, 0xff, 9]), token)).status).toBe(204);

    const res = await get(`/api/photos/${id}`, token);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(jpeg);

    expect((await get(`/api/photos/${id}`)).status).toBe(401);
    expect((await get(`/api/photos/${createId()}`, token)).status).toBe(404);
    expect((await put('/api/photos/..%2Fzauberjournal.db', jpeg, token)).status).toBe(400);
    expect((await put(`/api/photos/${createId()}`, new TextEncoder().encode('kein Bild'), token)).status).toBe(415);
  });

  it('importiert nur für angemeldete Geräte und meldet fehlende Angaben', async () => {
    const { household, post } = setUp();
    const { token } = household.setup(household.ensureSetupCode()!, 'Handy A')!;

    expect((await post('/api/import', { text: 'Rezept' })).status).toBe(401);

    const empty = await post('/api/import', {}, token);
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'Bitte ein Foto, einen Link oder einen Text angeben.' });

    const withoutKey = await post('/api/import', { text: 'Rezept' }, token);
    expect(withoutKey.status).toBe(503);
  });
});
