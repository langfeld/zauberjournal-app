import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { startServer } from './server.ts';

type RunningServer = Awaited<ReturnType<typeof startServer>>;

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function start(dataDir: string): Promise<RunningServer> {
  const server = await startServer({ port: 0, dataDir, log: () => {} });
  cleanups.push(() => server.close());
  return server;
}

function temporaryDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'zauberjournal-test-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function connect(server: RunningServer, token: string): Promise<{ store: MergeableStore; socket: WebSocket }> {
  const store = createMergeableStore();
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/sync`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const synchronizer = await createWsSynchronizer(store, socket);
  await synchronizer.startSync();
  cleanups.push(async () => {
    await synchronizer.destroy();
  });
  return { store, socket };
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('Zeitüberschreitung beim Warten auf den Sync');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function setUpDevices(server: RunningServer) {
  const first = server.household.setup(server.household.ensureSetupCode()!, 'Handy A')!;
  const second = server.household.pair(server.household.createInvite(null).code, 'Handy B')!;
  return { first, second };
}

describe('Sync', () => {
  it('überträgt Änderungen zwischen zwei Geräten in beide Richtungen', async () => {
    const server = await start(temporaryDir());
    const { first, second } = setUpDevices(server);
    const a = await connect(server, first.token);
    const b = await connect(server, second.token);

    a.store.setCell('recipes', 'r1', 'title', 'Sättigender Salat');
    await waitFor(() => b.store.getCell('recipes', 'r1', 'title') === 'Sättigender Salat');

    b.store.setCell('recipes', 'r1', 'servings', 4);
    await waitFor(() => a.store.getCell('recipes', 'r1', 'servings') === 4);
  });

  it('weist Verbindungen ohne gültiges Token ab', async () => {
    const server = await start(temporaryDir());
    const status = await new Promise<number>((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${server.port}/api/sync`, {
        headers: { Authorization: 'Bearer falsch' },
      });
      socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
      socket.on('error', () => resolve(-1));
    });
    expect(status).toBe(401);
  });

  it('behält die Daten nach einem Neustart des Servers', async () => {
    const dataDir = temporaryDir();
    const server = await start(dataDir);
    const { first } = setUpDevices(server);
    const a = await connect(server, first.token);
    a.store.setCell('recipes', 'r1', 'title', 'Linsensuppe');
    // Kurz warten, bis der Server den Stand gespeichert hat.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await server.close();

    const restarted = await start(dataDir);
    const fresh = await connect(restarted, first.token);
    await waitFor(() => fresh.store.getCell('recipes', 'r1', 'title') === 'Linsensuppe');
  });

  it('trennt abgemeldete Geräte sofort', async () => {
    const server = await start(temporaryDir());
    const { first, second } = setUpDevices(server);
    const b = await connect(server, second.token);
    const closed = new Promise<number>((resolve) => b.socket.on('close', (code) => resolve(code)));

    const res = await fetch(`http://127.0.0.1:${server.port}/api/devices/${second.deviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${first.token}` },
    });
    expect(res.status).toBe(204);
    expect(await closed).toBe(4001);
  });
});
