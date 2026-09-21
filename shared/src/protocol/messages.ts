import type { CardInstance, ResourceKind } from '../cards/card.js';

/**
 * WS message protocol — one discriminated union per direction, `type` as
 * the tag. Both `client` and `server` import these so the wire contract
 * can't drift between them.
 */

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export interface CreateRoomMessage {
  type: 'CreateRoom';
}

export interface JoinRoomMessage {
  type: 'JoinRoom';
  code: string;
}

export interface StartGameMessage {
  type: 'StartGame';
}

/** The one action a player takes on their turn, after the server auto-draws. */
export type TurnActionKind = 'play' | 'discard' | 'malus';

/**
 * Where a `'discard'` action removes the card from. Only meaningful when
 * `action` is `'discard'`; defaults to `'hand'` — a player may also discard
 * from their own table.
 */
export type CardSource = 'hand' | 'table';

export interface TakeTurnActionMessage {
  type: 'TakeTurnAction';
  /** The `CardInstance.instanceId` of the card being acted on. */
  cardId: string;
  action: TurnActionKind;
  /** Only meaningful when `action` is `'discard'`. Defaults to `'hand'`. */
  source?: CardSource;
  /**
   * Required when `action` is `'discard'` and `source` is `'table'`: a
   * table-discard is a combo — `cardId` (on the table) and this hand card
   * are discarded together, atomically. This is what keeps "hand always
   * ends the turn at 5" true even here, since nothing else about a
   * table-discard removes a card from hand.
   *
   * Enforced by the engine (`ActionRejected` with reason
   * `missing-hand-card`), not by the wire-shape guard — a guard-level
   * rejection would surface as a generic `Error` instead of naming the
   * specific rule broken.
   */
  handCardId?: string;
  /** Only meaningful when `action` is `'malus'`. */
  targetPlayerId?: string;
}

export interface LeaveRoomMessage {
  type: 'LeaveRoom';
}

export type ClientToServerMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | StartGameMessage
  | TakeTurnActionMessage
  | LeaveRoomMessage;

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export interface RoomStateMessage {
  type: 'RoomState';
  code: string;
  /** Ids of every player currently in the room. */
  players: string[];
  hostId: string;
  /**
   * The id of the connection this message was sent to — sent per-recipient
   * (never broadcast verbatim) so each client can tell which entry in
   * `players` is itself without the protocol carrying display names.
   */
  yourPlayerId: string;
}

/**
 * A public, opponent-facing summary — never the opponent's hand contents,
 * only its count. Their table and resources are public per the wireframe
 * (phase 6): everyone can see everyone's tableau and running scores.
 */
export interface OpponentSummary {
  playerId: string;
  handCount: number;
  table: CardInstance[];
  resources: Record<ResourceKind, number>;
}

/** One player's final standing, present once the game has ended. */
export interface PlayerRanking {
  playerId: string;
  happiness: number;
}

/** One seat's action for the current turn, attributed to its player. */
export interface PlayedCardEntry {
  playerId: string;
  card: CardInstance;
}

/** Sent once the game ends (round limit, or deck and every hand empty). */
export interface GameResult {
  rankings: PlayerRanking[];
}

export interface GameStateMessage {
  type: 'GameState';
  /** This recipient's own hand. */
  hand: CardInstance[];
  /**
   * This recipient's own table — what's currently placed, after any
   * upgrade replacements or table discards.
   */
  table: CardInstance[];
  /** This turn's played-cards row, one entry per seat that has acted, for display. */
  playedCards: PlayedCardEntry[];
  turnPlayerId: string;
  roundsRemaining: number;
  deckCount: number;
  /**
   * This recipient's live resource totals, always derived from what's
   * currently on their table — never a one-way banked counter, since a
   * table discard or an upgrade replacement removes a card's contribution.
   */
  resources: Record<ResourceKind, number>;
  /** Every other seated player's public state — drives the opponent seats. */
  opponents: OpponentSummary[];
  /** Present only once the game has ended. */
  result?: GameResult;
}

export interface ActionRejectedMessage {
  type: 'ActionRejected';
  reason: string;
}

export interface ErrorMessage {
  type: 'Error';
  message: string;
}

export type ServerToClientMessage =
  | RoomStateMessage
  | GameStateMessage
  | ActionRejectedMessage
  | ErrorMessage;
