import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ClientToServerMessage,
  GameStateMessage,
  ServerToClientMessage,
} from '@happy-card-game/shared';
import { createServer } from '../index.js';

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

/** Buffers every message from the moment of creation, so bursts sent by the synchronous bot scheduler are never missed. */
class Inbox {
  private readonly queue: ServerToClientMessage[] = [];
  private waiter: (() => void) | undefined;

  constructor(ws: WebSocket) {
    ws.on('message', (data) => {
      this.queue.push(JSON.parse(data.toString()) as ServerToClientMessage);
      this.waiter?.();
    });
  }

  /** Consumes messages in order until one matches `predicate`; returns it. */
  async next<T extends ServerToClientMessage>(predicate: (message: ServerToClientMessage) => message is T): Promise<T> {
    for (;;) {
      while (this.queue.length > 0) {
        const message = this.queue.shift()!;
        if (predicate(message)) return message;
      }
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}

const isGameState = (m: ServerToClientMessage): m is GameStateMessage => m.type === 'GameState';

describe('solo game over real sockets (synchronous bot scheduler)', () => {
  let wss: WebSocketServer;
  let port: number;
  const clients: WebSocket[] = [];

  beforeEach(async () => {
    wss = createServer(0, {
      scheduler: (fn) => {
        fn();
        return () => {};
      },
    });
    await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
    const address = wss.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterEach(async () => {
    for (const ws of clients) ws.close();
    clients.length = 0;
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  });

  it('seats bots, flags them, and plays to the end with bots answering each human move', async () => {
    const ws = await connect(port);
    clients.push(ws);
    const inbox = new Inbox(ws);

    send(ws, { type: 'StartSoloGame', botCount: 2 });
    // Deal (5 cards), then the human's auto-draw (6 cards); human is seat 1 so no bot has moved yet.
    let state = await inbox.next(isGameState);
    expect(state.hand).toHaveLength(5);
    expect(state.opponents).toHaveLength(2);
    expect(state.opponents.every((o) => o.isBot)).toBe(true);
    state = await inbox.next(isGameState);
    expect(state.hand).toHaveLength(6);

    let guard = 100;
    while (!state.result && guard-- > 0) {
      send(ws, { type: 'TakeTurnAction', cardId: state.hand[0].instanceId, action: 'discard' });
      // Bots answer synchronously: the next GameState that matters is the human's next turn or the end.
      state = await inbox.next(
        (m): m is GameStateMessage => isGameState(m) && (m.result !== undefined || m.turnPlayerId === state.turnPlayerId),
      );
    }
    expect(state.result).toBeDefined();
    expect(state.result!.rankings).toHaveLength(3);
  });

  it('rejects StartSoloGame while already in a room', async () => {
    const ws = await connect(port);
    clients.push(ws);
    const inbox = new Inbox(ws);
    send(ws, { type: 'CreateRoom' });
    await inbox.next((m): m is ServerToClientMessage => m.type === 'RoomState');
    send(ws, { type: 'StartSoloGame', botCount: 1 });
    expect(await inbox.next((m): m is ServerToClientMessage => m.type === 'ActionRejected')).toMatchObject({
      reason: 'Already in a room',
    });
  });
});
