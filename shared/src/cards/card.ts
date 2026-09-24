/**
 * Card model vocabulary.
 *
 * Every card belongs to a `category` and can optionally carry resources,
 * table constraints (cap/exclusion/prerequisite), an upgrade relationship,
 * a passive bypass effect, or an instant malus effect. Most cards only use
 * a few of these fields — they're all optional except `id`, `name`,
 * `category`, and `description`.
 *
 * The vocabulary is fixed here; per-card content (which categories exist,
 * exact caps, exact values) lives in `baseSet.ts` and can grow later
 * without touching this file or the engine that consumes it.
 */

/**
 * The resource kinds a card can contribute while on a player's table.
 * Extend this union (not the engine) to add a new resource. Keep
 * `RESOURCE_KINDS` in sync — it's the runtime list consumers iterate
 * instead of re-declaring their own copy that could drift.
 */
export type ResourceKind = 'happiness' | 'education' | 'money';

/** Every known `ResourceKind`, for iteration and runtime validation. */
export const RESOURCE_KINDS: readonly ResourceKind[] = ['happiness', 'education', 'money'];

/**
 * Instant, one-off malus effects. Resolved against a target player and then
 * the card is discarded — distinct from the passive `bypassExclusion` /
 * `bypassCap` fields on `CardDefinition`, which stay active while the card
 * remains on the table instead of firing once.
 */
export type CardEffectKind =
  | 'malus-skip-turn'
  | 'malus-force-discard'
  | 'malus-steal-card';

/** Every known `CardEffectKind`, for runtime validation of card content. */
export const CARD_EFFECT_KINDS: readonly CardEffectKind[] = [
  'malus-skip-turn',
  'malus-force-discard',
  'malus-steal-card',
];

export interface CardDefinition {
  id: string;
  /**
   * A plain string (`'job'`, `'relationship'`, `'flirt'`, `'bonus'`, ...) —
   * the axis every table-constraint check (cap / exclusion / prerequisite)
   * keys on.
   */
  category: string;
  /** Resources this card contributes while it sits on the table. */
  resources?: Partial<Record<ResourceKind, number>>;
  /**
   * The cap on simultaneous cards of this card's `category` on one player's
   * table (e.g. `'job'` -> 1, `'flirt'` -> 5). `undefined` means unlimited.
   */
  maxOnTable?: number;
  /**
   * Categories that must be present on the player's own table for this
   * card to be playable.
   */
  requires?: string[];
  /**
   * Categories that must be absent from the player's own table for this
   * card to be playable.
   */
  excludedBy?: string[];
  /**
   * Categories or ids this card replaces on the table when played. The
   * replaced card is discarded and its resources stop counting — an
   * upgrade replaces entirely, it never stacks with what it replaces.
   */
  upgrades?: string[];
  /**
   * While this card remains active on the player's table, the named
   * categories' `excludedBy` checks are ignored for that player (e.g.
   * "infidelity lets you play flirts despite married").
   */
  bypassExclusion?: string[];
  /**
   * While this card remains active on the player's table, the named
   * categories' `maxOnTable` checks are ignored for that player (e.g.
   * "a bonus overrides the flirt cap of 5").
   */
  bypassCap?: string[];
  /** An instant malus effect, resolved against a target then discarded. */
  effect?: CardEffectKind;
}

/**
 * A specific physical copy of a `CardDefinition` as it sits in a deck,
 * hand, or table. Distinct from `CardDefinition` because the same
 * definition can have several copies in play at once (or the same category
 * can be shared by several definitions), and every hand/table slot needs a
 * stable identity of its own so actions can target one exact card.
 */
export interface CardInstance {
  /** Unique per physical copy — this is what protocol actions target. */
  instanceId: string;
  /**
   * References `CardDefinition.id`. Named distinctly from `instanceId`
   * (not `cardId`) so it can never be confused with
   * `TakeTurnActionMessage.cardId`, which targets an `instanceId`.
   */
  definitionId: string;
}
