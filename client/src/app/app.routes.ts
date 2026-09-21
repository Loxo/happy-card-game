import { Component } from '@angular/core';
import { Routes } from '@angular/router';
import { Home } from './home/home';
import { RoomWaiting } from './room/room';

/** Placeholder until phase 6 builds the real game board at this route. */
@Component({ selector: 'app-game-stub', template: `<p>Game starting…</p>` })
class GameStub {}

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'room/:code', component: RoomWaiting },
  { path: 'room/:code/play', component: GameStub },
];
