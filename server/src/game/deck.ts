import { randomUUID } from 'node:crypto';
import type { CardDefinition, CardInstance } from '@happy-card-game/shared';
import { BASE_CARD_SET } from '@happy-card-game/shared';

/**
 * Fisher-Yates shuffle. Never mutates `items` — returns a new array. `rng`
 * is injectable so tests can force a deterministic order.
 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Physical copies built per `CardDefinition`. A single copy each (14 cards
 * in the seed set) can't even deal the opening hands for a 3- or 4-player
 * game (needs 15/20 cards before anyone draws again) — this must exceed
 * `MAX_PLAYERS * STARTING_HAND_SIZE` with real headroom for play afterward.
 */
const COPIES_PER_DEFINITION = 3;

/**
 * Builds `COPIES_PER_DEFINITION` `CardInstance`s per `CardDefinition` in
 * `cardSet` (default `BASE_CARD_SET`) and returns them shuffled. The set
 * can hold any number of definitions; per-table caps (`maxOnTable`) already
 * limit how many of one category a single player can hold, so duplicating
 * copies in the shared deck doesn't fight that rule.
 */
export function buildDeck(
  cardSet: readonly CardDefinition[] = BASE_CARD_SET,
  rng: () => number = Math.random,
): CardInstance[] {
  const instances: CardInstance[] = cardSet.flatMap((definition) =>
    Array.from({ length: COPIES_PER_DEFINITION }, () => ({
      instanceId: randomUUID(),
      definitionId: definition.id,
    })),
  );
  return shuffle(instances, rng);
}

/**
 * Draws the top card of `deck`, mutating it in place (removing the drawn
 * card). When `deck` is empty, first reshuffles `discardPile` into it
 * (mutating `discardPile` down to empty) instead of failing — the discard
 * pile is the deck's only refill source.
 *
 * Throws only when both `deck` and `discardPile` are exhausted: nothing
 * left anywhere to draw.
 */
export function drawCard(
  deck: CardInstance[],
  discardPile: CardInstance[],
  rng: () => number = Math.random,
): CardInstance {
  if (deck.length === 0) {
    if (discardPile.length === 0) {
      throw new Error('Cannot draw: deck and discard pile are both empty');
    }
    deck.push(...shuffle(discardPile, rng));
    discardPile.length = 0;
  }
  // Non-null: the branch above guarantees `deck.length > 0` here.
  return deck.pop()!;
}
