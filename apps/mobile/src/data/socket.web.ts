import { syncUrl, type Credentials } from './api';

/** Browser können bei WebSockets keine Header setzen; zum Entwickeln geht das Token deshalb in die URL. */
export function openSyncSocket(credentials: Credentials): WebSocket {
  return new WebSocket(`${syncUrl(credentials)}?token=${encodeURIComponent(credentials.token)}`);
}
