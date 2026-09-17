import type { CardInstance, ResourceKind } from '../cards/card.js';
import type {
  ActionRejectedMessage,
  CardSource,
  ClientToServerMessage,
  CreateRoomMessage,
  ErrorMessage,
  GameStateMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  OpponentSummary,
  PlayedCardEntry,
  RoomStateMessage,
  ServerToClientMessage,
  StartGameMessage,
  TakeTurnActionMessage,
  TurnActionKind,
} from './messages.js';

/**
 * Runtime type guards for the WS message protocol — never trust a parsed
 * JSON blob. Every guard returns `false` on a malformed input instead of
 * throwing.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasType(value: Record<string, unknown>, type: string): boolean {
  return value['type'] === type;
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export function isCreateRoom(value: unknown): value is CreateRoomMessage {
  return isRecord(value) && hasType(value, 'CreateRoom');
}

export function isJoinRoom(value: unknown): value is JoinRoomMessage {
  return (
    isRecord(value) && hasType(value, 'JoinRoom') && typeof value['code'] === 'string'
  );
}

export function isStartGame(value: unknown): value is StartGameMessage {
  return isRecord(value) && hasType(value, 'StartGame');
}

const TURN_ACTION_KINDS: readonly TurnActionKind[] = ['play', 'discard', 'malus'];
const CARD_SOURCES: readonly CardSource[] = ['hand', 'table'];

export function isTakeTurnAction(value: unknown): value is TakeTurnActionMessage {
  if (!isRecord(value) || !hasType(value, 'TakeTurnAction')) {
    return false;
  }
  if (typeof value['cardId'] !== 'string') {
    return false;
  }
  if (!TURN_ACTION_KINDS.includes(value['action'] as TurnActionKind)) {
    return false;
  }
  if (value['source'] !== undefined && !CARD_SOURCES.includes(value['source'] as CardSource)) {
    return false;
  }
  if (value['targetPlayerId'] !== undefined && typeof value['targetPlayerId'] !== 'string') {
    return false;
  }
  return true;
}

export function isLeaveRoom(value: unknown): value is LeaveRoomMessage {
  return isRecord(value) && hasType(value, 'LeaveRoom');
}

export function isClientToServerMessage(value: unknown): value is ClientToServerMessage {
  return (
    isCreateRoom(value) ||
    isJoinRoom(value) ||
    isStartGame(value) ||
    isTakeTurnAction(value) ||
    isLeaveRoom(value)
  );
}

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export function isRoomState(value: unknown): value is RoomStateMessage {
  return (
    isRecord(value) &&
    hasType(value, 'RoomState') &&
    typeof value['code'] === 'string' &&
    Array.isArray(value['players']) &&
    value['players'].every((player) => typeof player === 'string') &&
    typeof value['hostId'] === 'string'
  );
}

const RESOURCE_KINDS: readonly ResourceKind[] = ['happiness', 'education', 'money'];

function isCardInstance(value: unknown): value is CardInstance {
  return (
    isRecord(value) &&
    typeof value['instanceId'] === 'string' &&
    typeof value['definitionId'] === 'string'
  );
}

function isCardInstanceArray(value: unknown): value is CardInstance[] {
  return Array.isArray(value) && value.every(isCardInstance);
}

function isResourceRecord(value: unknown): value is Record<ResourceKind, number> {
  return (
    isRecord(value) &&
    RESOURCE_KINDS.every((kind) => typeof value[kind] === 'number')
  );
}

function isPlayedCardEntry(value: unknown): value is PlayedCardEntry {
  return (
    isRecord(value) &&
    typeof value['playerId'] === 'string' &&
    isCardInstance(value['card'])
  );
}

function isOpponentSummary(value: unknown): value is OpponentSummary {
  return (
    isRecord(value) &&
    typeof value['playerId'] === 'string' &&
    typeof value['handCount'] === 'number' &&
    isCardInstanceArray(value['table']) &&
    isResourceRecord(value['resources'])
  );
}

function isGameResult(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value['rankings'])) {
    return false;
  }
  return value['rankings'].every(
    (ranking) =>
      isRecord(ranking) &&
      typeof ranking['playerId'] === 'string' &&
      typeof ranking['happiness'] === 'number',
  );
}

export function isGameState(value: unknown): value is GameStateMessage {
  if (!isRecord(value) || !hasType(value, 'GameState')) {
    return false;
  }
  if (
    !isCardInstanceArray(value['hand']) ||
    !isCardInstanceArray(value['table']) ||
    !Array.isArray(value['playedCards']) ||
    !value['playedCards'].every(isPlayedCardEntry) ||
    typeof value['turnPlayerId'] !== 'string' ||
    typeof value['roundsRemaining'] !== 'number' ||
    typeof value['deckCount'] !== 'number' ||
    !isResourceRecord(value['resources']) ||
    !Array.isArray(value['opponents']) ||
    !value['opponents'].every(isOpponentSummary)
  ) {
    return false;
  }
  return value['result'] === undefined || isGameResult(value['result']);
}

export function isActionRejected(value: unknown): value is ActionRejectedMessage {
  return (
    isRecord(value) && hasType(value, 'ActionRejected') && typeof value['reason'] === 'string'
  );
}

export function isError(value: unknown): value is ErrorMessage {
  return isRecord(value) && hasType(value, 'Error') && typeof value['message'] === 'string';
}

export function isServerToClientMessage(value: unknown): value is ServerToClientMessage {
  return isRoomState(value) || isGameState(value) || isActionRejected(value) || isError(value);
}
