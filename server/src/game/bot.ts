import type { CardDefinition, CardInstance, TurnActionKind } from '@happy-card-game/shared';
import { computeResources } from './scoring.js';
import type { TakeTurnOptions } from './engine.js';
import { currentPlayerId, getPlayerState, type GameState } from './state.js';
import { canPlayCard, getDefinition, resolveUpgrade } from './tableRules.js';

/** Weight of a hand card a play newly unlocks (or blocks), relative to happiness already on the table. */
const UNLOCK_WEIGHT = 0.5;
/** Money/education matter only as tie-breakers: happiness is the sole winning metric. */
const SECONDARY_RESOURCE_WEIGHT = 0.1;
/** A play scoring at least this beats using a malus. */
const MEANINGFUL_PLAY_SCORE = 0.5;

// Malus restraint: malus is a catch-up fallback, never harassment.
/** No malus before this round. */
export const MALUS_MIN_ROUND = 3;
/** Rounds that must pass before the same human can be hit again. */
export const HUMAN_MALUS_COOLDOWN_ROUNDS = 3;
/** The target must lead the bot by at least this much happiness. */
export const MALUS_LEADER_GAP = 2;

export interface BotAction {
  cardId: string;
  action: TurnActionKind;
  options: TakeTurnOptions;
}

export interface Bot {
  /** Picks this bot's move for its current turn. `undefined` only when its hand is empty. */
  chooseAction(state: GameState): BotAction | undefined;
}

export interface BotOptions {
  /** Tells bots from humans: skip-turn and the cooldown only protect humans. */
  isBot: (playerId: string) => boolean;
  rng?: () => number;
}

interface ScoredPlay {
  card: CardInstance;
  score: number;
}

function happinessOf(table: readonly CardInstance[]): number {
  return computeResources(table).happiness;
}

function tableAfterPlay(
  table: readonly CardInstance[],
  card: CardInstance,
  upgradeTarget: CardInstance | undefined,
): CardInstance[] {
  return [...table.filter((instance) => instance !== upgradeTarget), card];
}

function isPlayable(table: readonly CardInstance[], definition: CardDefinition): boolean {
  return canPlayCard(table, definition, resolveUpgrade(table, definition)).ok;
}

function cardValue(definition: CardDefinition): number {
  const { happiness = 0, money = 0, education = 0 } = definition.resources ?? {};
  return happiness + SECONDARY_RESOURCE_WEIGHT * (money + education);
}

/** Happiness gained, plus half of what the play unlocks in hand, minus half of what it blocks. */
function scorePlay(table: readonly CardInstance[], hand: readonly CardInstance[], card: CardInstance): number | undefined {
  const definition = getDefinition(card.definitionId);
  const upgradeTarget = resolveUpgrade(table, definition);
  if (!canPlayCard(table, definition, upgradeTarget).ok) {
    return undefined;
  }
  const after = tableAfterPlay(table, card, upgradeTarget);
  const before = computeResources(table);
  const now = computeResources(after);
  let score =
    now.happiness -
    before.happiness +
    SECONDARY_RESOURCE_WEIGHT * (now.money - before.money + now.education - before.education);

  for (const other of hand) {
    if (other === card) continue;
    const otherDefinition = getDefinition(other.definitionId);
    if (otherDefinition.effect) continue;
    const gain = otherDefinition.resources?.happiness ?? 0;
    const playableBefore = isPlayable(table, otherDefinition);
    const playableAfter = isPlayable(after, otherDefinition);
    if (!playableBefore && playableAfter) score += UNLOCK_WEIGHT * gain;
    if (playableBefore && !playableAfter) score -= UNLOCK_WEIGHT * gain;
  }
  return score;
}

/** How much the bot wants to keep `card`; the lowest is discarded. */
function keepValue(table: readonly CardInstance[], hand: readonly CardInstance[], card: CardInstance): number {
  const definition = getDefinition(card.definitionId);
  if (definition.effect) {
    return 0.3;
  }
  if (isPlayable(table, definition)) {
    return cardValue(definition);
  }
  const upgradeTarget = resolveUpgrade(table, definition);
  const check = canPlayCard(table, definition, upgradeTarget);
  if (!check.ok && check.reason === 'prerequisite') {
    return 0.5 * cardValue(definition);
  }
  // Blocked by a cap or exclusion: only a bypass card in hand can free it.
  const unlockedByHand = hand.some((other) => {
    const bypass = getDefinition(other.definitionId);
    return (
      bypass.bypassCap?.includes(definition.category) ||
      bypass.bypassExclusion?.includes(definition.category)
    );
  });
  return unlockedByHand ? 0.5 * cardValue(definition) : -1;
}

export function createBot(botId: string, options: BotOptions): Bot {
  const rng = options.rng ?? Math.random;
  /** Round in which this bot last used a malus on each human. */
  const lastHumanHitRound = new Map<string, number>();

  function chooseMalus(state: GameState): BotAction | undefined {
    const me = getPlayerState(state, botId);
    if (!me || state.roundNumber < MALUS_MIN_ROUND) {
      return undefined;
    }
    const others = state.players.filter((player) => player.playerId !== botId);
    const scored = others.map((player) => ({ player, happiness: happinessOf(player.table) }));
    const leader = scored.sort((a, b) => b.happiness - a.happiness)[0];
    if (!leader || leader.happiness - happinessOf(me.table) < MALUS_LEADER_GAP) {
      return undefined;
    }
    const targetIsBot = options.isBot(leader.player.playerId);
    if (!targetIsBot) {
      const last = lastHumanHitRound.get(leader.player.playerId);
      if (last !== undefined && state.roundNumber - last < HUMAN_MALUS_COOLDOWN_ROUNDS) {
        return undefined;
      }
    }

    // Steal, then force-discard, then skip-turn (bots only). Discard/steal need a card to take.
    const preference = ['malus-steal-card', 'malus-force-discard', 'malus-skip-turn'] as const;
    for (const effect of preference) {
      if (effect === 'malus-skip-turn' && !targetIsBot) continue;
      if (effect !== 'malus-skip-turn' && leader.player.hand.length === 0) continue;
      const card = me.hand.find((instance) => getDefinition(instance.definitionId).effect === effect);
      if (card) {
        if (!targetIsBot) {
          lastHumanHitRound.set(leader.player.playerId, state.roundNumber);
        }
        return {
          cardId: card.instanceId,
          action: 'malus',
          options: { targetPlayerId: leader.player.playerId },
        };
      }
    }
    return undefined;
  }

  return {
    chooseAction(state) {
      const me = getPlayerState(state, botId);
      if (!me || currentPlayerId(state) !== botId || me.hand.length === 0) {
        return undefined;
      }

      // Malus cards are never played to the table: the engine would accept it.
      const plays: ScoredPlay[] = [];
      for (const card of me.hand) {
        if (getDefinition(card.definitionId).effect) continue;
        const score = scorePlay(me.table, me.hand, card);
        if (score !== undefined) plays.push({ card, score });
      }
      // Random tie-break so equal plays do not always resolve in hand order.
      plays.sort((a, b) => b.score - a.score || rng() - 0.5);
      const best = plays[0];

      if (best && best.score >= MEANINGFUL_PLAY_SCORE) {
        return { cardId: best.card.instanceId, action: 'play', options: {} };
      }
      const malus = chooseMalus(state);
      if (malus) {
        return malus;
      }
      if (best && best.score > 0) {
        return { cardId: best.card.instanceId, action: 'play', options: {} };
      }

      const discard = [...me.hand].sort(
        (a, b) => keepValue(me.table, me.hand, a) - keepValue(me.table, me.hand, b) || rng() - 0.5,
      )[0];
      return { cardId: discard.instanceId, action: 'discard', options: { source: 'hand' } };
    },
  };
}
