import * as SecureStore from 'expo-secure-store';

import type { DeviceAccess } from './api';

const KEY = 'zauberjournal.credentials';

/** Zugangsdaten liegen im verschlüsselten Speicher des Geräts. */
export async function loadCredentials(): Promise<DeviceAccess | null> {
  const stored = await SecureStore.getItemAsync(KEY);
  return stored ? (JSON.parse(stored) as DeviceAccess) : null;
}

export async function saveCredentials(access: DeviceAccess): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(access));
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
