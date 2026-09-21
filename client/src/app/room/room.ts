import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { WsService } from '../ws.service';

@Component({
  selector: 'app-room',
  imports: [],
  templateUrl: './room.html',
  styleUrl: './room.css',
})
export class RoomWaiting {
  protected readonly ws = inject(WsService);
  private readonly router = inject(Router);

  protected readonly roomState = this.ws.roomState;
  protected readonly isHost = computed(() => {
    const state = this.roomState();
    return !!state && state.hostId === state.yourPlayerId;
  });
  protected readonly canStart = computed(() => (this.roomState()?.players.length ?? 0) >= 2);
  protected readonly inviteLink = computed(() => {
    const state = this.roomState();
    return state ? `${location.origin}/room/${state.code}` : '';
  });
  protected readonly copied = signal(false);

  constructor() {
    // A direct link/refresh into /room/:code has no live socket state yet
    // (state lives only in-memory, per architecture) — bounce back home
    // rather than render an empty room.
    effect(() => {
      if (!this.roomState()) {
        this.router.navigate(['/']);
      }
    });

    // Once the host starts the game, the server broadcasts GameState to
    // every seated player — move everyone to the game screen.
    effect(() => {
      const state = this.roomState();
      if (state && this.ws.gameState()) {
        this.router.navigate(['/room', state.code, 'play']);
      }
    });
  }

  startGame(): void {
    this.ws.startGame();
  }

  async copyInviteLink(): Promise<void> {
    await navigator.clipboard.writeText(this.inviteLink());
    this.copied.set(true);
  }

  leave(): void {
    this.ws.leaveRoom();
    this.router.navigate(['/']);
  }
}
