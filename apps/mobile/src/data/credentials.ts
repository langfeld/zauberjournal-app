import * as SecureStore from 'expo-secure-store';

import type { Credentials } from './api';

const KEY = 'zauberjournal.credentials';

/** Zugangsdaten liegen im verschlüsselten Speicher des Geräts. */
export async function loadCredentials(): Promise<Credentials | null> {
  const stored = await SecureStore.getItemAsync(KEY);
  return stored ? (JSON.parse(stored) as Credentials) : null;
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(credentials));
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
