import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Credentials, DeviceAccess } from './api';
import { clearCredentials, loadCredentials, saveCredentials } from './credentials';
import { usePhotoUploads } from './photo-uploads';
import type { AppStore } from './store';
import { useSync, type SyncStatus } from './sync';

/** Über welche Adresse die App den Server gerade erreicht */
export type ConnectionRoute = 'home' | 'away';

type Connection = {
  /** Für Anfragen an den Server, mit der Adresse, die gerade gilt */
  credentials: Credentials | null;
  /** Was dieses Gerät gespeichert hat, mit den Adressen für unterwegs und zu Hause */
  access: DeviceAccess | null;
  route: ConnectionRoute | null;
  status: SyncStatus;
  /** Speichert die Zugangsdaten und startet den Sync. */
  connect: (access: DeviceAccess) => Promise<void>;
  /** Neue Adressen; `homeUrl` leer = keine. Danach wird neu verbunden. */
  updateAddresses: (addresses: { serverUrl: string; homeUrl: string }) => Promise<void>;
  /** Trennt dieses Gerät vom Haushalt; die lokalen Daten bleiben erhalten. */
  disconnect: () => Promise<void>;
  /** Lädt neue Rezeptfotos hoch, falls der Server erreichbar ist. */
  uploadPhotos: () => void;
};

const ConnectionContext = createContext<Connection | null>(null);

export function ConnectionProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  // undefined = wird noch geladen
  const [access, setAccess] = useState<DeviceAccess | null | undefined>(undefined);
  /** Die Adresse, die der Sync zuletzt gewählt hat */
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);

  useEffect(() => {
    loadCredentials()
      .then(setAccess)
      .catch(() => setAccess(null));
  }, []);

  const status = useSync(store, access ?? null, setChosenUrl);
  // Bis der Sync gewählt hat, gilt die Adresse für unterwegs; eine gewählte, die nicht mehr dazugehört, auch.
  const serverUrl = access ? (chosenUrl && chosenUrl === access.homeUrl ? chosenUrl : access.serverUrl) : null;
  const credentials = useMemo(
    () => (access && serverUrl ? { serverUrl, deviceId: access.deviceId, token: access.token } : null),
    [access, serverUrl],
  );
  const uploadPhotos = usePhotoUploads(store, credentials, status);

  const value = useMemo<Connection>(
    () => ({
      credentials,
      access: access ?? null,
      route: access ? (serverUrl === access.homeUrl ? 'home' : 'away') : null,
      status,
      connect: async (next) => {
        await saveCredentials(next);
        setAccess(next);
      },
      updateAddresses: async ({ serverUrl: away, homeUrl }) => {
        if (!access) return;
        const next: DeviceAccess = { ...access, serverUrl: away, homeUrl };
        if (!homeUrl) delete next.homeUrl;
        await saveCredentials(next);
        setAccess(next);
      },
      disconnect: async () => {
        await clearCredentials();
        setAccess(null);
      },
      uploadPhotos,
    }),
    [credentials, access, serverUrl, status, uploadPhotos],
  );

  if (access === undefined) return null;
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): Connection {
  const connection = useContext(ConnectionContext);
  if (!connection) throw new Error('useConnection braucht einen ConnectionProvider.');
  return connection;
}
