import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ActionRejectedMessage,
  ClientToServerMessage,
  RoomStateMessage,
  ServerToClientMessage,
} from '@happy-card-game/shared';
import { createServer } from '../index.js';

/** Connects a client and resolves once its socket is open. */
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

/** Resolves with the next parsed server message this socket receives. */
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

describe('room lifecycle (real sockets)', () => {
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

  it('CreateRoom then JoinRoom from a second client ends with both sockets holding a 2-player RoomState', async () => {
    const clientA = await connectClient();
    const clientB = await connectClient();

    const createdPromise = nextMessage(clientA);
    send(clientA, { type: 'CreateRoom' });
    const created = (await createdPromise) as RoomStateMessage;

    expect(created.type).toBe('RoomState');
    expect(created.players).toHaveLength(1);
    expect(created.hostId).toBe(created.players[0]);

    const aRosterPromise = nextMessage(clientA);
    const bRosterPromise = nextMessage(clientB);
    send(clientB, { type: 'JoinRoom', code: created.code });

    const [aRoster, bRoster] = (await Promise.all([aRosterPromise, bRosterPromise])) as [
      RoomStateMessage,
      RoomStateMessage,
    ];

    expect(aRoster.type).toBe('RoomState');
    expect(bRoster.type).toBe('RoomState');
    expect(aRoster.players).toHaveLength(2);
    expect(bRoster.players).toHaveLength(2);
    expect(new Set(aRoster.players)).toEqual(new Set(bRoster.players));
    expect(aRoster.hostId).toBe(created.hostId);
  });

  it('closing one client socket results in the other client receiving a RoomState with 1 player', async () => {
    const clientA = await connectClient();
    const clientB = await connectClient();

    const createdPromise = nextMessage(clientA);
    send(clientA, { type: 'CreateRoom' });
    const created = (await createdPromise) as RoomStateMessage;

    const aJoinedPromise = nextMessage(clientA);
    send(clientB, { type: 'JoinRoom', code: created.code });
    await aJoinedPromise;

    const aAfterDisconnectPromise = nextMessage(clientA);
    clientB.close();
    const aAfterDisconnect = (await aAfterDisconnectPromise) as RoomStateMessage;

    expect(aAfterDisconnect.type).toBe('RoomState');
    expect(aAfterDisconnect.players).toHaveLength(1);
    expect(aAfterDisconnect.players[0]).toBe(created.hostId);
  });

  it('reassigns hostId to a survivor when the host disconnects, never leaving it dangling', async () => {
    const host = await connectClient();
    const other = await connectClient();

    const createdPromise = nextMessage(host);
    send(host, { type: 'CreateRoom' });
    const created = (await createdPromise) as RoomStateMessage;

    // Both sockets get a broadcast for this join (the host's confirmation
    // and the joiner's own copy) — drain both before listening again, or
    // the next `nextMessage(other)` could race and catch this stale one.
    const hostJoinedPromise = nextMessage(host);
    const otherJoinedPromise = nextMessage(other);
    send(other, { type: 'JoinRoom', code: created.code });
    await Promise.all([hostJoinedPromise, otherJoinedPromise]);

    const otherAfterDisconnectPromise = nextMessage(other);
    host.close();
    const otherAfterDisconnect = (await otherAfterDisconnectPromise) as RoomStateMessage;

    expect(otherAfterDisconnect.players).toHaveLength(1);
    // hostId must name a player still in the room, never the departed host.
    expect(otherAfterDisconnect.hostId).not.toBe(created.hostId);
    expect(otherAfterDisconnect.players).toContain(otherAfterDisconnect.hostId);
  });

  it('JoinRoom with an unknown code returns ActionRejected', async () => {
    // "No state change" for this and the full-room case below is verified
    // at the RoomManager unit level (roomManager.test.ts), where the map
    // internals are directly inspectable; this test only proves what's on
    // the wire.
    const client = await connectClient();

    const rejectedPromise = nextMessage(client);
    send(client, { type: 'JoinRoom', code: 'NOPE0' });
    const rejected = (await rejectedPromise) as ActionRejectedMessage;

    expect(rejected.type).toBe('ActionRejected');
  });

  it('a malformed message is rejected with an Error, never a hand-rolled shape check', async () => {
    const client = await connectClient();

    const errorPromise = nextMessage(client);
    client.send('not even json');
    const response = await errorPromise;

    expect(response.type).toBe('Error');
  });

  it('LeaveRoom removes the sender and broadcasts the updated roster to the survivor', async () => {
    const clientA = await connectClient();
    const clientB = await connectClient();

    const createdPromise = nextMessage(clientA);
    send(clientA, { type: 'CreateRoom' });
    const created = (await createdPromise) as RoomStateMessage;

    const aJoinedPromise = nextMessage(clientA);
    send(clientB, { type: 'JoinRoom', code: created.code });
    await aJoinedPromise;

    const aAfterLeavePromise = nextMessage(clientA);
    send(clientB, { type: 'LeaveRoom' });
    const aAfterLeave = (await aAfterLeavePromise) as RoomStateMessage;

    expect(aAfterLeave.type).toBe('RoomState');
    expect(aAfterLeave.players).toEqual([created.hostId]);
  });

  it('JoinRoom into a room already at 4 players returns ActionRejected', async () => {
    const host = await connectClient();
    const createdPromise = nextMessage(host);
    send(host, { type: 'CreateRoom' });
    const created = (await createdPromise) as RoomStateMessage;

    // Fill the room to 4 total players (host + 3 more).
    for (let i = 0; i < 3; i += 1) {
      const other = await connectClient();
      const roster = nextMessage(host);
      send(other, { type: 'JoinRoom', code: created.code });
      await roster;
    }

    const fifth = await connectClient();
    const rejectedPromise = nextMessage(fifth);
    send(fifth, { type: 'JoinRoom', code: created.code });
    const rejected = (await rejectedPromise) as ActionRejectedMessage;

    expect(rejected.type).toBe('ActionRejected');
  });
});
