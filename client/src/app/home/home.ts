import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WsService } from '../ws.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly ws = inject(WsService);
  private readonly router = inject(Router);

  protected readonly joinCode = signal('');
  protected readonly status = this.ws.status;
  protected readonly rejectedReason = this.ws.actionRejectedReason;

  constructor() {
    // Once a RoomState lands (from either CreateRoom or JoinRoom), the room
    // exists on the server — move to the waiting room.
    effect(() => {
      const state = this.ws.roomState();
      if (state) {
        this.router.navigate(['/room', state.code]);
      }
    });
  }

  createRoom(): void {
    this.ws.createRoom();
  }

  joinRoom(): void {
    const code = this.joinCode().trim().toUpperCase();
    if (!code) {
      return;
    }
    this.ws.joinRoom(code);
  }
}
