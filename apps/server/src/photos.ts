import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Fotos tragen eine zufällige ID wie alle Einträge im Store (20 Zeichen, Base62). */
const PHOTO_ID = /^[0-9A-Za-z]{20}$/;

export function isPhotoId(id: string): boolean {
  return PHOTO_ID.test(id);
}

export function isJpeg(data: Uint8Array): boolean {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

/**
 * Rezeptfotos als JPEG-Dateien im Datenverzeichnis. Ein Foto ändert sich nie:
 * Wird eine ID erneut hochgeladen (z. B. nach einem Verbindungsabbruch), bleibt die erste Datei.
 */
export function createPhotoStore(dir: string) {
  mkdirSync(dir, { recursive: true });
  const pathOf = (id: string) => join(dir, `${id}.jpg`);

  return {
    async save(id: string, data: Uint8Array): Promise<void> {
      const target = pathOf(id);
      if (existsSync(target)) return;
      // Erst vollständig schreiben, dann umbenennen: So gibt es nie halbe Dateien.
      const temporary = `${target}.${randomBytes(4).toString('hex')}.tmp`;
      await writeFile(temporary, data);
      await rename(temporary, target);
    },

    async read(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
      try {
        return await readFile(pathOf(id));
      } catch {
        return null;
      }
    },
  };
}

export type PhotoStore = ReturnType<typeof createPhotoStore>;
