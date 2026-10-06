import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas';

import { checkServer, checkSession, type Credentials, type DeviceAccess } from './api';
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
/** So lange darf die Adresse für zu Hause brauchen; im WLAN antwortet der Server viel schneller. */
const HOME_TIMEOUT_MS = 2000;

/** Die Adresse für zu Hause, wenn dort der eigene Server antwortet und dieses Gerät kennt; sonst die für unterwegs. */
async function chooseServerUrl(access: DeviceAccess): Promise<string> {
  if (!access.homeUrl) return access.serverUrl;
  const home = await checkServer({ ...access, serverUrl: access.homeUrl }, HOME_TIMEOUT_MS);
  return home === 'ok' ? access.homeUrl : access.serverUrl;
}

/**
 * Hält die Sync-Verbindung offen, solange die App im Vordergrund ist, und verbindet bei Abbrüchen neu. Bei jedem
 * Aufbau, also auch nach dem Öffnen der App, wählt sie die Adresse neu und meldet sie an `onServerUrl`.
 */
export function useSync(store: AppStore, access: DeviceAccess | null, onServerUrl: (serverUrl: string) => void): SyncStatus {
  // Der Status gehört zu bestimmten Zugangsdaten; bei neuen Zugangsdaten gilt wieder „verbinde“.
  const [state, setState] = useState<{ access: DeviceAccess | null; status: SyncStatus }>({
    access: null,
    status: 'connecting',
  });
  const [active, setActive] = useState(AppState.currentState !== 'background');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => setActive(next !== 'background'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!access || !active) return;

    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let destroyCurrent: (() => void) | undefined;
    /** Mit der zuletzt gewählten Adresse */
    let credentials: Credentials = access;
    const report = (status: SyncStatus) => {
      if (!stopped) setState({ access, status });
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
        credentials = { ...access, serverUrl: await chooseServerUrl(access) };
        if (stopped) return;
        onServerUrl(credentials.serverUrl);
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
  }, [store, access, active, onServerUrl]);

  if (!access) return 'off';
  return state.access === access ? state.status : 'connecting';
}
