import { useCallback, useEffect } from 'react';

import type { Credentials } from './api';
import { uploadPendingPhotos } from './photos';
import type { AppStore } from './store';
import type { SyncStatus } from './sync';

/** Fotos, auf die ein nicht gelöschtes Rezept verweist. */
function referencedPhotos(store: AppStore): Set<string> {
  const ids = new Set<string>();
  for (const recipe of Object.values(store.getTable('recipes'))) {
    if (recipe.photo && (recipe.deletedAt === null || recipe.deletedAt === undefined)) ids.add(recipe.photo);
  }
  return ids;
}

let running = false;
let requestedAgain = false;

/** Höchstens ein Durchlauf gleichzeitig; wer währenddessen fragt, bekommt direkt danach einen weiteren. */
async function runUploads(credentials: Credentials, store: AppStore): Promise<void> {
  if (running) {
    requestedAgain = true;
    return;
  }
  running = true;
  try {
    do {
      requestedAgain = false;
      const wanted = referencedPhotos(store);
      await uploadPendingPhotos(credentials, (id) => wanted.has(id));
    } while (requestedAgain);
  } catch {
    // Server nicht erreichbar: Der nächste Durchlauf nach dem Verbinden versucht es erneut.
  } finally {
    running = false;
  }
}

/**
 * Lädt neue Rezeptfotos hoch, sobald der Sync online ist.
 * Die zurückgegebene Funktion stößt zusätzlich einen Durchlauf an, z. B. nach dem Speichern.
 */
export function usePhotoUploads(store: AppStore, credentials: Credentials | null, status: SyncStatus): () => void {
  const upload = useCallback(() => {
    if (credentials) void runUploads(credentials, store);
  }, [credentials, store]);

  useEffect(() => {
    if (status === 'online') upload();
  }, [status, upload]);

  return upload;
}
