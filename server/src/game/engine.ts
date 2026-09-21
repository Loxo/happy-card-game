import type {
  CardEffectKind,
  CardInstance,
  CardSource,
  GameStateMessage,
  OpponentSummary,
  PlayedCardEntry,
  TurnActionKind,
} from '@happy-card-game/shared';
import { buildDeck, drawCard } from './deck.js';
import { computeResources } from './scoring.js';
import {
  createPlayerState,
  currentPlayerId,
  getPlayerState,
  MAX_ROUNDS,
  STARTING_HAND_SIZE,
  type GameState,
  type PlayerState,
} from './state.js';
import { canPlayCard, getDefinition, resolveUpgrade } from './tableRules.js';

/**
 * Every reason a `takeTurnAction` call can be rejected for — the router
 * maps each to a human-readable `ActionRejected.reason` string. `cap`,
 * `exclusion`, and `prerequisite` come from `canPlayCard`; the rest are the
 * engine's own turn/identity/target checks.
 */
export type RejectionReason =
  | 'cap'
  | 'exclusion'
  | 'prerequisite'
  | 'wrong-turn'
  | 'unknown-card'
  | 'missing-target'
  | 'not-a-malus-card'
  | 'missing-hand-card'
  | 'game-over';

export type TakeTurnResult = { ok: true } | { ok: false; reason: RejectionReason };

export interface TakeTurnOptions {
  /** Only meaningful for `'discard'`. Defaults to `'hand'`. */
  source?: CardSource;
  /**
   * Required for a `'discard'` with `source: 'table'` — the hand card
   * discarded in the same combo (confirmed rule: a table-discard alone
   * would leave hand size at 6, so it always pairs with a hand card).
   */
  handCardId?: string;
  /** Only meaningful for `'malus'`. */
  targetPlayerId?: string;
}

export interface GameEngineOptions {
  /** Injectable RNG for deterministic shuffles/draws in tests. */
  rng?: () => number;
}

/**
 * Server-authoritative game engine for one room's game. Holds the full
 * state (`this.state`) in memory only — never persisted, matching the
 * architecture decision.
 */
export class GameEngine {
  readonly state: GameState;
  private readonly rng: () => number;

  constructor(options: GameEngineOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.state = {
      players: [],
      turnOrder: [],
      turnIndex: 0,
      deck: [],
      discardPile: [],
      playedCards: [],
      roundNumber: 1,
      playedCardsRound: 1,
      roundsRemaining: 0,
      finished: false,
      result: undefined,
    };
  }

  /**
   * Shuffles the deck, deals a `STARTING_HAND_SIZE`-card hand to each
   * player, and fixes turn order and `roundsRemaining`. Deliberately does
   * *not* auto-draw for the first turn — that is `startTurn()`'s own
   * broadcastable step (see the phase-4 user journey: dealing and the
   * first turn's auto-draw are two separate broadcasts).
   */
  startGame(playerIds: string[]): void {
    this.state.deck = buildDeck(undefined, this.rng);
    this.state.discardPile = [];
    this.state.playedCards = [];
    this.state.roundNumber = 1;
    this.state.playedCardsRound = 1;
    this.state.turnOrder = [...playerIds];
    this.state.turnIndex = 0;
    this.state.roundsRemaining = MAX_ROUNDS;
    this.state.finished = false;
    this.state.result = undefined;
    this.state.players = playerIds.map((playerId) => {
      const player = createPlayerState(playerId);
      for (let i = 0; i < STARTING_HAND_SIZE; i += 1) {
        player.hand.push(drawCard(this.state.deck, this.state.discardPile, this.rng));
      }
      return player;
    });
  }

  /**
   * Auto-draws 1 card for the active player (reshuffling the discard pile
   * into the deck first if needed) before any action can be accepted for
   * their turn. A no-op once the game has finished, and a no-op (rather
   * than a throw) if literally nothing is left to draw anywhere.
   */
  startTurn(): void {
    if (this.state.finished) {
      return;
    }
    if (this.state.deck.length === 0 && this.state.discardPile.length === 0) {
      return;
    }
    const player = getPlayerState(this.state, currentPlayerId(this.state));
    if (!player) {
      return;
    }
    player.hand.push(drawCard(this.state.deck, this.state.discardPile, this.rng));
  }

  /**
   * Applies one turn action for `playerId`. Rejects (with no state change)
   * if it isn't their turn, the referenced card can't be found where the
   * action expects it, or the specific table-rule/malus-target checks
   * fail. On success, recomputes live resources are always available via
   * `computeResources` (nothing to bank), then advances the turn.
   */
  takeTurnAction(
    playerId: string,
    cardId: string,
    action: TurnActionKind,
    options: TakeTurnOptions = {},
  ): TakeTurnResult {
    if (this.state.finished) {
      return { ok: false, reason: 'game-over' };
    }
    if (playerId !== currentPlayerId(this.state)) {
      return { ok: false, reason: 'wrong-turn' };
    }
    const player = getPlayerState(this.state, playerId);
    if (!player) {
      return { ok: false, reason: 'unknown-card' };
    }

    let result: TakeTurnResult;
    switch (action) {
      case 'play':
        result = this.playCard(player, cardId);
        break;
      case 'discard':
        result = this.discardCard(player, cardId, options.source ?? 'hand', options.handCardId);
        break;
      case 'malus':
        result = this.useMalus(player, cardId, options.targetPlayerId);
        break;
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }

    if (!result.ok) {
      return result;
    }

    this.advanceTurn();
    return { ok: true };
  }

  private playCard(player: PlayerState, cardId: string): TakeTurnResult {
    const handIndex = player.hand.findIndex((instance) => instance.instanceId === cardId);
    if (handIndex === -1) {
      return { ok: false, reason: 'unknown-card' };
    }
    const cardInstance = player.hand[handIndex];
    const definition = getDefinition(cardInstance.definitionId);

    // resolveUpgrade runs before canPlayCard — canPlayCard needs its result
    // to exclude the upgrade target from cap/exclusion checks.
    const upgradeTarget = resolveUpgrade(player.table, definition);
    const check = canPlayCard(player.table, definition, upgradeTarget);
    if (!check.ok) {
      return { ok: false, reason: check.reason };
    }

    player.hand.splice(handIndex, 1);
    if (upgradeTarget) {
      const targetIndex = player.table.findIndex((instance) => instance === upgradeTarget);
      player.table.splice(targetIndex, 1);
      this.state.discardPile.push(upgradeTarget);
    }
    player.table.push(cardInstance);
    this.recordPlayedCard(player.playerId, cardInstance);
    return { ok: true };
  }

  private discardCard(
    player: PlayerState,
    cardId: string,
    source: CardSource,
    handCardId?: string,
  ): TakeTurnResult {
    if (source === 'hand') {
      const index = player.hand.findIndex((instance) => instance.instanceId === cardId);
      if (index === -1) {
        return { ok: false, reason: 'unknown-card' };
      }
      const [removed] = player.hand.splice(index, 1);
      this.state.discardPile.push(removed);
      return { ok: true };
    }

    // source === 'table': a combo. Validate both cards exist *before*
    // mutating anything, so a rejection genuinely changes no state.
    const tableIndex = player.table.findIndex((instance) => instance.instanceId === cardId);
    if (tableIndex === -1) {
      return { ok: false, reason: 'unknown-card' };
    }
    if (!handCardId) {
      return { ok: false, reason: 'missing-hand-card' };
    }
    const handIndex = player.hand.findIndex((instance) => instance.instanceId === handCardId);
    if (handIndex === -1) {
      return { ok: false, reason: 'missing-hand-card' };
    }

    const [removedFromTable] = player.table.splice(tableIndex, 1);
    const [removedFromHand] = player.hand.splice(handIndex, 1);
    this.state.discardPile.push(removedFromTable, removedFromHand);
    return { ok: true };
  }

  private useMalus(player: PlayerState, cardId: string, targetPlayerId?: string): TakeTurnResult {
    const handIndex = player.hand.findIndex((instance) => instance.instanceId === cardId);
    if (handIndex === -1) {
      return { ok: false, reason: 'unknown-card' };
    }
    const cardInstance = player.hand[handIndex];
    const definition = getDefinition(cardInstance.definitionId);
    const effect = definition.effect;
    if (!effect) {
      return { ok: false, reason: 'not-a-malus-card' };
    }
    const target = targetPlayerId ? getPlayerState(this.state, targetPlayerId) : undefined;
    if (!targetPlayerId || !target) {
      return { ok: false, reason: 'missing-target' };
    }

    // Remove the malus card from hand BEFORE resolving the effect: a
    // self-target (target === player) mutates `player.hand` inside
    // resolveEffect, and doing that before this splice would corrupt the
    // index and duplicate/drop cards. Order matters regardless of target.
    player.hand.splice(handIndex, 1);
    this.resolveEffect(effect, player, target);
    this.state.discardPile.push(cardInstance);
    this.recordPlayedCard(player.playerId, cardInstance);
    return { ok: true };
  }

  private resolveEffect(effect: CardEffectKind, actor: PlayerState, target: PlayerState): void {
    switch (effect) {
      case 'malus-skip-turn':
        target.skipNextTurn = true;
        return;
      case 'malus-force-discard': {
        const [discarded] = target.hand.splice(0, 1);
        if (discarded) {
          this.state.discardPile.push(discarded);
        }
        return;
      }
      case 'malus-steal-card': {
        const [stolen] = target.hand.splice(0, 1);
        if (stolen) {
          actor.hand.push(stolen);
        }
        return;
      }
      default: {
        const exhaustive: never = effect;
        return exhaustive;
      }
    }
  }

  /**
   * Upserts this seat's entry in the played-cards row. Lazily clears the
   * row first if it still holds the *previous* round's entries — see
   * `GameState.playedCardsRound`'s doc comment for why the clear can't
   * happen eagerly at the round-wrap point in `advanceTurn`.
   */
  private recordPlayedCard(playerId: string, card: CardInstance): void {
    if (this.state.playedCardsRound !== this.state.roundNumber) {
      this.state.playedCards = [];
      this.state.playedCardsRound = this.state.roundNumber;
    }
    const entry: PlayedCardEntry = { playerId, card };
    const index = this.state.playedCards.findIndex((existing) => existing.playerId === playerId);
    if (index === -1) {
      this.state.playedCards.push(entry);
    } else {
      this.state.playedCards[index] = entry;
    }
  }

  /**
   * Moves to the next seat in `turnOrder`, skipping anyone flagged by a
   * `malus-skip-turn` effect, decrementing `roundsRemaining` and bumping
   * `roundNumber` once every seat has gone (index wraps to 0) — the
   * played-cards row itself clears lazily, see `recordPlayedCard` — and
   * checking the end condition after every step (it can fire mid-round).
   * Auto-draws for whichever seat actually ends up active.
   */
  private advanceTurn(): void {
    for (;;) {
      const nextIndex = (this.state.turnIndex + 1) % this.state.turnOrder.length;
      if (nextIndex === 0) {
        this.state.roundsRemaining -= 1;
        this.state.roundNumber += 1;
      }
      this.state.turnIndex = nextIndex;

      if (this.checkGameOver()) {
        return;
      }

      const next = getPlayerState(this.state, currentPlayerId(this.state));
      if (next?.skipNextTurn) {
        next.skipNextTurn = false;
        continue;
      }
      this.startTurn();
      return;
    }
  }

  /** Ends the game (ranking by happiness) when `roundsRemaining` hits 0, or immediately if nothing is left to draw and every hand is empty. */
  private checkGameOver(): boolean {
    const deckExhausted = this.state.deck.length === 0 && this.state.discardPile.length === 0;
    const everyHandEmpty = this.state.players.every((player) => player.hand.length === 0);
    if (this.state.roundsRemaining <= 0 || (deckExhausted && everyHandEmpty)) {
      this.finishGame();
      return true;
    }
    return false;
  }

  private finishGame(): void {
    this.state.finished = true;
    const rankings = this.state.players
      .map((player) => ({
        playerId: player.playerId,
        happiness: computeResources(player.table).happiness,
      }))
      .sort((a, b) => b.happiness - a.happiness);
    this.state.result = { rankings };
  }

  /** Builds `playerId`'s own `GameState` broadcast payload: their full hand, everyone else stripped to a public summary. */
  toGameStateMessage(playerId: string): GameStateMessage {
    const player = getPlayerState(this.state, playerId);
    const table = player?.table ?? [];

    const opponents: OpponentSummary[] = this.state.players
      .filter((seat) => seat.playerId !== playerId)
      .map((seat) => ({
        playerId: seat.playerId,
        handCount: seat.hand.length,
        table: seat.table,
        resources: computeResources(seat.table),
      }));

    return {
      type: 'GameState',
      hand: player?.hand ?? [],
      table,
      playedCards: this.state.playedCards,
      turnPlayerId: currentPlayerId(this.state),
      roundsRemaining: this.state.roundsRemaining,
      deckCount: this.state.deck.length,
      resources: computeResources(table),
      opponents,
      result: this.state.result,
    };
  }
}
