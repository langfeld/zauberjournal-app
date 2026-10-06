import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { serve } from '@hono/node-server';

import { createApp } from './app.ts';
import { openDatabase } from './database.ts';
import { createHousehold } from './household.ts';
import { createFoodDuplicates } from './food-duplicates.ts';
import { createImporter, REQUESTY_BASE_URL, type ImporterConfig } from './importer.ts';
import { createMealClassifier } from './meal-classifier.ts';
import { createNutrition } from './nutrition.ts';
import { createPhotoStore } from './photos.ts';
import { createReweClient } from './rewe.ts';
import { createOrderStore } from './rewe-order.ts';
import { createSyncServer } from './sync.ts';

export type ServerOptions = {
  port: number;
  dataDir: string;
  /** KI-Import über Requesty; ohne Schlüssel gehen nur Links mit Rezeptdaten. */
  importer?: Omit<ImporterConfig, 'log'>;
  log?: (message: string) => void;
};

/** Startet HTTP-API und Sync. Mit `port: 0` wird ein freier Port gewählt (für Tests). */
export async function startServer({
  port,
  dataDir,
  importer: importerConfig = { apiKey: '', models: [] },
  log = console.log,
}: ServerOptions) {
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(join(dataDir, 'zauberjournal.db'));
  const household = createHousehold(db);
  const sync = createSyncServer(db, household.authenticate);
  const photos = createPhotoStore(join(dataDir, 'photos'));
  const importer = createImporter({ ...importerConfig, log });
  // Dieselbe KI wie beim Import ordnet Zutaten dem BLS zu, findet doppelte Lebensmittel und ordnet Rezepte Mahlzeiten zu.
  const ai = { apiKey: importerConfig.apiKey, models: importerConfig.models, baseUrl: importerConfig.baseUrl ?? REQUESTY_BASE_URL };

  const announceSetupCode = () => {
    const code = household.ensureSetupCode();
    if (code) log(`Einrichtungscode für das erste Gerät: ${code}`);
  };

  const app = createApp({
    household,
    photos,
    importer,
    rewe: createReweClient({ db, log }),
    orders: createOrderStore(db),
    nutrition: createNutrition({ db, ai, log }),
    duplicates: createFoodDuplicates({ ai, log }),
    meals: createMealClassifier({ ai, log }),
    onDeviceRevoked: (deviceId) => {
      sync.disconnectDevice(deviceId);
      announceSetupCode();
    },
  });

  const server = await new Promise<Server>((resolve) => {
    const listening = serve({ fetch: app.fetch, port }, () => resolve(listening as Server)) as Server;
  });
  server.on('upgrade', sync.handleUpgrade);
  log(
    importer.available
      ? `KI-Import mit ${importer.models.join(', ersatzweise ')}`
      : 'KI-Import aus, weil REQUESTY_API_KEY fehlt. Links mit Rezeptdaten lassen sich trotzdem importieren.',
  );
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
