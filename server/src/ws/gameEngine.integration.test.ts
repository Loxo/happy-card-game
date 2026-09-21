import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ActionRejectedMessage,
  ClientToServerMessage,
  GameStateMessage,
  RoomStateMessage,
  ServerToClientMessage,
} from '@happy-card-game/shared';
import { createServer } from '../index.js';

/**
 * Wires the real `router.ts`/`Room` plumbing (task 5) end to end over real
 * sockets — `engine.test.ts` covers the `GameEngine`'s own rules in
 * isolation; this file only proves `StartGame`/`TakeTurnAction` actually
 * reach it and that broadcasts land on the right sockets.
 */

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws: WebSocket, message: ClientToServerMessage): void {
  ws.send(JSON.stringify(message));
}

function nextMessage(ws: WebSocket): Promise<ServerToClientMessage> {
  return new Promise((resolve, reject) => {
    ws.once('message', (data) => {
      try {
        resolve(JSON.parse(data.toString()) as ServerToClientMessage);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** Collects the next `count` messages this socket receives, in order. */
function nextMessages(ws: WebSocket, count: number): Promise<ServerToClientMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: ServerToClientMessage[] = [];
    const handler = (data: Buffer) => {
      try {
        messages.push(JSON.parse(data.toString()) as ServerToClientMessage);
      } catch (error) {
        ws.off('message', handler);
        reject(error);
        return;
      }
      if (messages.length === count) {
        ws.off('message', handler);
        resolve(messages);
      }
    };
    ws.on('message', handler);
  });
}

describe('game engine wiring (real sockets)', () => {
  let wss: WebSocketServer;
  let port: number;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    wss = createServer(0);
    await new Promise<void>((resolve, reject) => {
      wss.once('listening', () => resolve());
      wss.once('error', reject);
    });
    const address = wss.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterEach(async () => {
    for (const ws of clients) {
      ws.close();
    }
    clients.length = 0;
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  async function connectClient(): Promise<WebSocket> {
    const ws = await connect(port);
    clients.push(ws);
    return ws;
  }

  /** Gets both players seated in a fresh 2-player room. Returns their sockets and ids (host first). */
  async function seatTwoPlayers(): Promise<{
    clientA: WebSocket;
    clientB: WebSocket;
    hostId: string;
    joinerId: string;
  }> {
    const clientA = await connectClient();
    const clientB = await connectClient();

    const createdPromise = nextMessage(clientA);
    send(clientA, { type: 'CreateRoom' });
    const created = (await createdPromise) as RoomStateMessage;

    const aJoinedPromise = nextMessage(clientA);
    const bJoinedPromise = nextMessage(clientB);
    send(clientB, { type: 'JoinRoom', code: created.code });
    const [, bJoined] = (await Promise.all([aJoinedPromise, bJoinedPromise])) as [
      RoomStateMessage,
      RoomStateMessage,
    ];

    const joinerId = bJoined.players.find((id) => id !== created.hostId);
    if (!joinerId) throw new Error('test bug: could not identify the second player id');

    return { clientA, clientB, hostId: created.hostId, joinerId };
  }

  it('StartGame deals 5-card hands to both players, then auto-draws the active player to 6, as two distinct broadcasts', async () => {
    const { clientA, clientB, hostId } = await seatTwoPlayers();

    const aMessagesPromise = nextMessages(clientA, 2);
    const bMessagesPromise = nextMessages(clientB, 2);
    send(clientA, { type: 'StartGame' });
    const [aMessages, bMessages] = await Promise.all([aMessagesPromise, bMessagesPromise]);

    const [aDeal, aTurnStart] = aMessages as [GameStateMessage, GameStateMessage];
    const [bDeal, bTurnStart] = bMessages as [GameStateMessage, GameStateMessage];

    // First broadcast: the deal — 5-card hands, empty tables, no opponent hand leaked.
    expect(aDeal.type).toBe('GameState');
    expect(aDeal.hand).toHaveLength(5);
    expect(aDeal.table).toHaveLength(0);
    expect(bDeal.hand).toHaveLength(5);
    expect(aDeal.roundsRemaining).toBeGreaterThan(0);
    expect(aDeal.turnPlayerId).toBe(hostId);
    expect(bDeal.turnPlayerId).toBe(hostId);

    // Second broadcast: the first turn's auto-draw — only the active
    // player's (the host's) hand grew to 6.
    expect(aTurnStart.hand).toHaveLength(6); // A is the host/active player
    expect(bTurnStart.hand).toHaveLength(5); // B untouched, not their turn
    const bViewOfA = bTurnStart.opponents.find((o) => o.playerId === hostId);
    expect(bViewOfA?.handCount).toBe(6);
  });

  it('rejects TakeTurnAction from a non-active player without changing anything', async () => {
    const { clientA, clientB } = await seatTwoPlayers();

    const startedPromise = Promise.all([nextMessages(clientA, 2), nextMessages(clientB, 2)]);
    send(clientA, { type: 'StartGame' });
    await startedPromise;

    const rejectedPromise = nextMessage(clientB);
    send(clientB, { type: 'TakeTurnAction', cardId: 'whatever', action: 'discard' });
    const rejected = (await rejectedPromise) as ActionRejectedMessage;

    expect(rejected.type).toBe('ActionRejected');
    expect(rejected.reason.toLowerCase()).toContain('turn');
  });

  it('an accepted TakeTurnAction broadcasts an updated GameState and advances the turn', async () => {
    const { clientA, clientB, joinerId } = await seatTwoPlayers();

    const startedPromise = Promise.all([nextMessages(clientA, 2), nextMessages(clientB, 2)]);
    send(clientA, { type: 'StartGame' });
    const [aMessages] = await startedPromise;
    const aTurnStart = aMessages[1] as GameStateMessage;

    const cardToDiscard = aTurnStart.hand[0];
    expect(cardToDiscard).toBeDefined();

    const aAfterPromise = nextMessage(clientA);
    const bAfterPromise = nextMessage(clientB);
    send(clientA, {
      type: 'TakeTurnAction',
      cardId: cardToDiscard!.instanceId,
      action: 'discard',
    });
    const [aAfter, bAfter] = (await Promise.all([aAfterPromise, bAfterPromise])) as [
      GameStateMessage,
      GameStateMessage,
    ];

    expect(aAfter.type).toBe('GameState');
    expect(aAfter.turnPlayerId).toBe(joinerId); // turn moved to the other seat
    expect(bAfter.turnPlayerId).toBe(joinerId);
    expect(aAfter.hand.some((c) => c.instanceId === cardToDiscard!.instanceId)).toBe(false);
  });

  it('StartGame is rejected with fewer than 2 players', async () => {
    const client = await connectClient();
    const createdPromise = nextMessage(client);
    send(client, { type: 'CreateRoom' });
    await createdPromise;

    const rejectedPromise = nextMessage(client);
    send(client, { type: 'StartGame' });
    const rejected = (await rejectedPromise) as ActionRejectedMessage;

    expect(rejected.type).toBe('ActionRejected');
    expect(rejected.reason.toLowerCase()).toContain('2 players');
  });

  it('handCardId genuinely reaches the engine over the wire (a table-discard reaches ActionRejected with a specific reason, never the generic guard Error)', async () => {
    const { clientA } = await seatTwoPlayers();

    const aMessagesPromise = nextMessages(clientA, 2);
    send(clientA, { type: 'StartGame' });
    const aMessages = await aMessagesPromise;
    const aTurnStart = aMessages[1] as GameStateMessage;
    const someHandCard = aTurnStart.hand[0];
    expect(someHandCard).toBeDefined();

    // Nothing is on the table yet, so this cardId can't be a real table
    // card — the point is only to prove `handCardId` survived guard
    // validation and reached the engine's own check, which names a
    // specific reason instead of falling back to a generic parse Error.
    const rejectedPromise = nextMessage(clientA);
    send(clientA, {
      type: 'TakeTurnAction',
      cardId: 'not-on-the-table',
      action: 'discard',
      source: 'table',
      handCardId: someHandCard!.instanceId,
    });
    const rejected = (await rejectedPromise) as ActionRejectedMessage;

    expect(rejected.type).toBe('ActionRejected');
    expect(rejected.reason).not.toContain('Malformed');
  });
});
