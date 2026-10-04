import type { ImportedRecipe } from '@zauberjournal/core';

/** Zugangsdaten dieses Geräts für den Server des Haushalts. */
export type Credentials = { serverUrl: string; deviceId: string; token: string };

export type DeviceInfo = {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
  current: boolean;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = { method?: string; body?: unknown; token?: string; signal?: AbortSignal };

async function request<T>(
  serverUrl: string,
  path: string,
  { method = 'GET', body, token, signal }: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Der Server ist nicht erreichbar. Stimmt die Adresse, und ist das Gerät online?', 0);
  }
  if (response.status === 204) return undefined as T;
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  if (!response.ok) {
    throw new ApiError(typeof data.error === 'string' ? data.error : `Der Server meldet Fehler ${response.status}.`, response.status);
  }
  return data as T;
}

type DeviceCredentials = { deviceId: string; token: string };

export async function setupHousehold(serverUrl: string, setupCode: string, deviceName: string): Promise<Credentials> {
  const result = await request<DeviceCredentials>(serverUrl, '/api/setup', {
    method: 'POST',
    body: { setupCode, deviceName },
  });
  return { serverUrl, ...result };
}

export async function joinHousehold(serverUrl: string, code: string, deviceName: string): Promise<Credentials> {
  const result = await request<DeviceCredentials>(serverUrl, '/api/pair', { method: 'POST', body: { code, deviceName } });
  return { serverUrl, ...result };
}

export function createInvite(credentials: Credentials): Promise<{ code: string; expiresAt: number }> {
  return request(credentials.serverUrl, '/api/invites', { method: 'POST', token: credentials.token });
}

export async function listDevices(credentials: Credentials): Promise<DeviceInfo[]> {
  const { devices } = await request<{ devices: DeviceInfo[] }>(credentials.serverUrl, '/api/devices', {
    token: credentials.token,
  });
  return devices;
}

export function removeDevice(credentials: Credentials, deviceId: string): Promise<void> {
  return request(credentials.serverUrl, `/api/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    token: credentials.token,
  });
}

/** Prüft, ob das Gerät noch angemeldet ist: `ok`, `revoked` (abgemeldet) oder `offline`. */
export async function checkSession(credentials: Credentials): Promise<'ok' | 'revoked' | 'offline'> {
  try {
    await request(credentials.serverUrl, '/api/session', { token: credentials.token });
    return 'ok';
  } catch (error) {
    return error instanceof ApiError && error.status === 401 ? 'revoked' : 'offline';
  }
}

export function syncUrl(credentials: Credentials): string {
  return `${credentials.serverUrl.replace(/^http/i, 'ws')}/api/sync`;
}

export type ImportInput = {
  /** JPEG-Bilder als Base64 ohne `data:`-Präfix. */
  images: string[];
  text: string;
  url: string;
  suggestVegetarian: boolean;
};

/** Lässt den Server aus Fotos, Link oder Text ein Rezept erkennen; das dauert meist einige Sekunden. */
export async function importRecipe(credentials: Credentials, input: ImportInput, signal?: AbortSignal): Promise<ImportedRecipe> {
  const { recipe } = await request<{ recipe: ImportedRecipe }>(credentials.serverUrl, '/api/import', {
    method: 'POST',
    token: credentials.token,
    body: { ...input, images: input.images.map((data) => ({ data, mimeType: 'image/jpeg' })) },
    signal,
  });
  return recipe;
}

export function photoUrl(credentials: Credentials, photoId: string): string {
  return `${credentials.serverUrl}/api/photos/${encodeURIComponent(photoId)}`;
}

export function authHeaders(credentials: Credentials): Record<string, string> {
  return { Authorization: `Bearer ${credentials.token}` };
}
