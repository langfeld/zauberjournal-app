import type { Credentials } from './api';

const KEY = 'zauberjournal.credentials';

/** Im Browser (nur zum Entwickeln) liegen die Zugangsdaten im localStorage. */
export async function loadCredentials(): Promise<Credentials | null> {
  const stored = localStorage.getItem(KEY);
  return stored ? (JSON.parse(stored) as Credentials) : null;
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  localStorage.setItem(KEY, JSON.stringify(credentials));
}

export async function clearCredentials(): Promise<void> {
  localStorage.removeItem(KEY);
}
