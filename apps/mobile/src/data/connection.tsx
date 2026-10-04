import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Credentials } from './api';
import { clearCredentials, loadCredentials, saveCredentials } from './credentials';
import type { AppStore } from './store';
import { useSync, type SyncStatus } from './sync';

type Connection = {
  credentials: Credentials | null;
  status: SyncStatus;
  /** Speichert die Zugangsdaten und startet den Sync. */
  connect: (credentials: Credentials) => Promise<void>;
  /** Trennt dieses Gerät vom Haushalt; die lokalen Daten bleiben erhalten. */
  disconnect: () => Promise<void>;
};

const ConnectionContext = createContext<Connection | null>(null);

export function ConnectionProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  // undefined = wird noch geladen
  const [credentials, setCredentials] = useState<Credentials | null | undefined>(undefined);

  useEffect(() => {
    loadCredentials()
      .then(setCredentials)
      .catch(() => setCredentials(null));
  }, []);

  const status = useSync(store, credentials ?? null);

  const value = useMemo<Connection>(
    () => ({
      credentials: credentials ?? null,
      status,
      connect: async (next) => {
        await saveCredentials(next);
        setCredentials(next);
      },
      disconnect: async () => {
        await clearCredentials();
        setCredentials(null);
      },
    }),
    [credentials, status],
  );

  if (credentials === undefined) return null;
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): Connection {
  const connection = useContext(ConnectionContext);
  if (!connection) throw new Error('useConnection braucht einen ConnectionProvider.');
  return connection;
}
