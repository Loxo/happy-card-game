import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { RoomManager } from '../rooms/roomManager.js';
import { parseClientMessage, routeMessage, sendMessage, type ConnectionState } from './router.js';

/**
 * Wires one freshly-accepted socket into the room protocol: assigns it a
 * `playerId` (unassigned to any room until it sends `CreateRoom`/`JoinRoom`),
 * routes every guard-validated message, and cleans up on disconnect.
 */
export function handleConnection(roomManager: RoomManager, ws: WebSocket): void {
  const state: ConnectionState = { playerId: randomUUID(), roomCode: null };

  ws.on('message', (data) => {
    const message = parseClientMessage(data.toString());
    if (!message) {
      sendMessage(ws, { type: 'Error', message: 'Malformed or unrecognized message' });
      return;
    }
    routeMessage(roomManager, state, ws, message);
  });

  ws.on('close', () => {
    const removed = roomManager.removeConnection(ws);
    if (removed && !removed.room.isEmpty()) {
      removed.room.broadcast(removed.room.toRoomState());
    }
  });
}
