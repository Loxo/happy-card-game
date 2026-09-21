import { TestBed } from '@angular/core/testing';
import { WsService } from './ws.service';

/**
 * Minimal fake of the browser WebSocket the service opens — captures what
 * was sent and lets the test drive open/message/close from the "server"
 * side, with no real socket or server involved.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  emitOpen(): void {
    this.listeners.get('open')?.forEach((fn) => fn({}));
  }

  emitMessage(data: unknown): void {
    this.listeners.get('message')?.forEach((fn) => fn({ data: JSON.stringify(data) }));
  }

  emitRawMessage(raw: string): void {
    this.listeners.get('message')?.forEach((fn) => fn({ data: raw }));
  }

  emitClose(): void {
    this.listeners.get('close')?.forEach((fn) => fn({}));
  }
}

describe('WsService', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    FakeWebSocket.instances = [];
    // @ts-expect-error test double, not a full WebSocket implementation
    globalThis.WebSocket = FakeWebSocket;
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  function service(): WsService {
    return TestBed.inject(WsService);
  }

  function socket(): FakeWebSocket {
    return FakeWebSocket.instances[0];
  }

  it('opens exactly one socket and sends CreateRoom once connected', () => {
    const ws = service();
    ws.createRoom();

    expect(FakeWebSocket.instances.length).toBe(1);
    expect(ws.status()).toBe('connecting');
    expect(socket().sent).toEqual([]);

    socket().emitOpen();

    expect(ws.status()).toBe('open');
    expect(socket().sent).toEqual([JSON.stringify({ type: 'CreateRoom' })]);
  });

  it('reuses the open socket for a later send instead of reconnecting', () => {
    const ws = service();
    ws.createRoom();
    socket().emitOpen();

    ws.joinRoom('ABCDE');

    expect(FakeWebSocket.instances.length).toBe(1);
    expect(socket().sent).toEqual([
      JSON.stringify({ type: 'CreateRoom' }),
      JSON.stringify({ type: 'JoinRoom', code: 'ABCDE' }),
    ]);
  });

  it('parses a type-guarded RoomState broadcast into the roomState signal', () => {
    const ws = service();
    ws.createRoom();
    socket().emitOpen();

    socket().emitMessage({
      type: 'RoomState',
      code: 'ABCDE',
      players: ['p1'],
      hostId: 'p1',
      yourPlayerId: 'p1',
    });

    expect(ws.roomState()).toEqual({
      type: 'RoomState',
      code: 'ABCDE',
      players: ['p1'],
      hostId: 'p1',
      yourPlayerId: 'p1',
    });
  });

  it('drops a malformed or unrecognized server message instead of throwing', () => {
    const ws = service();
    ws.createRoom();
    socket().emitOpen();

    expect(() => socket().emitMessage({ type: 'NotARealMessage' })).not.toThrow();
    expect(() => socket().emitRawMessage('{not json')).not.toThrow();
    expect(ws.roomState()).toBeNull();
  });

  it('surfaces ActionRejected and Error reasons on the same signal', () => {
    const ws = service();
    ws.createRoom();
    socket().emitOpen();

    socket().emitMessage({ type: 'ActionRejected', reason: 'stale-turn' });
    expect(ws.actionRejectedReason()).toBe('stale-turn');

    socket().emitMessage({ type: 'Error', message: 'room-not-found' });
    expect(ws.actionRejectedReason()).toBe('room-not-found');
  });

  it('clears any pending rejection reason on the next outgoing send', () => {
    const ws = service();
    ws.createRoom();
    socket().emitOpen();
    socket().emitMessage({ type: 'ActionRejected', reason: 'stale-turn' });

    ws.joinRoom('ABCDE');

    expect(ws.actionRejectedReason()).toBeNull();
  });

  it('tracks GameState broadcasts for the room-start-to-game-screen handoff', () => {
    const ws = service();
    ws.createRoom();
    socket().emitOpen();

    expect(ws.gameState()).toBeNull();

    socket().emitMessage({
      type: 'GameState',
      hand: [],
      table: [],
      playedCards: [],
      turnPlayerId: 'p1',
      roundsRemaining: 5,
      deckCount: 40,
      resources: { happiness: 0, education: 0, money: 0 },
      opponents: [],
    });

    expect(ws.gameState()?.turnPlayerId).toBe('p1');
  });

  it('clears room and game state on leave', () => {
    const ws = service();
    ws.createRoom();
    socket().emitOpen();
    socket().emitMessage({
      type: 'RoomState',
      code: 'ABCDE',
      players: ['p1'],
      hostId: 'p1',
      yourPlayerId: 'p1',
    });

    ws.leaveRoom();

    expect(ws.roomState()).toBeNull();
    expect(ws.gameState()).toBeNull();
    expect(socket().sent.at(-1)).toBe(JSON.stringify({ type: 'LeaveRoom' }));
  });
});
