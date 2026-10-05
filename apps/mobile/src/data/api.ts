import type {
  ImportedRecipe,
  ReweMarket,
  ReweMatchRequestItem,
  ReweMatchResult,
  ReweOrder,
  ReweOrderRequest,
  ReweProduct,
} from '@zauberjournal/core';

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

/** REWE-Märkte mit Abholservice zu einer Postleitzahl. */
export async function findReweMarkets(credentials: Credentials, zipCode: string): Promise<ReweMarket[]> {
  const { markets } = await request<{ markets: ReweMarket[] }>(
    credentials.serverUrl,
    `/api/rewe/markets?zip=${encodeURIComponent(zipCode)}`,
    { token: credentials.token },
  );
  return markets;
}

/** Produktsuche im gewählten Markt. */
export async function searchReweProducts(
  credentials: Credentials,
  query: string,
  marketId: string,
  signal?: AbortSignal,
): Promise<ReweProduct[]> {
  const params = new URLSearchParams({ q: query, market: marketId });
  const { products } = await request<{ products: ReweProduct[] }>(credentials.serverUrl, `/api/rewe/products?${params}`, {
    token: credentials.token,
    signal,
  });
  return products;
}

/** Sucht passende Produkte für einige Positionen; der Server fragt REWE nacheinander, das dauert pro Position etwa eine Sekunde. */
export async function matchReweItems(
  credentials: Credentials,
  marketId: string,
  organic: boolean,
  items: ReweMatchRequestItem[],
): Promise<ReweMatchResult[]> {
  const { results } = await request<{ results: ReweMatchResult[] }>(credentials.serverUrl, '/api/rewe/match', {
    method: 'POST',
    token: credentials.token,
    body: { market: marketId, organic, items },
  });
  return results;
}

/** Auftrag fürs Userscript mit dessen Rückmeldungen; `null`, wenn es keinen gibt. */
export async function getReweOrder(credentials: Credentials): Promise<ReweOrder | null> {
  const { order } = await request<{ order: ReweOrder | null }>(credentials.serverUrl, '/api/rewe/order', { token: credentials.token });
  return order;
}

/** Legt einen neuen Auftrag fürs Userscript ab; er ersetzt den vorigen. */
export async function sendReweOrder(credentials: Credentials, order: ReweOrderRequest): Promise<ReweOrder> {
  const result = await request<{ order: ReweOrder }>(credentials.serverUrl, '/api/rewe/order', {
    method: 'PUT',
    token: credentials.token,
    body: order,
  });
  return result.order;
}

/** Adresse, unter der der Server das Userscript ausliefert. */
export function userscriptUrl(credentials: Credentials): string {
  return `${credentials.serverUrl}/rewe.user.js`;
}

export function photoUrl(credentials: Credentials, photoId: string): string {
  return `${credentials.serverUrl}/api/photos/${encodeURIComponent(photoId)}`;
}

export function authHeaders(credentials: Credentials): Record<string, string> {
  return { Authorization: `Bearer ${credentials.token}` };
}
