import { Injectable, signal } from '@angular/core';
import {
  isServerToClientMessage,
  type CardSource,
  type ClientToServerMessage,
  type GameStateMessage,
  type RoomStateMessage,
  type TurnActionKind,
} from '@happy-card-game/shared';

/**
 * Where to reach the game server. No environment files exist yet in this
 * project — hardcoded to the local dev server, same as `PORT`'s default in
 * `server/src/index.ts`. Revisit once a real deployment target exists.
 */
const WS_URL = `ws://${location.hostname}:8080`;

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed';

/**
 * Thin wrapper around the room/game WebSocket: owns the one live socket,
 * exposes the latest server state as signals, and serializes outgoing
 * protocol messages. Kept root-scoped (one instance) since a client only
 * ever holds one room connection at a time.
 */
@Injectable({ providedIn: 'root' })
export class WsService {
  readonly status = signal<ConnectionStatus>('idle');
  readonly roomState = signal<RoomStateMessage | null>(null);
  readonly gameState = signal<GameStateMessage | null>(null);
  readonly actionRejectedReason = signal<string | null>(null);

  private socket: WebSocket | null = null;

  createRoom(): void {
    this.send({ type: 'CreateRoom' });
  }

  joinRoom(code: string): void {
    this.send({ type: 'JoinRoom', code });
  }

  startGame(): void {
    this.send({ type: 'StartGame' });
  }

  takeTurnAction(
    cardId: string,
    action: TurnActionKind,
    options: { source?: CardSource; handCardId?: string; targetPlayerId?: string } = {},
  ): void {
    this.send({ type: 'TakeTurnAction', cardId, action, ...options });
  }

  leaveRoom(): void {
    this.send({ type: 'LeaveRoom' });
    this.roomState.set(null);
    this.gameState.set(null);
  }

  /** Opens the socket if needed, then sends once it's ready. */
  private send(message: ClientToServerMessage): void {
    this.actionRejectedReason.set(null);
    this.ensureConnected(() => this.socket?.send(JSON.stringify(message)));
  }

  private ensureConnected(onOpen: () => void): void {
    if (this.socket && this.status() === 'open') {
      onOpen();
      return;
    }
    if (this.socket && this.status() === 'connecting') {
      this.socket.addEventListener('open', onOpen, { once: true });
      return;
    }

    this.status.set('connecting');
    const socket = new WebSocket(WS_URL);
    this.socket = socket;

    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('open', () => this.status.set('open'));
    socket.addEventListener('close', () => this.status.set('closed'));
    socket.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isServerToClientMessage(parsed)) {
      return;
    }

    switch (parsed.type) {
      case 'RoomState':
        this.roomState.set(parsed);
        return;
      case 'ActionRejected':
        this.actionRejectedReason.set(parsed.reason);
        return;
      case 'Error':
        this.actionRejectedReason.set(parsed.message);
        return;
      case 'GameState':
        this.gameState.set(parsed);
        return;
    }
  }
}
