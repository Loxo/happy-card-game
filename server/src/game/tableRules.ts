import type { CardDefinition, CardInstance } from '@happy-card-game/shared';
import { BASE_CARD_SET } from '@happy-card-game/shared';

const DEFINITIONS_BY_ID = new Map<string, CardDefinition>(
  BASE_CARD_SET.map((definition) => [definition.id, definition]),
);

/** Looks up a `CardDefinition` by `CardInstance.definitionId`. Throws on an unknown id — every `CardInstance` in play must reference a real definition. */
export function getDefinition(definitionId: string): CardDefinition {
  const definition = DEFINITIONS_BY_ID.get(definitionId);
  if (!definition) {
    throw new Error(`Unknown card definition id: ${definitionId}`);
  }
  return definition;
}

export type PlayRejectionReason = 'cap' | 'exclusion' | 'prerequisite';

export type PlayCheck = { ok: true } | { ok: false; reason: PlayRejectionReason };

/**
 * If `card.upgrades` names a category or id already present on
 * `playerTable`, returns that `CardInstance` — the old copy that would be
 * discarded and replaced (confirmed, not stacked). Returns `undefined` when
 * `card` doesn't upgrade anything currently on the table.
 *
 * Must run before `canPlayCard`, which needs this result to exclude the
 * upgrade target from its cap/exclusion checks.
 */
export function resolveUpgrade(
  playerTable: readonly CardInstance[],
  card: CardDefinition,
): CardInstance | undefined {
  if (!card.upgrades || card.upgrades.length === 0) {
    return undefined;
  }
  const upgrades = card.upgrades;
  return playerTable.find((instance) => {
    const definition = getDefinition(instance.definitionId);
    return upgrades.includes(definition.category) || upgrades.includes(definition.id);
  });
}

interface BypassSets {
  bypassCap: Set<string>;
  bypassExclusion: Set<string>;
}

/** Unions `bypassCap`/`bypassExclusion` across every card currently on `playerTable` (including a to-be-replaced upgrade target, while it's still physically there). */
function activeBypassSets(playerTable: readonly CardInstance[]): BypassSets {
  const bypassCap = new Set<string>();
  const bypassExclusion = new Set<string>();
  for (const instance of playerTable) {
    const definition = getDefinition(instance.definitionId);
    definition.bypassCap?.forEach((category) => bypassCap.add(category));
    definition.bypassExclusion?.forEach((category) => bypassExclusion.add(category));
  }
  return { bypassCap, bypassExclusion };
}

/**
 * The constraint checker every `'play'` action goes through before it's
 * accepted.
 *
 * `upgradeTarget` (from `resolveUpgrade`, which must run first) is excluded
 * from every cap/exclusion check below: `canPlayCard` evaluates the table
 * as it will be *after* the upgrade removal, not before. Without this, a
 * card upgrading another in the same capped category could never be played
 * — e.g. a senior role (`maxOnTable: 1` on `'job'`) replacing a junior one
 * would see its own target still occupying the category's only slot and
 * get rejected for a cap it is simultaneously freeing. This is the
 * deadlock the ordering fixes.
 *
 * The active bypass set, by contrast, is resolved from every card
 * currently on the table (including `upgradeTarget`, while it's still
 * physically there) — a card about to be replaced this turn can still
 * grant a bypass for this decision.
 */
export function canPlayCard(
  playerTable: readonly CardInstance[],
  card: CardDefinition,
  upgradeTarget?: CardInstance,
): PlayCheck {
  const { bypassCap, bypassExclusion } = activeBypassSets(playerTable);
  const effectiveTable = playerTable.filter((instance) => instance !== upgradeTarget);
  const categoriesOnTable = new Set(
    effectiveTable.map((instance) => getDefinition(instance.definitionId).category),
  );

  if (card.maxOnTable !== undefined && !bypassCap.has(card.category)) {
    const countInCategory = effectiveTable.filter(
      (instance) => getDefinition(instance.definitionId).category === card.category,
    ).length;
    if (countInCategory >= card.maxOnTable) {
      return { ok: false, reason: 'cap' };
    }
  }

  if (
    card.excludedBy &&
    card.excludedBy.length > 0 &&
    !bypassExclusion.has(card.category) &&
    card.excludedBy.some((category) => categoriesOnTable.has(category))
  ) {
    return { ok: false, reason: 'exclusion' };
  }

  if (card.requires?.some((category) => !categoriesOnTable.has(category))) {
    return { ok: false, reason: 'prerequisite' };
  }

  return { ok: true };
}
