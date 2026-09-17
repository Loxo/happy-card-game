import type { CardInstance, GameResult, PlayedCardEntry } from '@happy-card-game/shared';

/** Fixed round limit for one game — see `plan.md`'s confirmed end condition. */
export const MAX_ROUNDS = 10;

/** Cards dealt to each player when the game starts. */
export const STARTING_HAND_SIZE = 5;

/** One player's private-and-public state combined — the server holds the full hand; broadcasts strip other players' down to a count (`engine.ts#toGameStateMessage`). */
export interface PlayerState {
  playerId: string;
  hand: CardInstance[];
  table: CardInstance[];
  /** Set by an incoming `malus-skip-turn` effect; consumed (and cleared) the next time their turn would start. */
  skipNextTurn: boolean;
}

/**
 * Full authoritative state for one room's game. Lives only in server
 * memory (per the architecture decision — no persistence) and is never
 * broadcast as-is: `GameEngine#toGameStateMessage` projects a per-recipient
 * view of it.
 */
export interface GameState {
  players: PlayerState[];
  /** Seat order turns rotate through — fixed at `startGame`. */
  turnOrder: string[];
  /** Index into `turnOrder` of the player whose turn it currently is. */
  turnIndex: number;
  deck: CardInstance[];
  discardPile: CardInstance[];
  /**
   * The latest 'play'/'malus' card revealed per seat. Cleared lazily (see
   * `playedCardsRound` below), so this can briefly still hold the
   * *previous* round's entries — e.g. a round where every player only
   * discards records nothing, so the prior round's row keeps broadcasting
   * until a 'play' or 'malus' action finally triggers the clear.
   */
  playedCards: PlayedCardEntry[];
  /**
   * Increments every time turn order wraps back to seat 0 (a round
   * completes). `playedCardsRound` tracks which round `playedCards` holds
   * entries for, so the row is cleared lazily on the next *recorded*
   * action (a 'play' or 'malus', not every action) rather than immediately
   * at the wrap — otherwise the completed round's row (including the very
   * entry that triggered the wrap) would be wiped before it's ever
   * broadcast.
   */
  roundNumber: number;
  playedCardsRound: number;
  roundsRemaining: number;
  finished: boolean;
  /** Present only once `finished` is true. */
  result?: GameResult;
}

export function createPlayerState(playerId: string): PlayerState {
  return { playerId, hand: [], table: [], skipNextTurn: false };
}

export function getPlayerState(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((player) => player.playerId === playerId);
}

export function currentPlayerId(state: GameState): string {
  return state.turnOrder[state.turnIndex];
}
