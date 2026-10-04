import { APP_NAME } from '@zauberjournal/core';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';

import type { Device, Household } from './household.ts';

type Env = { Variables: { device: Device } };

const MAX_NAME_LENGTH = 60;

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

/**
 * HTTP-API des Servers.
 * `onDeviceRevoked` wird aufgerufen, nachdem ein Gerät abgemeldet wurde (z. B. um offene Sync-Verbindungen zu trennen).
 */
export function createApp(household: Household, onDeviceRevoked: (deviceId: string) => void = () => {}) {
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

  return app;
}
