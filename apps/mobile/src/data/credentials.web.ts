import type { DeviceAccess } from './api';

const KEY = 'zauberjournal.credentials';

/** Im Browser (nur zum Entwickeln) liegen die Zugangsdaten im localStorage. */
export async function loadCredentials(): Promise<DeviceAccess | null> {
  const stored = localStorage.getItem(KEY);
  return stored ? (JSON.parse(stored) as DeviceAccess) : null;
}

export async function saveCredentials(access: DeviceAccess): Promise<void> {
  localStorage.setItem(KEY, JSON.stringify(access));
}

export async function clearCredentials(): Promise<void> {
  localStorage.removeItem(KEY);
}
