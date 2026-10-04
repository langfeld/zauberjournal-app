import { resolve } from 'node:path';

import { DEFAULT_FALLBACK_MODEL, DEFAULT_IMPORT_MODEL, REQUESTY_BASE_URL } from './importer.ts';
import { startServer } from './server.ts';

const port = Number(process.env.PORT ?? 3000);
const dataDir = resolve(process.env.DATA_DIR ?? 'data');

// Ein leeres IMPORT_FALLBACK_MODEL schaltet den Fallback ab.
const primaryModel = process.env.IMPORT_MODEL?.trim() || DEFAULT_IMPORT_MODEL;
const fallbackModel = process.env.IMPORT_FALLBACK_MODEL?.trim() ?? DEFAULT_FALLBACK_MODEL;

const server = await startServer({
  port,
  dataDir,
  importer: {
    apiKey: process.env.REQUESTY_API_KEY?.trim() ?? '',
    models: [...new Set([primaryModel, fallbackModel].filter(Boolean))],
    baseUrl: process.env.REQUESTY_BASE_URL?.trim() || REQUESTY_BASE_URL,
  },
});
console.log(`Zauberjournal-Server läuft auf Port ${server.port}, Daten in ${dataDir}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}
