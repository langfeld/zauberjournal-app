import type { IncomingMessage } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import type { Duplex } from 'node:stream';

import { createMergeableStore } from 'tinybase';
import { createSqliteNodePersister } from 'tinybase/persisters/persister-sqlite-node';
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server';
import { WebSocketServer, type WebSocket } from 'ws';

import { bearerToken } from './app.ts';
import type { Device } from './household.ts';

export const SYNC_PATH = '/api/sync';

/** Der Server hat genau einen Haushalt; alle Geräte landen im selben TinyBase-Raum. */
const ROOM = 'household';

/**
 * Sync per WebSocket (TinyBase). Der Server ist selbst Teilnehmer und speichert den Stand in SQLite,
 * damit Geräte auch dann synchronisieren können, wenn nie zwei gleichzeitig online sind.
 */
export function createSyncServer(db: DatabaseSync, authenticate: (token: string) => Device | null) {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const socketsByDevice = new Map<string, Set<WebSocket>>();

  const wsServer = createWsServer(webSocketServer, (pathId) =>
    pathId === ROOM ? createSqliteNodePersister(createMergeableStore(), db, 'tinybase_household') : undefined,
  );

  const track = (deviceId: string, socket: WebSocket) => {
    const sockets = socketsByDevice.get(deviceId) ?? new Set();
    sockets.add(socket);
    socketsByDevice.set(deviceId, sockets);
    socket.on('close', () => sockets.delete(socket));
  };

  return {
    /** Für das `upgrade`-Ereignis des HTTP-Servers: prüft das Token, bevor die Verbindung angenommen wird. */
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname !== SYNC_PATH) {
        socket.destroy();
        return;
      }
      // Im Browser lassen sich keine Header setzen, dort kommt das Token als Parameter (nur zum Entwickeln).
      const token = bearerToken(request.headers.authorization) ?? url.searchParams.get('token');
      const device = token ? authenticate(token) : null;
      if (!device) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      request.url = `/${ROOM}`;
      webSocketServer.handleUpgrade(request, socket, head, (client) => {
        track(device.id, client);
        webSocketServer.emit('connection', client, request);
      });
    },

    /** Trennt alle offenen Verbindungen eines abgemeldeten Geräts. */
    disconnectDevice(deviceId: string) {
      for (const socket of socketsByDevice.get(deviceId) ?? []) socket.close(4001, 'Gerät abgemeldet');
    },

    async destroy() {
      await wsServer.destroy();
      webSocketServer.close();
    },
  };
}
