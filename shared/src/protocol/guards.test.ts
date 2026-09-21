import { describe, expect, it } from 'vitest';
import type {
  ActionRejectedMessage,
  ClientToServerMessage,
  CreateRoomMessage,
  ErrorMessage,
  GameStateMessage,
  JoinRoomMessage,
  LeaveRoomMessage,
  RoomStateMessage,
  ServerToClientMessage,
  StartGameMessage,
  TakeTurnActionMessage,
} from './messages.js';
import {
  isActionRejected,
  isClientToServerMessage,
  isCreateRoom,
  isError,
  isGameState,
  isJoinRoom,
  isLeaveRoom,
  isRoomState,
  isServerToClientMessage,
  isStartGame,
  isTakeTurnAction,
} from './guards.js';

const validCreateRoom: CreateRoomMessage = { type: 'CreateRoom' };
const validJoinRoom: JoinRoomMessage = { type: 'JoinRoom', code: 'ABCD' };
const validStartGame: StartGameMessage = { type: 'StartGame' };
const validTakeTurnActionPlay: TakeTurnActionMessage = {
  type: 'TakeTurnAction',
  cardId: 'instance-1',
  action: 'play',
};
const validTakeTurnActionDiscardHand: TakeTurnActionMessage = {
  type: 'TakeTurnAction',
  cardId: 'instance-1',
  action: 'discard',
};
const validTakeTurnActionDiscardTable: TakeTurnActionMessage = {
  type: 'TakeTurnAction',
  cardId: 'instance-1',
  action: 'discard',
  source: 'table',
  handCardId: 'instance-2',
};
const validTakeTurnActionMalus: TakeTurnActionMessage = {
  type: 'TakeTurnAction',
  cardId: 'instance-1',
  action: 'malus',
  targetPlayerId: 'player-2',
};
const validLeaveRoom: LeaveRoomMessage = { type: 'LeaveRoom' };

const validRoomState: RoomStateMessage = {
  type: 'RoomState',
  code: 'ABCD',
  players: ['player-1', 'player-2'],
  hostId: 'player-1',
  yourPlayerId: 'player-1',
};
const validGameState: GameStateMessage = {
  type: 'GameState',
  hand: [{ instanceId: 'i1', definitionId: 'job-waiter' }],
  table: [],
  playedCards: [
    { playerId: 'player-1', card: { instanceId: 'i3', definitionId: 'job-waiter' } },
  ],
  turnPlayerId: 'player-1',
  roundsRemaining: 10,
  deckCount: 30,
  resources: { happiness: 0, education: 0, money: 0 },
  opponents: [
    {
      playerId: 'player-2',
      handCount: 5,
      table: [{ instanceId: 'i2', definitionId: 'job-waiter' }],
      resources: { happiness: 1, education: 0, money: 2 },
    },
  ],
};
const validGameStateFinished: GameStateMessage = {
  ...validGameState,
  result: {
    rankings: [
      { playerId: 'player-1', happiness: 12 },
      { playerId: 'player-2', happiness: 7 },
    ],
  },
};
const validActionRejected: ActionRejectedMessage = {
  type: 'ActionRejected',
  reason: 'cap',
};
const validError: ErrorMessage = { type: 'Error', message: 'bad input' };

describe('client -> server guards', () => {
  it('isCreateRoom accepts a valid CreateRoom message', () => {
    expect(isCreateRoom(validCreateRoom)).toBe(true);
  });

  it('isJoinRoom accepts a valid JoinRoom message', () => {
    expect(isJoinRoom(validJoinRoom)).toBe(true);
  });

  it('isStartGame accepts a valid StartGame message', () => {
    expect(isStartGame(validStartGame)).toBe(true);
  });

  it('isTakeTurnAction accepts play / discard (hand and table combo) / malus variants', () => {
    expect(isTakeTurnAction(validTakeTurnActionPlay)).toBe(true);
    expect(isTakeTurnAction(validTakeTurnActionDiscardHand)).toBe(true);
    expect(isTakeTurnAction(validTakeTurnActionDiscardTable)).toBe(true);
    expect(isTakeTurnAction(validTakeTurnActionMalus)).toBe(true);
  });

  it('isTakeTurnAction accepts a table-discard with no handCardId (the engine, not the wire guard, enforces it is required) but rejects a non-string one', () => {
    const { handCardId: _omit, ...withoutHandCardId } = validTakeTurnActionDiscardTable;
    expect(isTakeTurnAction(withoutHandCardId)).toBe(true);
    expect(isTakeTurnAction({ ...validTakeTurnActionDiscardTable, handCardId: 42 })).toBe(false);
  });

  it('isLeaveRoom accepts a valid LeaveRoom message', () => {
    expect(isLeaveRoom(validLeaveRoom)).toBe(true);
  });

  it('isClientToServerMessage accepts every client -> server message', () => {
    const messages: ClientToServerMessage[] = [
      validCreateRoom,
      validJoinRoom,
      validStartGame,
      validTakeTurnActionPlay,
      validLeaveRoom,
    ];
    for (const message of messages) {
      expect(isClientToServerMessage(message)).toBe(true);
    }
  });
});

describe('server -> client guards', () => {
  it('isRoomState accepts a valid RoomState message', () => {
    expect(isRoomState(validRoomState)).toBe(true);
  });

  it('isGameState accepts a valid GameState message, in progress or finished', () => {
    expect(isGameState(validGameState)).toBe(true);
    expect(isGameState(validGameStateFinished)).toBe(true);
  });

  it('isGameState rejects a malformed opponent entry or resources missing a known kind', () => {
    expect(isGameState({ ...validGameState, opponents: [{ playerId: 'p2' }] })).toBe(false);
    expect(isGameState({ ...validGameState, resources: {} })).toBe(false);
    expect(isGameState({ ...validGameState, hand: [{ instanceId: 'i1' }] })).toBe(false);
    expect(isGameState({ ...validGameState, playedCards: [{ playerId: 'p1' }] })).toBe(false);
    expect(
      isGameState({ ...validGameState, playedCards: [{ instanceId: 'i1', definitionId: 'x' }] }),
    ).toBe(false);
  });

  it('isActionRejected accepts a valid ActionRejected message', () => {
    expect(isActionRejected(validActionRejected)).toBe(true);
  });

  it('isError accepts a valid Error message', () => {
    expect(isError(validError)).toBe(true);
  });

  it('isServerToClientMessage accepts every server -> client message', () => {
    const messages: ServerToClientMessage[] = [
      validRoomState,
      validGameState,
      validActionRejected,
      validError,
    ];
    for (const message of messages) {
      expect(isServerToClientMessage(message)).toBe(true);
    }
  });
});

describe('malformed input never throws and is rejected', () => {
  const malformedInputs: unknown[] = [
    null,
    undefined,
    42,
    'a plain string',
    [],
    {},
    { type: 123 },
    { type: 'JoinRoom' }, // missing code
    { type: 'TakeTurnAction', cardId: 'x', action: 'fly' }, // invalid action
    { type: 'TakeTurnAction', cardId: 'x', action: 'discard', source: 'pocket' },
    { type: 'TakeTurnAction', cardId: 'x', action: 'discard', source: 'table', handCardId: 42 },
    { type: 'RoomState', code: 'ABCD', players: [1, 2], hostId: 'p1' },
    { type: 'GameState' },
    { type: 'ActionRejected' },
    { type: 'Error' },
  ];

  const allGuards = [
    isCreateRoom,
    isJoinRoom,
    isStartGame,
    isTakeTurnAction,
    isLeaveRoom,
    isRoomState,
    isGameState,
    isActionRejected,
    isError,
    isClientToServerMessage,
    isServerToClientMessage,
  ];

  it('every guard returns false (never throws) for every malformed input', () => {
    for (const guard of allGuards) {
      for (const input of malformedInputs) {
        expect(() => guard(input)).not.toThrow();
        expect(guard(input)).toBe(false);
      }
    }
  });
});
