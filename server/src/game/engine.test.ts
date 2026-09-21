import { describe, expect, it } from 'vitest';
import type { CardInstance } from '@happy-card-game/shared';
import { BASE_CARD_SET } from '@happy-card-game/shared';
import { buildDeck, drawCard, shuffle } from './deck.js';
import { canPlayCard, resolveUpgrade } from './tableRules.js';
import { computeResources } from './scoring.js';
import { GameEngine } from './engine.js';
import { getPlayerState } from './state.js';

/** Builds a `CardInstance` for a known `BASE_CARD_SET` definition id. `instanceId` defaults to the definition id, which is fine for tests that never place two copies of the same definition on one table/hand. */
function card(definitionId: string, instanceId = definitionId): CardInstance {
  return { instanceId, definitionId };
}

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

describe('deck', () => {
  it('buildDeck produces multiple instances per definition, enough for a 4-player deal', () => {
    const deck = buildDeck(BASE_CARD_SET, () => 0);
    // Every definition must appear more than once (a single copy each
    // can't even deal the opening hands for 3-4 players), and the total
    // must clear MAX_PLAYERS(4) * STARTING_HAND_SIZE(5) = 20 with room to
    // spare for actual play afterward.
    expect(deck.length).toBeGreaterThan(BASE_CARD_SET.length);
    expect(deck.length).toBeGreaterThanOrEqual(30);
    const counts = new Map<string, number>();
    for (const instance of deck) {
      counts.set(instance.definitionId, (counts.get(instance.definitionId) ?? 0) + 1);
    }
    expect(counts.size).toBe(BASE_CARD_SET.length);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(1);
    }
    // Every instanceId is unique even across duplicate definitions.
    expect(new Set(deck.map((c) => c.instanceId)).size).toBe(deck.length);
  });

  it('shuffle never mutates its input and returns every item', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original, () => 0.9);
    expect(original).toEqual([1, 2, 3, 4, 5]);
    expect(result.sort()).toEqual(original.sort());
  });

  it('draws from the top of the deck normally', () => {
    const deck = [card('a'), card('b')];
    const discard: CardInstance[] = [];
    const drawn = drawCard(deck, discard);
    expect(drawn.definitionId).toBe('b');
    expect(deck).toHaveLength(1);
  });

  it('reshuffles the discard pile into the deck and succeeds when the deck is empty (acceptance criteria row 1)', () => {
    const deck: CardInstance[] = [];
    const discard: CardInstance[] = [card('x'), card('y')];
    const drawn = drawCard(deck, discard);

    expect(['x', 'y']).toContain(drawn.definitionId);
    expect(discard).toHaveLength(0); // fully moved into the deck
    expect(deck).toHaveLength(1); // one of the two was drawn immediately
  });

  it('throws only when both the deck and the discard pile are exhausted', () => {
    expect(() => drawCard([], [])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Table rules
// ---------------------------------------------------------------------------

function definitionOf(id: string) {
  const def = BASE_CARD_SET.find((d) => d.id === id);
  if (!def) throw new Error(`fixture bug: unknown definition ${id}`);
  return def;
}

describe('tableRules', () => {
  it('canPlayCard rejects a capped category with no active bypass (job maxOnTable: 1)', () => {
    const table = [card('job-waiter')];
    const result = canPlayCard(table, definitionOf('job-engineer'));
    expect(result).toEqual({ ok: false, reason: 'cap' });
  });

  it('canPlayCard accepts a capped category once a matching bypassCap card is active', () => {
    // Flirt cap is 5; simulate 5 already on the table (duplicated
    // definitionIds are fine — canPlayCard only cares about category, this
    // is a pure-function test, not a real dealt table).
    const table = [
      card('flirt-crush', 'f1'),
      card('flirt-date', 'f2'),
      card('flirt-kiss', 'f3'),
      card('flirt-crush', 'f4'),
      card('flirt-date', 'f5'),
    ];
    const withoutBypass = canPlayCard(table, definitionOf('flirt-kiss'));
    expect(withoutBypass).toEqual({ ok: false, reason: 'cap' });

    const withBypass = canPlayCard([...table, card('bonus-social-butterfly')], definitionOf('flirt-kiss'));
    expect(withBypass).toEqual({ ok: true });
  });

  it('canPlayCard rejects an excluded category with no active bypass', () => {
    const table = [card('relationship-marriage')];
    const result = canPlayCard(table, definitionOf('flirt-crush'));
    expect(result).toEqual({ ok: false, reason: 'exclusion' });
  });

  it('canPlayCard accepts the same excluded play once a bypassExclusion card is active', () => {
    const table = [card('relationship-marriage'), card('bonus-infidelity')];
    const result = canPlayCard(table, definitionOf('flirt-crush'));
    expect(result).toEqual({ ok: true });
  });

  it('canPlayCard rejects a missing prerequisite, accepts once it is present', () => {
    expect(canPlayCard([], definitionOf('child-baby'))).toEqual({
      ok: false,
      reason: 'prerequisite',
    });
    expect(canPlayCard([card('relationship-marriage')], definitionOf('child-baby'))).toEqual({
      ok: true,
    });
  });

  it('resolveUpgrade finds the old card an upgrade replaces', () => {
    const engineer = card('job-engineer');
    const target = resolveUpgrade([engineer], definitionOf('job-senior-engineer'));
    expect(target).toBe(engineer);
  });

  it('resolveUpgrade-then-canPlayCard lets an upgrade through a cap its own target occupies (the deadlock fix)', () => {
    const engineer = card('job-engineer');
    const table = [engineer];
    const seniorDef = definitionOf('job-senior-engineer');

    const upgradeTarget = resolveUpgrade(table, seniorDef);
    expect(upgradeTarget).toBe(engineer);

    // With the target excluded, the freed cap slot makes the play legal.
    expect(canPlayCard(table, seniorDef, upgradeTarget)).toEqual({ ok: true });

    // Without excluding it, the same cap would (wrongly) block it — this is
    // exactly the deadlock the ordering fix resolves.
    expect(canPlayCard(table, seniorDef)).toEqual({ ok: false, reason: 'cap' });
  });
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

describe('scoring', () => {
  it('computeResources sums every resource kind across the table', () => {
    const table = [card('job-engineer'), card('relationship-marriage'), card('education-degree')];
    expect(computeResources(table)).toEqual({ money: 2, education: 4, happiness: 2 });
  });

  it('computeResources is live: a table discard or upgrade-replacement changes the next call (acceptance criteria row 3)', () => {
    const table = [card('job-engineer'), card('education-degree')];
    expect(computeResources(table)).toEqual({ money: 2, education: 4, happiness: 0 });

    table.splice(0, 1); // simulate a table discard removing job-engineer
    expect(computeResources(table)).toEqual({ money: 0, education: 3, happiness: 0 });

    table.splice(0, 1, card('job-senior-engineer')); // simulate an upgrade replacement
    expect(computeResources(table)).toEqual({ money: 4, education: 2, happiness: 0 });
  });

  it('computeResources returns all-zero for an empty table', () => {
    expect(computeResources([])).toEqual({ money: 0, education: 0, happiness: 0 });
  });
});

// ---------------------------------------------------------------------------
// Engine — turn cycle
// ---------------------------------------------------------------------------

/** Deterministic engine: shuffle/draw order is fixed so tests aren't flaky, though most tests overwrite hands/tables directly for full control anyway. */
function makeEngine(): GameEngine {
  return new GameEngine({ rng: () => 0.42 });
}

function player(engine: GameEngine, playerId: string) {
  const p = getPlayerState(engine.state, playerId);
  if (!p) throw new Error(`test bug: no player ${playerId}`);
  return p;
}

describe('GameEngine', () => {
  it('startGame deals a 5-card hand and empty table to every player, sets round count', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);

    for (const playerId of ['p1', 'p2']) {
      const p = player(engine, playerId);
      expect(p.hand).toHaveLength(5);
      expect(p.table).toHaveLength(0);
    }
    expect(engine.state.roundsRemaining).toBeGreaterThan(0);
    expect(engine.state.deck).toHaveLength(buildDeck().length - 10);
  });

  it('startGame deals 5 cards to every seat for the full 2-4 player range without throwing (regression: the deck used to have too few copies for 3-4 players)', () => {
    for (const playerIds of [
      ['p1', 'p2'],
      ['p1', 'p2', 'p3'],
      ['p1', 'p2', 'p3', 'p4'],
    ]) {
      const engine = makeEngine();
      expect(() => engine.startGame(playerIds)).not.toThrow();
      for (const playerId of playerIds) {
        expect(player(engine, playerId).hand).toHaveLength(5);
      }
    }
  });

  it('startTurn auto-draws 1 card for the active player, growing their hand to 6', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);

    engine.startTurn();

    expect(player(engine, 'p1').hand).toHaveLength(6);
    expect(player(engine, 'p2').hand).toHaveLength(5); // untouched, not their turn
  });

  it('happy path: playing an unconstrained card adds it to the table, updates live resources, and leaves the hand at 5', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn(); // p1's hand -> 6
    const p1 = player(engine, 'p1');
    p1.hand = [card('job-waiter')];
    p1.table = [];

    const result = engine.takeTurnAction('p1', 'job-waiter', 'play');

    expect(result).toEqual({ ok: true });
    expect(p1.table.map((c) => c.definitionId)).toEqual(['job-waiter']);
    expect(p1.hand).toHaveLength(0); // this test isolated the hand to exactly the played card
    expect(computeResources(p1.table)).toEqual({ money: 1, education: 0, happiness: 0 });
    // Turn advanced to p2, who was auto-drawn for their turn start.
    expect(engine.state.turnOrder[engine.state.turnIndex]).toBe('p2');
  });

  it('upgrade replacement: the old card is discarded and only the new card contributes resources', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.table = [card('job-engineer')];
    p1.hand = [card('job-senior-engineer')];

    const result = engine.takeTurnAction('p1', 'job-senior-engineer', 'play');

    expect(result).toEqual({ ok: true });
    expect(p1.table.map((c) => c.definitionId)).toEqual(['job-senior-engineer']);
    expect(computeResources(p1.table)).toEqual({ money: 4, education: 2, happiness: 0 });
    expect(engine.state.discardPile.map((c) => c.definitionId)).toContain('job-engineer');
  });

  it('leaves the acting player at exactly 5 cards after play, discard-from-hand, or a non-stealing malus (acceptance criteria row 4)', () => {
    const rigHand = () => [
      card('job-waiter'),
      card('education-degree'),
      card('flirt-crush'),
      card('flirt-date'),
      card('flirt-kiss'),
      // malus-force-discard, not malus-skip-turn: in a 2-player game,
      // skipping the only opponent hands the turn straight back to the
      // actor with a fresh auto-draw — a real mechanic (see the dedicated
      // skip-turn test below), just not what this test is isolating.
      card('malus-layoff'),
    ];

    const playEngine = makeEngine();
    playEngine.startGame(['p1', 'p2']);
    playEngine.startTurn();
    const playP1 = player(playEngine, 'p1');
    playP1.hand = rigHand();
    playP1.table = [];
    playEngine.takeTurnAction('p1', 'job-waiter', 'play');
    expect(playP1.hand).toHaveLength(5);

    const discardEngine = makeEngine();
    discardEngine.startGame(['p1', 'p2']);
    discardEngine.startTurn();
    const discardP1 = player(discardEngine, 'p1');
    discardP1.hand = rigHand();
    discardEngine.takeTurnAction('p1', 'job-waiter', 'discard');
    expect(discardP1.hand).toHaveLength(5);

    const malusEngine = makeEngine();
    malusEngine.startGame(['p1', 'p2']);
    malusEngine.startTurn();
    const malusP1 = player(malusEngine, 'p1');
    malusP1.hand = rigHand();
    malusEngine.takeTurnAction('p1', 'malus-layoff', 'malus', { targetPlayerId: 'p2' });
    expect(malusP1.hand).toHaveLength(5);
  });

  it('malus-steal-card is the one documented exception: gaining a card is the effect itself, so the actor ends at 6', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    const p2 = player(engine, 'p2');
    p1.hand = [card('job-waiter'), card('education-degree'), card('flirt-crush'), card('flirt-date'), card('flirt-kiss'), card('malus-thief')];
    p2.hand = [card('education-degree', 'p2-degree')];

    const result = engine.takeTurnAction('p1', 'malus-thief', 'malus', { targetPlayerId: 'p2' });

    expect(result).toEqual({ ok: true });
    expect(p1.hand).toHaveLength(6); // 5 (post-malus) + 1 stolen
    expect(p1.hand.map((c) => c.instanceId)).toContain('p2-degree');
    // Turn advances to p2 next, who is genuinely auto-drawn for their own
    // turn start — their hand was emptied by the steal, then grows to 1.
    expect(p2.hand).toHaveLength(1);
  });

  it('a self-targeted malus does not corrupt hand/discard (regression: card indices used to shift when the target was the actor)', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.hand = [card('job-waiter'), card('education-degree'), card('flirt-crush'), card('malus-thief')];

    const result = engine.takeTurnAction('p1', 'malus-thief', 'malus', { targetPlayerId: 'p1' });

    expect(result).toEqual({ ok: true });
    // Stealing from yourself: the malus card leaves, hand[0] (job-waiter) is
    // "stolen" back onto the end — net size unchanged, nothing duplicated
    // or destroyed, and the malus card is discarded exactly once.
    expect(p1.hand.map((c) => c.definitionId).sort()).toEqual(
      ['education-degree', 'flirt-crush', 'job-waiter'].sort(),
    );
    expect(engine.state.discardPile.filter((c) => c.definitionId === 'malus-thief')).toHaveLength(1);
  });

  it('table-discard is a combo: the table card and a named hand card are both discarded, hand still nets to 5', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.table = [card('job-waiter')];
    p1.hand = [card('education-degree'), card('flirt-crush'), card('flirt-date'), card('flirt-kiss'), card('malus-layoff'), card('bonus-social-butterfly')];

    const result = engine.takeTurnAction('p1', 'job-waiter', 'discard', {
      source: 'table',
      handCardId: 'education-degree',
    });

    expect(result).toEqual({ ok: true });
    expect(p1.table).toHaveLength(0);
    expect(computeResources(p1.table)).toEqual({ money: 0, education: 0, happiness: 0 });
    expect(engine.state.discardPile.map((c) => c.definitionId)).toEqual(
      expect.arrayContaining(['job-waiter', 'education-degree']),
    );
    expect(p1.hand.map((c) => c.definitionId)).not.toContain('education-degree');
    expect(p1.hand).toHaveLength(5);
  });

  it('rejects a table-discard with no handCardId, or one not in hand, and changes no state', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.table = [card('job-waiter')];
    const tableBefore = [...p1.table];
    const handBefore = [...p1.hand];

    const missing = engine.takeTurnAction('p1', 'job-waiter', 'discard', { source: 'table' });
    expect(missing).toEqual({ ok: false, reason: 'missing-hand-card' });

    const invalid = engine.takeTurnAction('p1', 'job-waiter', 'discard', {
      source: 'table',
      handCardId: 'not-in-hand',
    });
    expect(invalid).toEqual({ ok: false, reason: 'missing-hand-card' });

    expect(p1.table).toEqual(tableBefore);
    expect(p1.hand).toEqual(handBefore);
  });

  it('malus happy path: resolves the effect against the target and discards the malus card', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    const p2 = player(engine, 'p2');
    p1.hand = [card('malus-layoff')]; // malus-force-discard
    p2.hand = [card('education-degree')];

    const result = engine.takeTurnAction('p1', 'malus-layoff', 'malus', { targetPlayerId: 'p2' });

    expect(result).toEqual({ ok: true });
    expect(engine.state.discardPile.map((c) => c.definitionId).sort()).toEqual(
      ['education-degree', 'malus-layoff'].sort(),
    );
    // Turn advances to p2, who is auto-drawn for their own turn start —
    // their hand ends at 1 (their forced discard emptied it first).
    expect(p2.hand).toHaveLength(1);
    expect(p1.hand).toHaveLength(0); // the malus card itself is gone from p1's hand
  });

  it('malus-skip-turn actually skips the target player their next turn', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.hand = [card('malus-rival')]; // malus-skip-turn

    engine.takeTurnAction('p1', 'malus-rival', 'malus', { targetPlayerId: 'p2' });

    // p2 was skipped straight through, back to p1.
    expect(engine.state.turnOrder[engine.state.turnIndex]).toBe('p1');
  });

  it('malus-steal-card moves a card from the target to the acting player', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    const p2 = player(engine, 'p2');
    p1.hand = [card('malus-thief')];
    p2.hand = [card('education-degree')];

    engine.takeTurnAction('p1', 'malus-thief', 'malus', { targetPlayerId: 'p2' });

    // p2's hand was emptied by the steal, then auto-drawn to 1 for their turn.
    expect(p2.hand).toHaveLength(1);
    expect(p1.hand.map((c) => c.definitionId)).toContain('education-degree');
  });

  // -- Rejections ------------------------------------------------------------

  it('rejects a play out of turn and changes no state (acceptance criteria row 5)', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p2 = player(engine, 'p2');
    const handBefore = [...p2.hand];

    const result = engine.takeTurnAction('p2', p2.hand[0]?.instanceId ?? 'whatever', 'play');

    expect(result).toEqual({ ok: false, reason: 'wrong-turn' });
    expect(p2.hand).toEqual(handBefore);
  });

  it('rejects a reference to a card not in hand/table and changes no state', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    const handBefore = [...p1.hand];

    const result = engine.takeTurnAction('p1', 'not-a-real-card', 'play');

    expect(result).toEqual({ ok: false, reason: 'unknown-card' });
    expect(p1.hand).toEqual(handBefore);
  });

  it('rejects a capped play with the specific reason and no state change', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.table = [card('job-waiter')];
    p1.hand = [card('job-engineer')];
    const tableBefore = [...p1.table];
    const handBefore = [...p1.hand];

    const result = engine.takeTurnAction('p1', 'job-engineer', 'play');

    expect(result).toEqual({ ok: false, reason: 'cap' });
    expect(p1.table).toEqual(tableBefore);
    expect(p1.hand).toEqual(handBefore);
  });

  it('rejects an excluded play with no bypass, and accepts it once a bypass card is active', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.table = [card('relationship-marriage')];
    p1.hand = [card('flirt-crush')];

    const rejected = engine.takeTurnAction('p1', 'flirt-crush', 'play');
    expect(rejected).toEqual({ ok: false, reason: 'exclusion' });
    expect(p1.table.map((c) => c.definitionId)).toEqual(['relationship-marriage']); // unchanged

    p1.table.push(card('bonus-infidelity'));
    const accepted = engine.takeTurnAction('p1', 'flirt-crush', 'play');
    expect(accepted).toEqual({ ok: true });
    expect(p1.table.map((c) => c.definitionId)).toContain('flirt-crush');
  });

  it('rejects a play missing its prerequisite category', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.table = [];
    p1.hand = [card('child-baby')];

    const result = engine.takeTurnAction('p1', 'child-baby', 'play');

    expect(result).toEqual({ ok: false, reason: 'prerequisite' });
  });

  it('rejects a malus action with no targetPlayerId', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.hand = [card('malus-layoff')];

    const result = engine.takeTurnAction('p1', 'malus-layoff', 'malus');

    expect(result).toEqual({ ok: false, reason: 'missing-target' });
    expect(p1.hand).toHaveLength(1); // untouched
  });

  it('rejects a malus action against an unknown target, and one on a card with no effect (distinct reasons)', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    p1.hand = [card('malus-layoff'), card('job-waiter')];

    expect(
      engine.takeTurnAction('p1', 'malus-layoff', 'malus', { targetPlayerId: 'not-a-player' }),
    ).toEqual({ ok: false, reason: 'missing-target' });

    // job-waiter has no `effect` — the wrong reason here would be
    // 'missing-target' (a valid target was given); it's the card that's
    // invalid for this action, so it gets its own reason.
    expect(engine.takeTurnAction('p1', 'job-waiter', 'malus', { targetPlayerId: 'p2' })).toEqual({
      ok: false,
      reason: 'not-a-malus-card',
    });
  });

  // -- Played-cards row --------------------------------------------------

  it('the completed round\'s full played-cards row survives at least one broadcast before the next round clears it (regression: it used to be wiped in the same call that produced it)', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    const p2 = player(engine, 'p2');
    p1.hand = [card('job-waiter')];
    p2.hand = [card('education-degree')];
    p1.table = [];
    p2.table = [];

    engine.takeTurnAction('p1', 'job-waiter', 'play');
    expect(engine.state.playedCards.map((entry) => entry.playerId)).toEqual(['p1']);

    // p2's action wraps the turn order back to p1 (round complete). The row
    // from THIS action — both p1's and p2's plays — must still be there
    // immediately after, not already cleared.
    engine.takeTurnAction('p2', 'education-degree', 'play');
    expect(new Set(engine.state.playedCards.map((entry) => entry.playerId))).toEqual(
      new Set(['p1', 'p2']),
    );

    // Only the *next* recorded action (the new round) clears it.
    const p1Round2 = player(engine, 'p1');
    p1Round2.hand = [card('flirt-crush')];
    engine.takeTurnAction('p1', 'flirt-crush', 'play');
    expect(engine.state.playedCards.map((entry) => entry.playerId)).toEqual(['p1']);
  });

  // -- End conditions ----------------------------------------------------

  it('ends the game once roundsRemaining hits 0, ranking players by happiness', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    engine.state.roundsRemaining = 1;
    const p1 = player(engine, 'p1');
    const p2 = player(engine, 'p2');
    p1.table = [card('relationship-marriage')]; // happiness 2
    p2.table = [card('flirt-crush')]; // happiness 1
    p1.hand = [card('education-degree')];
    p2.hand = [card('job-waiter')];

    // p1's turn (wraps nothing yet), then p2's turn completes the round.
    expect(engine.takeTurnAction('p1', 'education-degree', 'discard')).toEqual({ ok: true });
    expect(engine.state.finished).toBe(false);
    expect(engine.takeTurnAction('p2', 'job-waiter', 'discard')).toEqual({ ok: true });

    expect(engine.state.finished).toBe(true);
    expect(engine.state.result).toBeDefined();
    expect(engine.state.result?.rankings).toEqual([
      { playerId: 'p1', happiness: 2 },
      { playerId: 'p2', happiness: 1 },
    ]);
  });

  it('ends the game immediately once the deck and discard pile are empty and every hand is empty, even mid-round', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    const p1 = player(engine, 'p1');
    const p2 = player(engine, 'p2');
    engine.state.deck = [];
    engine.state.discardPile = [];
    // A plain 'play' (not 'discard'/an upgrade) moves the card onto the
    // table, not into the discard pile — keeping it empty so the
    // "nothing left anywhere" condition is genuinely met after this action.
    p1.hand = [card('job-waiter')];
    p1.table = [];
    p2.hand = []; // already empty

    const result = engine.takeTurnAction('p1', 'job-waiter', 'play');

    expect(result).toEqual({ ok: true });
    expect(engine.state.finished).toBe(true); // fired without waiting for a full round wrap
  });

  it('rejects any further action once the game has finished', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();
    engine.state.finished = true;

    const result = engine.takeTurnAction('p1', 'whatever', 'discard');

    expect(result).toEqual({ ok: false, reason: 'game-over' });
  });

  it('toGameStateMessage never leaks an opponent hand, only its count', () => {
    const engine = makeEngine();
    engine.startGame(['p1', 'p2']);
    engine.startTurn();

    const view = engine.toGameStateMessage('p2');

    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]?.playerId).toBe('p1');
    expect(view.opponents[0]?.handCount).toBe(6);
    expect((view.opponents[0] as { hand?: unknown }).hand).toBeUndefined();
    expect(view.hand).toHaveLength(5);
  });
});
