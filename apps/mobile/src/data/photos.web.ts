import { createId } from '@zauberjournal/core';
import type { ImageSource } from 'expo-image';

import { resizeImage, type PickedImage } from '@/lib/images';

import { authHeaders, photoUrl, type Credentials } from './api';

const PHOTO_MAX_SIDE = 1600;

/** Im Browser (nur zum Entwickeln) bleiben neue Fotos bis zum Upload im Speicher; Neuladen verwirft sie. */
const local = new Map<string, { uri: string; blob: Blob }>();
const pending = new Set<string>();

export async function savePhoto(image: PickedImage): Promise<string> {
  const resized = await resizeImage(image, PHOTO_MAX_SIDE);
  const blob = await (await fetch(resized.uri)).blob();
  const id = createId();
  local.set(id, { uri: URL.createObjectURL(blob), blob });
  pending.add(id);
  return id;
}

export function photoSource(id: string, credentials: Credentials | null): ImageSource | null {
  const entry = local.get(id);
  if (entry) return { uri: entry.uri };
  if (!credentials) return null;
  return { uri: photoUrl(credentials, id), headers: authHeaders(credentials), cacheKey: `photo-${id}` };
}

export async function uploadPendingPhotos(credentials: Credentials, wanted: (id: string) => boolean): Promise<void> {
  for (const id of [...pending]) {
    const entry = local.get(id);
    if (!entry || !wanted(id)) continue;
    const response = await fetch(photoUrl(credentials, id), {
      method: 'PUT',
      headers: { ...authHeaders(credentials), 'Content-Type': 'image/jpeg' },
      body: entry.blob,
    });
    if (!response.ok) return;
    pending.delete(id);
  }
}
