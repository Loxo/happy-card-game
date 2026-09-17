import { WebSocket } from 'ws';
import type { RoomStateMessage, ServerToClientMessage } from '@happy-card-game/shared';

/** Hard cap enforced by `Room.addPlayer` — the ruleset is 2-4 players. */
export const MAX_PLAYERS = 4;

/**
 * A single in-memory room: a generated code, its host, and the live sockets
 * of every seated player. No persistence — per the architecture decision,
 * a server restart drops every in-progress room.
 *
 * Phase 4 will add an optional `GameEngine` instance here once `StartGame`
 * is handled; this phase only manages the roster.
 */
export class Room {
  readonly code: string;
  /** The current host. Reassigned to a remaining player if the host leaves. */
  hostId: string;

  private readonly players = new Map<string, WebSocket>();

  constructor(code: string, hostId: string) {
    this.code = code;
    this.hostId = hostId;
  }

  /** Adds a player's socket. Returns `false` (no-op) once at `MAX_PLAYERS`. */
  addPlayer(playerId: string, ws: WebSocket): boolean {
    if (this.players.size >= MAX_PLAYERS) {
      return false;
    }
    this.players.set(playerId, ws);
    return true;
  }

  /**
   * Removes a player. If they were the host and the room isn't now empty,
   * promotes the next remaining player (map insertion order) to host, so
   * `hostId` never dangles as a player-less id on the broadcast `RoomState`.
   */
  removePlayer(playerId: string): void {
    this.players.delete(playerId);
    if (playerId === this.hostId && !this.isEmpty()) {
      this.hostId = this.playerIds[0];
    }
  }

  get playerIds(): string[] {
    return [...this.players.keys()];
  }

  get size(): number {
    return this.players.size;
  }

  isEmpty(): boolean {
    return this.players.size === 0;
  }

  toRoomState(): RoomStateMessage {
    return {
      type: 'RoomState',
      code: this.code,
      players: this.playerIds,
      hostId: this.hostId,
    };
  }

  /** Sends `message` to every currently-open socket in the room. */
  broadcast(message: ServerToClientMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.players.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}
