import { createId } from '@zauberjournal/core';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import type { ImageSource } from 'expo-image';

import { resizeImage, type PickedImage } from '@/lib/images';

import { authHeaders, photoUrl, type Credentials } from './api';

/** Rezeptfotos werden auf diese Kantenlänge (längere Seite, in Pixeln) verkleinert. */
const PHOTO_MAX_SIDE = 1600;
/** Markierung neben einem Foto, das noch hochgeladen werden muss. */
const PENDING = '.pending';

const directory = new Directory(Paths.document, 'photos');
const photoFile = (id: string) => new File(directory, `${id}.jpg`);
const pendingMarker = (id: string) => new File(directory, `${id}${PENDING}`);

/**
 * Legt ein Bild als Rezeptfoto auf dem Gerät ab und liefert seine ID.
 * Hochgeladen wird es später mit `uploadPendingPhotos`, auch wenn das Gerät gerade offline ist.
 */
export async function savePhoto(image: PickedImage): Promise<string> {
  const resized = await resizeImage(image, PHOTO_MAX_SIDE);
  const id = createId();
  directory.create({ intermediates: true, idempotent: true });
  await new File(resized.uri).move(photoFile(id));
  pendingMarker(id).create();
  return id;
}

/** Quelle für `expo-image`: die Datei auf dem Gerät, sonst der Server (wird dort dauerhaft zwischengespeichert). */
export function photoSource(id: string, credentials: Credentials | null): ImageSource | null {
  const file = photoFile(id);
  if (file.exists) return { uri: file.uri };
  if (!credentials) return null;
  return { uri: photoUrl(credentials, id), headers: authHeaders(credentials), cacheKey: `photo-${id}` };
}

/**
 * Lädt Fotos hoch, die noch nicht auf dem Server liegen. `wanted` lässt Fotos aus,
 * die zu keinem gespeicherten Rezept gehören (z. B. aus einem verworfenen Entwurf).
 */
export async function uploadPendingPhotos(credentials: Credentials, wanted: (id: string) => boolean): Promise<void> {
  if (!directory.exists) return;
  for (const entry of directory.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith(PENDING)) continue;
    const id = entry.name.slice(0, -PENDING.length);
    if (!wanted(id)) continue;
    const file = photoFile(id);
    if (!file.exists) {
      entry.delete();
      continue;
    }
    const result = await file.upload(photoUrl(credentials, id), {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { ...authHeaders(credentials), 'Content-Type': 'image/jpeg' },
    });
    if (result.status < 200 || result.status >= 300) return;
    entry.delete();
  }
}
