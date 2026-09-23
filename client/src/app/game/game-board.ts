import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  RESOURCE_KINDS,
  type CardDefinition,
  type CardInstance,
  type CardSource,
  type PlayedCardEntry,
  type TurnActionKind,
} from '@happy-card-game/shared';
import { WsService } from '../ws.service';
import { CardFace } from './card-face';
import { categoryVisual, TABLEAU_CATEGORY_ORDER } from './category-visuals';
import { Hand } from './hand';
import { Icon } from './icon';
import { OpponentSeat } from './opponent-seat';
import { Table } from './table';
import { Tableau } from './tableau';
import { getDefinition } from './table-rules';

type RoundDotState = 'filled' | 'current' | 'hollow';

type Selection =
  | { kind: 'malus-target'; card: CardInstance }
  | { kind: 'table-discard-pick-hand'; tableCard: CardInstance }
  | null;

interface PendingAction {
  cardId: string;
  action: TurnActionKind;
  source?: CardSource;
  handCardId?: string;
  targetPlayerId?: string;
}

const SEAT_POSITIONS: Array<'top' | 'left' | 'right'> = ['top', 'left', 'right'];

@Component({
  selector: 'app-game-board',
  imports: [CardFace, Hand, Icon, OpponentSeat, Table, Tableau],
  templateUrl: './game-board.html',
  styleUrl: './game-board.css',
})
export class GameBoard {
  private readonly ws = inject(WsService);
  private readonly router = inject(Router);

  protected readonly gameState = this.ws.gameState;
  protected readonly roomState = this.ws.roomState;
  protected readonly rejectedReason = this.ws.actionRejectedReason;

  protected readonly selection = signal<Selection>(null);
  protected readonly pendingAction = signal<PendingAction | null>(null);

  protected readonly yourPlayerId = computed(() => this.roomState()?.yourPlayerId ?? null);

  protected readonly isMyTurn = computed(() => {
    const state = this.gameState();
    const me = this.yourPlayerId();
    return !!state && !!me && state.turnPlayerId === me;
  });

  protected readonly interactionDisabled = computed(
    () => !this.isMyTurn() || this.pendingAction() !== null || !!this.gameState()?.result,
  );

  protected readonly pickingMalusTarget = computed(() => this.selection()?.kind === 'malus-target');
  protected readonly pickingTableDiscardPair = computed(
    () => this.selection()?.kind === 'table-discard-pick-hand',
  );

  /** Own hand, table, and played-cards row with the in-flight action already applied — the server truth replaces this the moment its broadcast lands. */
  protected readonly displayHand = computed<CardInstance[]>(() => {
    const state = this.gameState();
    const pending = this.pendingAction();
    if (!state) {
      return [];
    }
    if (!pending) {
      return state.hand;
    }
    const removedId =
      pending.action === 'discard' && pending.source === 'table' ? pending.handCardId : pending.cardId;
    return state.hand.filter((card) => card.instanceId !== removedId);
  });

  protected readonly displayTable = computed<CardInstance[]>(() => {
    const state = this.gameState();
    const pending = this.pendingAction();
    if (!state) {
      return [];
    }
    if (!pending) {
      return state.table;
    }
    if (pending.action === 'play') {
      const card = state.hand.find((c) => c.instanceId === pending.cardId);
      return card ? [...state.table, card] : state.table;
    }
    if (pending.action === 'discard' && pending.source === 'table') {
      return state.table.filter((card) => card.instanceId !== pending.cardId);
    }
    return state.table;
  });

  protected readonly displayPlayedCards = computed<PlayedCardEntry[]>(() => {
    const state = this.gameState();
    const pending = this.pendingAction();
    const me = this.yourPlayerId();
    if (!state) {
      return [];
    }
    if (pending && me && (pending.action === 'play' || pending.action === 'malus')) {
      const card = state.hand.find((c) => c.instanceId === pending.cardId);
      if (card) {
        return [...state.playedCards.filter((entry) => entry.playerId !== me), { playerId: me, card }];
      }
    }
    return state.playedCards;
  });

  protected readonly seatedOpponents = computed(() => {
    const state = this.gameState();
    const room = this.roomState();
    if (!state || !room) {
      return [];
    }
    return state.opponents.map((opponent, index) => {
      const seatIndex = room.players.indexOf(opponent.playerId);
      return {
        opponent,
        seatLabel: seatIndex === -1 ? opponent.playerId.slice(0, 6) : `Player ${seatIndex + 1}`,
        position: SEAT_POSITIONS[index] ?? 'right',
        connected: room.players.includes(opponent.playerId),
      };
    });
  });

  protected readonly turnStatus = computed(() => {
    const state = this.gameState();
    if (!state) {
      return '';
    }
    if (state.result) {
      return 'Game over.';
    }
    if (this.isMyTurn()) {
      return 'Your turn.';
    }
    return `Waiting on ${this.seatLabelFor(state.turnPlayerId)}…`;
  });

  protected readonly rankings = computed(() => {
    const result = this.gameState()?.result;
    if (!result) {
      return [];
    }
    return result.rankings.map((ranking) => ({
      ...ranking,
      label: ranking.playerId === this.yourPlayerId() ? 'You' : this.seatLabelFor(ranking.playerId),
    }));
  });

  /**
   * `MAX_ROUNDS` lives server-side only (`server/src/game/state.ts`) and
   * isn't exported through `shared` — but the engine sets
   * `roundsRemaining = MAX_ROUNDS` at game start, strictly before its first
   * decrement, so the *first* `GameState` this client ever observes always
   * carries the true total. Captured once and held for the game's lifetime.
   */
  private readonly totalRoundsSignal = signal<number | null>(null);
  protected readonly totalRounds = computed(() => this.totalRoundsSignal() ?? 0);

  protected readonly roundTrackerDots = computed<RoundDotState[]>(() => {
    const total = this.totalRounds();
    const remaining = this.gameState()?.roundsRemaining ?? 0;
    if (total <= 0) {
      return [];
    }
    const played = total - remaining;
    return Array.from({ length: total }, (_, i): RoundDotState => {
      if (i < played) return 'filled';
      if (i === played && remaining > 0) return 'current';
      return 'hollow';
    });
  });

  protected readonly currentRoundNumber = computed(() =>
    Math.min(this.totalRounds() - (this.gameState()?.roundsRemaining ?? 0) + 1, this.totalRounds()),
  );

  protected readonly legendCategories = [...TABLEAU_CATEGORY_ORDER, 'malus'] as const;
  protected readonly categoryVisual = categoryVisual;

  constructor() {
    // A direct link/refresh into the game route has no live socket state
    // (state lives only in-memory, per architecture) — bounce back home
    // rather than render an empty board.
    effect(() => {
      if (!this.gameState()) {
        this.router.navigate(['/']);
      }
    });

    // Capture the round total once, from the first GameState this client sees.
    effect(() => {
      const state = this.gameState();
      untracked(() => {
        if (state && this.totalRoundsSignal() === null) {
          this.totalRoundsSignal.set(state.roundsRemaining);
        }
      });
    });

    // A fresh GameState broadcast only ever follows an *accepted* action —
    // a rejection never triggers one (see server `routeMessage`) — so any
    // new broadcast while something is pending means it settled.
    effect(() => {
      this.gameState();
      untracked(() => {
        if (this.pendingAction()) {
          this.pendingAction.set(null);
        }
      });
    });

    // A rejection is the other possible outcome for a pending action.
    effect(() => {
      this.rejectedReason();
      untracked(() => {
        if (this.pendingAction()) {
          this.pendingAction.set(null);
        }
      });
    });
  }

  protected readonly resourceKinds = RESOURCE_KINDS;

  protected definitionName(card: CardInstance): string {
    return getDefinition(card.definitionId).name;
  }

  protected definitionFor(card: CardInstance): CardDefinition {
    return getDefinition(card.definitionId);
  }

  protected seatLabelFor(playerId: string): string {
    const seatIndex = this.roomState()?.players.indexOf(playerId) ?? -1;
    return seatIndex === -1 ? 'a player' : `Player ${seatIndex + 1}`;
  }

  onPlay(card: CardInstance): void {
    if (this.interactionDisabled()) {
      return;
    }
    this.sendAction({ cardId: card.instanceId, action: 'play' });
  }

  onDiscardFromHand(card: CardInstance): void {
    if (this.interactionDisabled()) {
      return;
    }
    this.sendAction({ cardId: card.instanceId, action: 'discard', source: 'hand' });
  }

  onUseMalus(card: CardInstance): void {
    if (this.interactionDisabled()) {
      return;
    }
    this.selection.set({ kind: 'malus-target', card });
  }

  onTableauDiscard(tableCard: CardInstance): void {
    if (this.interactionDisabled() || this.displayHand().length === 0) {
      return;
    }
    this.selection.set({ kind: 'table-discard-pick-hand', tableCard });
  }

  onPairForTableDiscard(handCard: CardInstance): void {
    const selection = this.selection();
    if (selection?.kind !== 'table-discard-pick-hand') {
      return;
    }
    this.sendAction({
      cardId: selection.tableCard.instanceId,
      action: 'discard',
      source: 'table',
      handCardId: handCard.instanceId,
    });
    this.selection.set(null);
  }

  onSeatPick(targetPlayerId: string): void {
    const selection = this.selection();
    if (selection?.kind !== 'malus-target') {
      return;
    }
    this.sendAction({ cardId: selection.card.instanceId, action: 'malus', targetPlayerId });
    this.selection.set(null);
  }

  cancelSelection(): void {
    this.selection.set(null);
  }

  private sendAction(payload: PendingAction): void {
    this.pendingAction.set(payload);
    this.ws.takeTurnAction(payload.cardId, payload.action, {
      source: payload.source,
      handCardId: payload.handCardId,
      targetPlayerId: payload.targetPlayerId,
    });
  }
}
