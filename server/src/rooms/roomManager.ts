import type { WebSocket } from 'ws';
import { Room } from './room.js';

export type JoinRoomResult = { ok: true; room: Room } | { ok: false; reason: string };

/** Room codes avoid visually ambiguous characters (0/O, 1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

interface ConnectionEntry {
  code: string;
  playerId: string;
}

/**
 * Owns every live room and the mapping from an open socket back to which
 * room/player it belongs to, so a disconnect can be resolved in O(1)
 * without scanning every room.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly connections = new Map<WebSocket, ConnectionEntry>();

  /** Creates a fresh room and seats `playerId` as its host. */
  createRoom(playerId: string, ws: WebSocket): Room {
    const code = this.generateCode();
    const room = new Room(code, playerId);
    room.addPlayer(playerId, ws);
    this.rooms.set(code, room);
    this.connections.set(ws, { code, playerId });
    return room;
  }

  /** Seats `playerId` into an existing room by code. */
  joinRoom(code: string, playerId: string, ws: WebSocket): JoinRoomResult {
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, reason: `No room found with code "${code}"` };
    }
    if (!room.addPlayer(playerId, ws)) {
      return { ok: false, reason: 'Room is full' };
    }
    this.connections.set(ws, { code, playerId });
    return { ok: true, room };
  }

  /**
   * Removes whichever room/player `ws` belonged to. Deletes the room once
   * its last player leaves. Returns `undefined` if `ws` was never seated
   * (e.g. it disconnected before sending `CreateRoom`/`JoinRoom`).
   */
  removeConnection(ws: WebSocket): { room: Room; playerId: string } | undefined {
    const entry = this.connections.get(ws);
    if (!entry) {
      return undefined;
    }
    this.connections.delete(ws);

    const room = this.rooms.get(entry.code);
    if (!room) {
      return undefined;
    }
    room.removePlayer(entry.playerId);
    if (room.isEmpty()) {
      this.rooms.delete(entry.code);
    }
    return { room, playerId: entry.playerId };
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  private generateCode(): string {
    let code: string;
    do {
      code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
