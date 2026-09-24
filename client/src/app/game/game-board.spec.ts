import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { CardInstance, GameStateMessage, RoomStateMessage } from '@happy-card-game/shared';
import { GameBoard } from './game-board';
import { WsService } from '../ws.service';
import { provideTranslocoTesting } from '../testing/transloco-testing.providers';

@Component({ selector: 'app-stub', template: '' })
class Stub {}

const ME = 'p1';
const OPP = 'p2';
const OPP2 = 'p3';
const OPP3 = 'p4';

function card(instanceId: string, definitionId: string): CardInstance {
  return { instanceId, definitionId };
}

function room(players: string[]): RoomStateMessage {
  return { type: 'RoomState', code: 'ABCDE', players, hostId: players[0], yourPlayerId: ME };
}

function state(overrides: Partial<GameStateMessage> = {}): GameStateMessage {
  return {
    type: 'GameState',
    hand: [],
    table: [],
    playedCards: [],
    turnPlayerId: ME,
    roundsRemaining: 5,
    deckCount: 30,
    resources: { happiness: 0, education: 0, money: 0 },
    opponents: [],
    ...overrides,
  };
}

describe('GameBoard', () => {
  let ws: WsService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameBoard, provideTranslocoTesting()],
      providers: [provideRouter([{ path: '', component: Stub }])],
    }).compileComponents();

    router = TestBed.inject(Router);
    ws = TestBed.inject(WsService);
  });

  function create() {
    const fixture = TestBed.createComponent(GameBoard);
    fixture.detectChanges();
    return fixture;
  }

  function handButtons(fixture: ReturnType<typeof create>): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('app-hand .card'));
  }

  function findByText(elements: HTMLButtonElement[], text: string): HTMLButtonElement {
    const found = elements.find((el) => el.textContent?.includes(text));
    if (!found) {
      throw new Error(`No element found containing "${text}"`);
    }
    return found;
  }

  it('bounces back home when there is no live game state (direct link / refresh)', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    const fixture = create();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/']);
  });

  it.each([
    ['2-player room', ['p1', 'p2'], 1],
    ['3-player room', ['p1', 'p2', 'p3'], 2],
    ['4-player room', ['p1', 'p2', 'p3', 'p4'], 3],
  ])('renders the correct opponent-seat count for a %s', (_label, players, expectedSeats) => {
    ws.roomState.set(room(players));
    ws.gameState.set(
      state({
        opponents: players
          .filter((id) => id !== ME)
          .map((playerId) => ({ playerId, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } })),
      }),
    );
    const fixture = create();

    expect(fixture.nativeElement.querySelectorAll('app-opponent-seat').length).toBe(expectedSeats);
  });

  it('disables Play with a reason for a card the client-side rules would reject, before any send', () => {
    ws.roomState.set(room([ME, OPP]));
    ws.gameState.set(
      state({
        table: [card('t1', 'job-waiter')],
        hand: [card('h1', 'job-waiter'), card('h2', 'education-degree')],
        opponents: [{ playerId: OPP, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
      }),
    );
    const spy = vi.spyOn(ws, 'takeTurnAction');
    const fixture = create();

    findByText(handButtons(fixture), 'Serveur').click();
    fixture.detectChanges();
    const playButton: HTMLButtonElement = fixture.nativeElement.querySelector('app-hand .menu .btn-outline');
    const reason = fixture.nativeElement.querySelector('app-hand .reason');

    expect(playButton.disabled).toBe(true);
    expect(reason?.textContent).toContain('Category cap reached');

    playButton.click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('optimistically moves a valid play into the tableau and played-cards row before any server round trip', () => {
    ws.roomState.set(room([ME, OPP]));
    const original = state({
      hand: [card('h1', 'education-degree')],
      opponents: [{ playerId: OPP, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
    });
    ws.gameState.set(original);
    const spy = vi.spyOn(ws, 'takeTurnAction');
    const fixture = create();

    findByText(handButtons(fixture), 'Diplôme').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('app-hand .menu .btn-outline').click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('h1', 'play', {
      source: undefined,
      handCardId: undefined,
      targetPlayerId: undefined,
    });
    expect(handButtons(fixture).length).toBe(0);
    expect(fixture.nativeElement.querySelector('app-tableau').textContent).toContain('Diplôme');
    expect(fixture.nativeElement.querySelector('.played-row').textContent).toContain('Diplôme');
    // The overlay never mutates the source of truth.
    expect(ws.gameState()).toBe(original);
  });

  it('reverts to the pre-optimistic shape and shows the reason when the server rejects the action', () => {
    ws.roomState.set(room([ME, OPP]));
    ws.gameState.set(
      state({
        hand: [card('h1', 'education-degree')],
        opponents: [{ playerId: OPP, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
      }),
    );
    const fixture = create();
    findByText(handButtons(fixture), 'Diplôme').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('app-hand .menu .btn-outline').click();
    fixture.detectChanges();

    ws.actionRejectedReason.set("It isn't your turn");
    fixture.detectChanges();

    expect(handButtons(fixture).length).toBe(1);
    expect(fixture.nativeElement.querySelector('app-tableau').textContent).not.toContain('Diplôme');
    expect(fixture.nativeElement.querySelector('.error').textContent).toContain("isn't your turn");
  });

  it('settles into the broadcast state with no leftover optimistic artifacts once accepted', () => {
    ws.roomState.set(room([ME, OPP]));
    ws.gameState.set(
      state({
        hand: [card('h1', 'education-degree')],
        opponents: [{ playerId: OPP, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
      }),
    );
    const fixture = create();
    findByText(handButtons(fixture), 'Diplôme').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('app-hand .menu .btn-outline').click();
    fixture.detectChanges();

    ws.gameState.set(
      state({
        hand: [],
        table: [card('h1', 'education-degree')],
        playedCards: [{ playerId: ME, card: card('h1', 'education-degree') }],
        turnPlayerId: OPP,
        opponents: [{ playerId: OPP, handCount: 6, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
      }),
    );
    fixture.detectChanges();

    expect(handButtons(fixture).length).toBe(0);
    expect(fixture.nativeElement.querySelector('app-tableau').textContent).toContain('Diplôme');
    const playedSlots = fixture.nativeElement.querySelectorAll('.played-slot');
    expect(playedSlots.length).toBe(1);
  });

  it('marks an opponent seat disconnected once the live roster drops them', () => {
    ws.roomState.set(room([ME, OPP])); // OPP2 no longer in the live roster
    ws.gameState.set(
      state({
        turnPlayerId: ME,
        opponents: [
          { playerId: OPP, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } },
          { playerId: OPP2, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } },
        ],
      }),
    );
    const fixture = create();

    const seats = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('app-opponent-seat .seat'));
    const disconnectedSeat = seats.find((seat) => seat.classList.contains('disconnected'));
    expect(disconnectedSeat).toBeTruthy();
    expect(disconnectedSeat?.textContent).toContain('disconnected');
  });

  it('shows the happiness ranking to every remaining player once the game ends', () => {
    ws.roomState.set(room([ME, OPP]));
    ws.gameState.set(
      state({
        opponents: [{ playerId: OPP, handCount: 0, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
        result: {
          rankings: [
            { playerId: ME, happiness: 5 },
            { playerId: OPP, happiness: 2 },
          ],
        },
      }),
    );
    const fixture = create();

    const text = fixture.nativeElement.querySelector('.game-over').textContent;
    expect(text).toContain('You');
    expect(text).toContain('5');
    expect(text).toContain('Player 2');
    expect(text).toContain('2');
  });

  it('use-malus prompts an opponent target, then sends the action against the picked seat', () => {
    ws.roomState.set(room([ME, OPP]));
    ws.gameState.set(
      state({
        hand: [card('m1', 'malus-rival')],
        opponents: [{ playerId: OPP, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
      }),
    );
    const spy = vi.spyOn(ws, 'takeTurnAction');
    const fixture = create();

    findByText(handButtons(fixture), 'Rival amoureux').click();
    fixture.detectChanges();
    const menuButtons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('app-hand .menu button'));
    findByText(menuButtons, 'Use malus').click();
    fixture.detectChanges();

    const seatButton: HTMLButtonElement = fixture.nativeElement.querySelector('app-opponent-seat .seat');
    expect(seatButton.classList.contains('selectable')).toBe(true);
    seatButton.click();

    expect(spy).toHaveBeenCalledWith('m1', 'malus', {
      source: undefined,
      handCardId: undefined,
      targetPlayerId: OPP,
    });
  });

  it('a table-discard combo pairs the tapped table card with a chosen hand card', () => {
    ws.roomState.set(room([ME, OPP]));
    ws.gameState.set(
      state({
        table: [card('t1', 'job-waiter')],
        hand: [card('h1', 'education-degree')],
        opponents: [{ playerId: OPP, handCount: 5, table: [], resources: { happiness: 0, education: 0, money: 0 } }],
      }),
    );
    const spy = vi.spyOn(ws, 'takeTurnAction');
    const fixture = create();

    fixture.nativeElement.querySelector('app-tableau .card').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-hand .hint')?.textContent).toContain('Choose a hand card');
    handButtons(fixture)[0].click();

    expect(spy).toHaveBeenCalledWith('t1', 'discard', {
      source: 'table',
      handCardId: 'h1',
      targetPlayerId: undefined,
    });
  });
});
