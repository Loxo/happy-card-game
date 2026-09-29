import type { WebSocket } from 'ws';
import {
  isClientToServerMessage,
  type ClientToServerMessage,
  type ServerToClientMessage,
} from '@happy-card-game/shared';
import type { RoomManager } from '../rooms/roomManager.js';
import type { Room } from '../rooms/room.js';
import { GameEngine, type RejectionReason } from '../game/engine.js';
import { runBotTurns } from '../game/botRunner.js';

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

/** Human-readable text for each `RejectionReason` the engine can report, always naming the specific rule broken. */
const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  cap: 'Category cap reached for this card',
  exclusion: 'Blocked by an excluding category already on the table',
  prerequisite: 'Missing a required category on the table',
  'wrong-turn': "It isn't your turn",
  'unknown-card': 'Unknown card',
  'missing-target': 'Malus action requires a valid targetPlayerId',
  'not-a-malus-card': "That card doesn't have a malus effect",
  'missing-hand-card': 'A table-discard requires a valid handCardId from your hand',
  'game-over': 'The game has already ended',
};

/** Sends every seated player their own tailored `GameState` (own full hand, opponents stripped to public summaries). No-op if the room has no engine yet. */
function broadcastGameState(room: Room): void {
  const engine = room.engine;
  if (!engine) {
    return;
  }
  for (const playerId of room.playerIds) {
    room.sendTo(playerId, engine.toGameStateMessage(playerId));
  }
}

/**
 * Deals the game for every seat in `room` and broadcasts it, then hands the
 * turn to a bot if one is up. Two distinct broadcasts, matching the user
 * journey: the deal (5-card hands) is its own visible step, and the first
 * turn's auto-draw (hand grows to 6) is another.
 */
function beginGame(roomManager: RoomManager, room: Room): void {
  const engine = new GameEngine({ botIds: new Set(room.bots.keys()) });
  engine.startGame(room.seatIds);
  room.engine = engine;
  broadcastGameState(room);
  engine.startTurn();
  broadcastGameState(room);
  runBotTurns(room, broadcastGameState, roomManager.botTurns);
}

/**
 * Routes one already-validated message to its room action. `StartGame`
 * creates the room's `GameEngine`; `TakeTurnAction` runs it — both reject
 * with the specific rule broken when the engine reports one.
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
      room.broadcastRoomState();
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
      result.room.broadcastRoomState();
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
        removed.room.broadcastRoomState();
      }
      return;
    }

    case 'StartGame': {
      if (!state.roomCode) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Not in a room' });
        return;
      }
      const room = roomManager.getRoom(state.roomCode);
      if (!room) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Not in a room' });
        return;
      }
      if (room.engine) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Game already started' });
        return;
      }
      if (room.seatIds.length < 2) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Need at least 2 players to start' });
        return;
      }

      beginGame(roomManager, room);
      return;
    }

    case 'StartSoloGame': {
      if (state.roomCode) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Already in a room' });
        return;
      }
      const room = roomManager.createSoloRoom(state.playerId, ws, message.botCount);
      state.roomCode = room.code;
      room.broadcastRoomState();
      beginGame(roomManager, room);
      return;
    }

    case 'TakeTurnAction': {
      if (!state.roomCode) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Not in a room' });
        return;
      }
      const room = roomManager.getRoom(state.roomCode);
      if (!room || !room.engine) {
        sendMessage(ws, { type: 'ActionRejected', reason: 'Game has not started' });
        return;
      }

      const result = room.engine.takeTurnAction(state.playerId, message.cardId, message.action, {
        source: message.source,
        handCardId: message.handCardId,
        targetPlayerId: message.targetPlayerId,
      });
      if (!result.ok) {
        sendMessage(ws, { type: 'ActionRejected', reason: REJECTION_MESSAGES[result.reason] });
        return;
      }
      broadcastGameState(room);
      runBotTurns(room, broadcastGameState, roomManager.botTurns);
      return;
    }

    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
}
