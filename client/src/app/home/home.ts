import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MAX_BOTS, MIN_BOTS } from '@happy-card-game/shared';
import { WsService } from '../ws.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly ws = inject(WsService);
  private readonly router = inject(Router);

  protected readonly joinCode = signal('');
  protected readonly botCount = signal(MIN_BOTS);
  protected readonly botCountOptions = Array.from({ length: MAX_BOTS - MIN_BOTS + 1 }, (_, i) => MIN_BOTS + i);
  protected readonly status = this.ws.status;
  protected readonly rejectedReason = this.ws.actionRejectedReason;

  constructor() {
    // Once a RoomState lands (from either CreateRoom or JoinRoom), the room
    // exists on the server — move to the waiting room. A solo game has no
    // lobby: its GameState arrives right behind the RoomState, so go
    // straight to the board.
    effect(() => {
      const state = this.ws.roomState();
      if (!state) {
        return;
      }
      if (this.ws.gameState()) {
        this.router.navigate(['/room', state.code, 'play']);
      } else {
        this.router.navigate(['/room', state.code]);
      }
    });
  }

  createRoom(): void {
    this.ws.createRoom();
  }

  startSolo(): void {
    this.ws.startSolo(this.botCount());
  }

  joinRoom(): void {
    const code = this.joinCode().trim().toUpperCase();
    if (!code) {
      return;
    }
    this.ws.joinRoom(code);
  }
}
