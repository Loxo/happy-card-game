import { describe, expect, it } from 'vitest';
import type { CardInstance } from '@happy-card-game/shared';
import { createBot, HUMAN_MALUS_COOLDOWN_ROUNDS, MALUS_MIN_ROUND } from './bot.js';
import { GameEngine } from './engine.js';
import { createPlayerState, type GameState } from './state.js';

let counter = 0;
function card(definitionId: string): CardInstance {
  counter += 1;
  return { instanceId: `c${counter}`, definitionId };
}

/** Seeded LCG so simulations are reproducible. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface Seat {
  hand?: string[];
  table?: string[];
}

/** Builds a GameState where `bot` is up; `human` is the other seat. */
function makeState(bot: Seat, human: Seat, roundNumber = 5): GameState {
  const botState = createPlayerState('bot-1');
  botState.hand = (bot.hand ?? []).map(card);
  botState.table = (bot.table ?? []).map(card);
  const humanState = createPlayerState('human');
  humanState.hand = (human.hand ?? ['flirt-kiss']).map(card);
  humanState.table = (human.table ?? []).map(card);
  return {
    players: [botState, humanState],
    turnOrder: ['bot-1', 'human'],
    turnIndex: 0,
    deck: [],
    discardPile: [],
    playedCards: [],
    roundNumber,
    playedCardsRound: roundNumber,
    roundsRemaining: 10,
    finished: false,
    result: undefined,
  };
}

const isBot = (id: string) => id.startsWith('bot');
const newBot = (seed = 1) => createBot('bot-1', { isBot, rng: seeded(seed) });

function definitionOf(state: GameState, cardId: string): string | undefined {
  return state.players.flatMap((p) => p.hand).find((c) => c.instanceId === cardId)?.definitionId;
}

describe('bot strategy', () => {
  it('plays the highest-happiness legal card', () => {
    const state = makeState({ hand: ['job-waiter', 'relationship-marriage', 'flirt-kiss'] }, {});
    const action = newBot().chooseAction(state);
    expect(action?.action).toBe('play');
    expect(definitionOf(state, action!.cardId)).toBe('relationship-marriage');
  });

  it('plays a baby once a marriage is on the table', () => {
    const state = makeState({ hand: ['child-baby', 'job-waiter'], table: ['relationship-marriage'] }, {});
    const action = newBot().chooseAction(state);
    expect(definitionOf(state, action!.cardId)).toBe('child-baby');
  });

  it('prefers a play that unlocks happiness in hand over an equal-delta play', () => {
    // social-butterfly gains 0 itself but unlocks nothing here; a baby-enabling marriage beats a flirt.
    const state = makeState({ hand: ['flirt-crush', 'relationship-marriage', 'child-baby'] }, {});
    const action = newBot().chooseAction(state);
    expect(definitionOf(state, action!.cardId)).toBe('relationship-marriage');
  });

  it('never plays a malus card to the table, and discards a blocked card instead of stalling', () => {
    const state = makeState(
      { hand: ['flirt-kiss', 'malus-rival'], table: ['relationship-marriage'] },
      {},
      1,
    );
    const action = newBot().chooseAction(state);
    expect(action?.action).toBe('discard');
    expect(definitionOf(state, action!.cardId)).toBe('flirt-kiss');
  });

  it('returns undefined with an empty hand', () => {
    expect(newBot().chooseAction(makeState({ hand: [] }, {}))).toBeUndefined();
  });
});

describe('bot malus restraint', () => {
  const leader = { table: ['relationship-marriage', 'child-baby'] }; // 4 happiness
  const blockedHand = ['flirt-kiss', 'malus-thief']; // flirt blocked by the bot's own marriage below

  it('uses malus on a clear leader when it has nothing useful to play', () => {
    const state = makeState({ hand: blockedHand, table: ['relationship-marriage'] }, leader, MALUS_MIN_ROUND);
    const action = newBot().chooseAction(state);
    expect(action?.action).toBe('malus');
    expect(action?.options.targetPlayerId).toBe('human');
  });

  it('holds off in the first rounds', () => {
    const state = makeState({ hand: blockedHand, table: ['relationship-marriage'] }, leader, MALUS_MIN_ROUND - 1);
    expect(newBot().chooseAction(state)?.action).toBe('discard');
  });

  it('never skips a human turn', () => {
    const state = makeState({ hand: ['flirt-kiss', 'malus-rival'], table: ['relationship-marriage'] }, leader);
    expect(newBot().chooseAction(state)?.action).toBe('discard');
  });

  it('does not target a human who is not clearly ahead', () => {
    const state = makeState(
      { hand: blockedHand, table: ['relationship-marriage'] },
      { table: ['relationship-marriage'] },
    );
    expect(newBot().chooseAction(state)?.action).toBe('discard');
  });

  it('prefers a happiness-gaining play over a malus', () => {
    const state = makeState({ hand: ['flirt-kiss', 'malus-thief'] }, leader);
    expect(newBot().chooseAction(state)?.action).toBe('play');
  });

  it('applies a per-human cooldown between hits', () => {
    const bot = newBot();
    const first = makeState({ hand: blockedHand, table: ['relationship-marriage'] }, leader, 5);
    expect(bot.chooseAction(first)?.action).toBe('malus');

    const tooSoon = makeState({ hand: blockedHand, table: ['relationship-marriage'] }, leader, 5 + HUMAN_MALUS_COOLDOWN_ROUNDS - 1);
    expect(bot.chooseAction(tooSoon)?.action).toBe('discard');

    const later = makeState({ hand: blockedHand, table: ['relationship-marriage'] }, leader, 5 + HUMAN_MALUS_COOLDOWN_ROUNDS);
    expect(bot.chooseAction(later)?.action).toBe('malus');
  });
});

describe('bot vs engine simulation', () => {
  it('always proposes moves the engine accepts, and rarely hits the human', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const rng = seeded(seed);
      const engine = new GameEngine({ rng, botIds: new Set(['bot-1', 'bot-2']) });
      engine.startGame(['human', 'bot-1', 'bot-2']);
      engine.startTurn();
      const bots = new Map(
        ['bot-1', 'bot-2'].map((id) => [id, createBot(id, { isBot, rng })] as const),
      );
      let humanHits = 0;
      let safety = 200;

      while (!engine.state.finished && safety-- > 0) {
        const current = engine.state.turnOrder[engine.state.turnIndex];
        const me = engine.state.players.find((p) => p.playerId === current)!;
        if (current === 'human') {
          const played = engine.takeTurnAction('human', me.hand[0].instanceId, 'discard', { source: 'hand' });
          expect(played.ok).toBe(true);
          continue;
        }
        const action = bots.get(current)!.chooseAction(engine.state);
        expect(action).toBeDefined();
        if (action!.action === 'malus' && action!.options.targetPlayerId === 'human') {
          humanHits += 1;
        }
        const result = engine.takeTurnAction(current, action!.cardId, action!.action, action!.options);
        expect(result).toEqual({ ok: true });
      }

      expect(engine.state.finished).toBe(true);
      // 10 rounds, 2 bots, 3-round cooldown each: at most 2 * ceil(8/3) hits.
      expect(humanHits).toBeLessThanOrEqual(6);
    }
  });
});
