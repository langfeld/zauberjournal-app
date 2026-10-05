import { APP_NAME } from '@zauberjournal/core';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';

import type { Device, Household } from './household.ts';
import { ImportError, readImportRequest, type Importer } from './importer.ts';
import { isJpeg, isPhotoId, type PhotoStore } from './photos.ts';
import { isMarketId, matchItems, readMatchRequest, ReweError, type ReweClient } from './rewe.ts';

type Env = { Variables: { device: Device } };

const MAX_NAME_LENGTH = 60;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_BYTES = 40 * 1024 * 1024;

export function bearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match ? match[1]! : null;
}

async function readBody(c: Context): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export type AppOptions = {
  household: Household;
  photos: PhotoStore;
  importer: Importer;
  rewe: ReweClient;
  /** Wird aufgerufen, nachdem ein Gerät abgemeldet wurde (z. B. um offene Sync-Verbindungen zu trennen). */
  onDeviceRevoked?: (deviceId: string) => void;
};

/** HTTP-API des Servers. */
export function createApp({ household, photos, importer, rewe, onDeviceRevoked = () => {} }: AppOptions) {
  const app = new Hono<Env>();
  app.use('/api/*', cors());

  app.get('/api/health', (c) => c.json({ status: 'ok', name: APP_NAME }));

  app.post('/api/setup', async (c) => {
    const body = await readBody(c);
    const code = text(body.setupCode);
    const name = text(body.deviceName);
    if (!code || !name || name.length > MAX_NAME_LENGTH) {
      return c.json({ error: 'Bitte Einrichtungscode und Gerätenamen angeben.' }, 400);
    }
    const credentials = household.setup(code, name);
    if (!credentials) {
      return c.json({ error: 'Der Einrichtungscode stimmt nicht, oder der Haushalt ist schon eingerichtet.' }, 403);
    }
    return c.json(credentials, 201);
  });

  app.post('/api/pair', async (c) => {
    const body = await readBody(c);
    const code = text(body.code);
    const name = text(body.deviceName);
    if (!code || !name || name.length > MAX_NAME_LENGTH) {
      return c.json({ error: 'Bitte Einladungscode und Gerätenamen angeben.' }, 400);
    }
    const credentials = household.pair(code, name);
    if (!credentials) return c.json({ error: 'Der Einladungscode ist ungültig oder abgelaufen.' }, 403);
    return c.json(credentials, 201);
  });

  const requireDevice = createMiddleware<Env>(async (c, next) => {
    const token = bearerToken(c.req.header('Authorization'));
    const device = token ? household.authenticate(token) : null;
    if (!device) return c.json({ error: 'Dieses Gerät ist nicht (mehr) angemeldet.' }, 401);
    c.set('device', device);
    await next();
  });

  app.get('/api/session', requireDevice, (c) => c.json({ device: c.get('device') }));

  app.post('/api/invites', requireDevice, (c) => c.json(household.createInvite(c.get('device').id), 201));

  app.get('/api/devices', requireDevice, (c) => {
    const currentId = c.get('device').id;
    return c.json({
      devices: household.listDevices().map((device) => ({ ...device, current: device.id === currentId })),
    });
  });

  app.delete('/api/devices/:id', requireDevice, (c) => {
    const deviceId = c.req.param('id');
    if (!household.revokeDevice(deviceId)) return c.json({ error: 'Dieses Gerät gibt es nicht.' }, 404);
    onDeviceRevoked(deviceId);
    return c.body(null, 204);
  });

  app.post(
    '/api/import',
    requireDevice,
    bodyLimit({ maxSize: MAX_IMPORT_BYTES, onError: (c) => c.json({ error: 'Die Bilder sind zusammen zu groß.' }, 413) }),
    async (c) => {
      try {
        const request = readImportRequest(await readBody(c));
        return c.json({ recipe: await importer.importRecipe(request) });
      } catch (error) {
        if (error instanceof ImportError) return c.json({ error: error.message }, error.status);
        throw error;
      }
    },
  );

  app.put(
    '/api/photos/:id',
    requireDevice,
    bodyLimit({ maxSize: MAX_PHOTO_BYTES, onError: (c) => c.json({ error: 'Das Foto ist zu groß.' }, 413) }),
    async (c) => {
      const id = c.req.param('id');
      if (!isPhotoId(id)) return c.json({ error: 'Ungültige Foto-ID.' }, 400);
      const data = new Uint8Array(await c.req.arrayBuffer());
      if (!isJpeg(data)) return c.json({ error: 'Erwartet wird ein Foto im JPEG-Format.' }, 415);
      await photos.save(id, data);
      return c.body(null, 204);
    },
  );

  app.get('/api/photos/:id', requireDevice, async (c) => {
    const id = c.req.param('id');
    const data = isPhotoId(id) ? await photos.read(id) : null;
    if (!data) return c.json({ error: 'Dieses Foto gibt es nicht.' }, 404);
    // Ein Foto ändert sich nie; die App darf es dauerhaft zwischenspeichern.
    return c.body(data, 200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
  });

  /** Gibt Fehler von REWE als Meldung an die App weiter. */
  const askRewe = async <T extends object>(c: Context<Env>, ask: () => Promise<T>) => {
    try {
      return c.json(await ask());
    } catch (error) {
      if (error instanceof ReweError) return c.json({ error: error.message }, error.status);
      throw error;
    }
  };

  app.get('/api/rewe/markets', requireDevice, (c) => {
    const zipCode = c.req.query('zip') ?? '';
    if (!/^\d{5}$/.test(zipCode)) return c.json({ error: 'Bitte eine Postleitzahl mit fünf Ziffern angeben.' }, 400);
    return askRewe(c, async () => ({ markets: await rewe.markets(zipCode) }));
  });

  app.get('/api/rewe/products', requireDevice, (c) => {
    const query = c.req.query('q')?.trim() ?? '';
    const market = c.req.query('market') ?? '';
    if (!query || query.length > 80 || !isMarketId(market)) {
      return c.json({ error: 'Bitte einen Suchbegriff und den Markt angeben.' }, 400);
    }
    return askRewe(c, async () => ({ products: await rewe.search(query, market) }));
  });

  app.post('/api/rewe/match', requireDevice, async (c) => {
    const request = readMatchRequest(await readBody(c));
    if (!request) return c.json({ error: 'Die Positionen für den Abgleich sind unvollständig.' }, 400);
    return askRewe(c, async () => ({ results: await matchItems(rewe, request) }));
  });

  return app;
}
