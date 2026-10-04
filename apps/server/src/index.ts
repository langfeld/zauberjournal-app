import { resolve } from 'node:path';

import { startServer } from './server.ts';

const port = Number(process.env.PORT ?? 3000);
const dataDir = resolve(process.env.DATA_DIR ?? 'data');

const server = await startServer({ port, dataDir });
console.log(`Zauberjournal-Server läuft auf Port ${server.port}, Daten in ${dataDir}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}
