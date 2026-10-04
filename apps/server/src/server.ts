import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import { createHousehold } from './household.ts';
import { createSyncServer } from './sync.ts';

export type ServerOptions = {
  port: number;
  dataDir: string;
  log?: (message: string) => void;
};

/** Startet HTTP-API und Sync. Mit `port: 0` wird ein freier Port gewählt (für Tests). */
export async function startServer({ port, dataDir, log = console.log }: ServerOptions) {
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(join(dataDir, 'zauberjournal.db'));
  const household = createHousehold(db);
  const sync = createSyncServer(db, household.authenticate);

  const announceSetupCode = () => {
    const code = household.ensureSetupCode();
    if (code) log(`Einrichtungscode für das erste Gerät: ${code}`);
  };

  const app = createApp(household, (deviceId) => {
    sync.disconnectDevice(deviceId);
    announceSetupCode();
  });

  const server = await new Promise<Server>((resolve) => {
    const listening = serve({ fetch: app.fetch, port }, () => resolve(listening as Server)) as Server;
  });
  server.on('upgrade', sync.handleUpgrade);
  announceSetupCode();

  let closing: Promise<void> | undefined;

  return {
    port: (server.address() as AddressInfo).port,
    household,
    /** Beendet Sync und HTTP-Server; mehrfaches Aufrufen ist unschädlich. */
    close() {
      closing ??= (async () => {
        await sync.destroy();
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        db.close();
      })();
      return closing;
    },
  };
}
