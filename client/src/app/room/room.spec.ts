import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { GameStateMessage, RoomStateMessage } from '@happy-card-game/shared';
import { RoomWaiting } from './room';
import { WsService } from '../ws.service';

@Component({ selector: 'app-stub', template: '' })
class Stub {}

const HOST_STATE: RoomStateMessage = {
  type: 'RoomState',
  code: 'ABCDE',
  players: ['host-id'],
  hostId: 'host-id',
  yourPlayerId: 'host-id',
};

const TWO_PLAYER_HOST_STATE: RoomStateMessage = {
  ...HOST_STATE,
  players: ['host-id', 'guest-id'],
};

const GUEST_STATE: RoomStateMessage = {
  type: 'RoomState',
  code: 'ABCDE',
  players: ['host-id', 'guest-id'],
  hostId: 'host-id',
  yourPlayerId: 'guest-id',
};

const SOME_GAME_STATE: GameStateMessage = {
  type: 'GameState',
  hand: [],
  table: [],
  playedCards: [],
  turnPlayerId: 'host-id',
  roundsRemaining: 5,
  deckCount: 40,
  resources: { happiness: 0, education: 0, money: 0 },
  opponents: [],
};

describe('RoomWaiting', () => {
  let ws: WsService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomWaiting],
      providers: [
        provideRouter([
          { path: '', component: Stub },
          { path: 'room/:code/play', component: Stub },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    ws = TestBed.inject(WsService);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  function create() {
    const fixture = TestBed.createComponent(RoomWaiting);
    fixture.detectChanges();
    return fixture;
  }

  it('bounces back home when there is no live room state (direct link / refresh)', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    const fixture = create();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it('renders the roster with host and you badges', () => {
    ws.roomState.set(GUEST_STATE);
    const fixture = create();

    const items = fixture.nativeElement.querySelectorAll('.roster li');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.badge-host')).toBeTruthy();
    expect(items[1].querySelector('.badge-you')).toBeTruthy();
  });

  it('renders a copyable invite link built from the room code', () => {
    ws.roomState.set(HOST_STATE);
    const fixture = create();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('.invite-input');
    expect(input.value).toBe(`${location.origin}/room/ABCDE`);
  });

  it('copies the invite link to the clipboard and reflects it in the UI', async () => {
    ws.roomState.set(HOST_STATE);
    const fixture = create();

    fixture.nativeElement.querySelector('.invite-row button').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${location.origin}/room/ABCDE`);
    expect(fixture.nativeElement.querySelector('.invite-row button').textContent).toContain('Copied');
  });

  it('shows Start game only to the host, disabled under 2 players', () => {
    ws.roomState.set(HOST_STATE);
    let fixture = create();
    let startButton: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-primary');
    expect(startButton).toBeTruthy();
    expect(startButton.disabled).toBe(true);

    ws.roomState.set(GUEST_STATE);
    fixture = create();
    expect(fixture.nativeElement.querySelector('.btn-primary')).toBeNull();
  });

  it('enables Start game at 2+ players and sends StartGame when clicked', () => {
    ws.roomState.set(TWO_PLAYER_HOST_STATE);
    const fixture = create();
    const spy = vi.spyOn(ws, 'startGame');

    const startButton: HTMLButtonElement = fixture.nativeElement.querySelector('.btn-primary');
    expect(startButton.disabled).toBe(false);

    startButton.click();
    expect(spy).toHaveBeenCalled();
  });

  it('navigates every player to /room/:code/play once GameState arrives', async () => {
    ws.roomState.set(TWO_PLAYER_HOST_STATE);
    const fixture = create();
    const navigateSpy = vi.spyOn(router, 'navigate');

    ws.gameState.set(SOME_GAME_STATE);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/room', 'ABCDE', 'play']);
  });

  it('sends LeaveRoom and navigates home when leaving', () => {
    ws.roomState.set(HOST_STATE);
    const fixture = create();
    const spy = vi.spyOn(ws, 'leaveRoom');
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.nativeElement.querySelector('.btn-leave').click();

    expect(spy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });
});
