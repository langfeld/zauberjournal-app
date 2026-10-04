import { serve } from '@hono/node-server';

import { app } from './app.ts';

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Zauberjournal-Server läuft auf Port ${info.port}`);
});
