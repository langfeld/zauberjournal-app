import { syncUrl, type Credentials } from './api';

/** Der WebSocket von React Native nimmt als drittes Argument Header an; die Typen kennen nur den Browser. */
type NativeWebSocketConstructor = new (
  url: string,
  protocols: string | string[] | null,
  options: { headers: Record<string, string> },
) => WebSocket;

/** Öffnet die Sync-Verbindung; das Token geht als Header mit. */
export function openSyncSocket(credentials: Credentials): WebSocket {
  const NativeWebSocket = WebSocket as unknown as NativeWebSocketConstructor;
  return new NativeWebSocket(syncUrl(credentials), null, {
    headers: { Authorization: `Bearer ${credentials.token}` },
  });
}
