import type { WebSocket } from 'ws';
import {
  isClientToServerMessage,
  type ClientToServerMessage,
  type ServerToClientMessage,
} from '@happy-card-game/shared';
import type { RoomManager } from '../rooms/roomManager.js';

/** Per-socket state the router needs across messages: who they are, and which room (if any) they're seated in. */
export interface ConnectionState {
  readonly playerId: string;
  roomCode: string | null;
}

export function sendMessage(ws: WebSocket, message: ServerToClientMessage): void {
  ws.send(JSON.stringify(message));
}

/**
 * Parses and guard-validates a raw WS payload. Returns `undefined` for
 * anything malformed (bad JSON) or that fails every `ClientToServerMessage`
 * guard — callers reply with an `Error` message in that case, never by
 * hand-rolling their own shape checks.
 */
export function parseClientMessage(raw: string): ClientToServerMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return isClientToServerMessage(parsed) ? parsed : undefined;
}

/**
 * Routes one already-validated message to its room action. `StartGame` and
 * `TakeTurnAction` have no engine to act on yet (phase 4's scope) — they're
 * accepted as no-ops once the sender is seated in a room, and rejected
 * otherwise, without any fake game logic.
 */
export function routeMessage(
  roomManager: RoomManager,
  state: ConnectionState,
  ws: WebSocket,
  message: ClientToServerMessage,
): void {
  switch (message.type) {
    case 'CreateRoom': {
      if (state.roomCode) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Already in a room' });
        return;
      }
      const room = roomManager.createRoom(state.playerId, ws);
      state.roomCode = room.code;
      room.broadcast(room.toRoomState());
      return;
    }

    case 'JoinRoom': {
      if (state.roomCode) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Already in a room' });
        return;
      }
      const result = roomManager.joinRoom(message.code, state.playerId, ws);
      if (!result.ok) {
        sendMessage(ws, { type: 'ActionRejected', reason: result.reason });
        return;
      }
      state.roomCode = result.room.code;
      result.room.broadcast(result.room.toRoomState());
      return;
    }

    case 'LeaveRoom': {
      if (!state.roomCode) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Not in a room' });
        return;
      }
      const removed = roomManager.removeConnection(ws);
      state.roomCode = null;
      if (removed && !removed.room.isEmpty()) {
        removed.room.broadcast(removed.room.toRoomState());
      }
      return;
    }

    case 'StartGame':
    case 'TakeTurnAction': {
      // No GameEngine exists yet (phase 4). Accepted as a no-op while
      // seated in a room; rejected outright otherwise.
      if (!state.roomCode) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Not in a room' });
      }
      return;
    }

    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
}
