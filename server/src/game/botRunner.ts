import type { Room } from '../rooms/room.js';
import type { BotAction } from './bot.js';
import { currentPlayerId } from './state.js';

/** Runs `fn` after `ms`; returns a function that cancels it. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export interface BotTurnOptions {
  scheduler: Scheduler;
  delayMs: number;
}

export const defaultScheduler: Scheduler = (fn, ms) => {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
};

/**
 * If it is a bot's turn, schedules that bot's move, then chains to the next
 * bot until a human is up or the game ends. The delay gives the human time
 * to read each move in the played-cards row.
 *
 * `broadcast` is injected so this module does not import the router.
 */
export function runBotTurns(room: Room, broadcast: (room: Room) => void, options: BotTurnOptions): void {
  const engine = room.engine;
  if (!engine || engine.state.finished || room.isDisposed) {
    return;
  }
  const botId = currentPlayerId(engine.state);
  const bot = room.bots.get(botId);
  if (!bot) {
    return;
  }

  room.cancelBotTurn?.();
  room.cancelBotTurn = options.scheduler(() => {
    room.cancelBotTurn = undefined;
    if (room.isDisposed || engine.state.finished || currentPlayerId(engine.state) !== botId) {
      return;
    }
    // A bot that cannot act (empty hand) ends the chain instead of re-scheduling forever.
    if (playBotMove(room, botId, bot.chooseAction(engine.state))) {
      broadcast(room);
      runBotTurns(room, broadcast, options);
    }
  }, options.delayMs);
}

/** Applies the bot's choice; on any rejection falls back to discarding a hand card so the game never stalls. Returns whether a move was made. */
function playBotMove(room: Room, botId: string, action: BotAction | undefined): boolean {
  const engine = room.engine!;
  if (action) {
    const result = engine.takeTurnAction(botId, action.cardId, action.action, action.options);
    if (result.ok) {
      return true;
    }
  }
  const hand = engine.state.players.find((player) => player.playerId === botId)?.hand ?? [];
  if (hand.length === 0) {
    return false;
  }
  return engine.takeTurnAction(botId, hand[0].instanceId, 'discard', { source: 'hand' }).ok;
}
