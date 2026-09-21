import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { RoomManager } from './roomManager.js';
import { MAX_PLAYERS } from './room.js';

/** A minimal stand-in for a live `ws` socket — no real network involved. */
function fakeSocket(): WebSocket {
  return { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket;
}

describe('RoomManager', () => {
  it('createRoom returns a room with a unique code and the host as sole player, under the max of 4', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host-1', fakeSocket());

    expect(room.code).toBeTruthy();
    expect(room.playerIds).toEqual(['host-1']);
    expect(room.hostId).toBe('host-1');
    expect(room.size).toBeLessThanOrEqual(MAX_PLAYERS);
  });

  it('generates unique codes across many rooms', () => {
    const manager = new RoomManager();
    const codes = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      codes.add(manager.createRoom(`host-${i}`, fakeSocket()).code);
    }
    expect(codes.size).toBe(50);
  });

  it('retries code generation on a collision instead of reusing an occupied code', () => {
    const manager = new RoomManager();
    // First 10 draws (room1's 5-char code, then room2's colliding first
    // attempt) return the same value; later draws differ. Without the
    // do-while retry, room2 would keep the exact same code as room1.
    let call = 0;
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => (call++ < 10 ? 0 : 0.5));

    const room1 = manager.createRoom('host-1', fakeSocket());
    const room2 = manager.createRoom('host-2', fakeSocket());

    expect(room2.code).not.toBe(room1.code);
    expect(call).toBeGreaterThan(10); // proves the retry branch actually fired
    randomSpy.mockRestore();
  });

  it('joinRoom seats a second player into an existing room', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host-1', fakeSocket());

    const result = manager.joinRoom(room.code, 'player-2', fakeSocket());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.room.playerIds.sort()).toEqual(['host-1', 'player-2']);
    }
  });

  it('joinRoom rejects an unknown room code and changes no state', () => {
    const manager = new RoomManager();
    manager.createRoom('host-1', fakeSocket());

    const result = manager.joinRoom('NOPE0', 'player-2', fakeSocket());

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('NOPE0') });
    expect(manager.getRoom('NOPE0')).toBeUndefined();
  });

  it('joinRoom rejects once a room is already at 4 players and changes no state', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host', fakeSocket());
    manager.joinRoom(room.code, 'p2', fakeSocket());
    manager.joinRoom(room.code, 'p3', fakeSocket());
    manager.joinRoom(room.code, 'p4', fakeSocket());
    expect(room.size).toBe(MAX_PLAYERS);

    const result = manager.joinRoom(room.code, 'p5', fakeSocket());

    expect(result).toEqual({ ok: false, reason: expect.stringContaining('full') });
    expect(room.size).toBe(MAX_PLAYERS);
    expect(room.playerIds).not.toContain('p5');
  });

  it('removeConnection removes the player and keeps the room while others remain', () => {
    const manager = new RoomManager();
    const room = manager.createRoom('host', fakeSocket());
    const ws2 = fakeSocket();
    manager.joinRoom(room.code, 'p2', ws2);

    const removed = manager.removeConnection(ws2);

    expect(removed?.playerId).toBe('p2');
    expect(manager.getRoom(room.code)).toBe(room);
    expect(room.playerIds).toEqual(['host']);
  });

  it('removeConnection reassigns hostId to a remaining player when the host leaves', () => {
    const manager = new RoomManager();
    const hostWs = fakeSocket();
    const room = manager.createRoom('host', hostWs);
    manager.joinRoom(room.code, 'p2', fakeSocket());

    manager.removeConnection(hostWs);

    expect(room.hostId).toBe('p2');
    expect(room.hostId).not.toBe('host');
    // The broadcast RoomState must stay internally coherent: hostId always
    // names a currently-seated player, never a departed one.
    expect(room.playerIds).toContain(room.hostId);
  });

  it('removeConnection deletes the room once its last player leaves', () => {
    const manager = new RoomManager();
    const hostWs = fakeSocket();
    const room = manager.createRoom('host', hostWs);

    manager.removeConnection(hostWs);

    expect(manager.getRoom(room.code)).toBeUndefined();
    expect(manager.roomCount).toBe(0);
  });

  it('removeConnection is a no-op for a socket that was never seated', () => {
    const manager = new RoomManager();
    const removed = manager.removeConnection(fakeSocket());
    expect(removed).toBeUndefined();
  });
});
