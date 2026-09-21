import { Routes } from '@angular/router';
import { GameBoard } from './game/game-board';
import { Home } from './home/home';
import { RoomWaiting } from './room/room';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'room/:code', component: RoomWaiting },
  { path: 'room/:code/play', component: GameBoard },
];
