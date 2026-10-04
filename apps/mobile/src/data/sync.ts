import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas';

import { checkSession, type Credentials } from './api';
import { openSyncSocket } from './socket';
import type { AppStore } from './store';

/**
 * - `off`: kein Haushalt verbunden
 * - `connecting`: Verbindung wird aufgebaut
 * - `online`: synchronisiert
 * - `offline`: Server nicht erreichbar; Änderungen bleiben lokal und gehen später raus
 * - `revoked`: dieses Gerät wurde aus dem Haushalt entfernt
 */
export type SyncStatus = 'off' | 'connecting' | 'online' | 'offline' | 'revoked';

const MAX_RETRY_DELAY_MS = 30_000;

/** Hält die Sync-Verbindung offen, solange die App im Vordergrund ist, und verbindet bei Abbrüchen neu. */
export function useSync(store: AppStore, credentials: Credentials | null): SyncStatus {
  // Der Status gehört zu bestimmten Zugangsdaten; bei neuen Zugangsdaten gilt wieder „verbinde“.
  const [state, setState] = useState<{ credentials: Credentials | null; status: SyncStatus }>({
    credentials: null,
    status: 'connecting',
  });
  const [active, setActive] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setActive(next !== 'background'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!credentials || !active) return;

    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let destroyCurrent: (() => void) | undefined;
    const report = (status: SyncStatus) => {
      if (!stopped) setState({ credentials, status });
    };

    const retryLater = async () => {
      const session = await checkSession(credentials);
      if (stopped) return;
      if (session === 'revoked') {
        report('revoked');
        return;
      }
      report('offline');
      retryTimer = setTimeout(connect, Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt++));
    };

    const connect = async () => {
      try {
        const socket = openSyncSocket(credentials);
        const synchronizer = await createWsSynchronizer(store, socket);
        if (stopped) {
          await synchronizer.destroy();
          return;
        }
        destroyCurrent = () => void synchronizer.destroy();
        socket.addEventListener('close', () => {
          if (stopped) return;
          destroyCurrent?.();
          destroyCurrent = undefined;
          void retryLater();
        });
        await synchronizer.startSync();
        attempt = 0;
        report('online');
      } catch {
        if (!stopped) void retryLater();
      }
    };

    void connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      destroyCurrent?.();
    };
  }, [store, credentials, active]);

  if (!credentials) return 'off';
  return state.credentials === credentials ? state.status : 'connecting';
}
