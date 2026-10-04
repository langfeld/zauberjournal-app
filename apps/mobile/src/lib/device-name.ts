import * as Device from 'expo-device';

/** Vorschlag für den Gerätenamen, z. B. „Pixel 8“. */
export function suggestedDeviceName(): string {
  return Device.deviceName ?? Device.modelName ?? 'Mein Handy';
}
