import { BASE_CARD_SET, type CardDefinition, type CardInstance } from '@happy-card-game/shared';

/**
 * Client-side mirror of `server/src/game/tableRules.ts` — a deliberate UX
 * shortcut (per phase 6's plan) so the hand can disable an illegal play
 * with a reason before any round-trip. The server's copy stays the only
 * source of truth; this one only ever gates what the UI offers.
 */

const DEFINITIONS_BY_ID = new Map<string, CardDefinition>(
  BASE_CARD_SET.map((definition) => [definition.id, definition]),
);

export function getDefinition(definitionId: string): CardDefinition {
  const definition = DEFINITIONS_BY_ID.get(definitionId);
  if (!definition) {
    throw new Error(`Unknown card definition id: ${definitionId}`);
  }
  return definition;
}

export type PlayRejectionReason = 'cap' | 'exclusion' | 'prerequisite';
export type PlayCheck = { ok: true } | { ok: false; reason: PlayRejectionReason };

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

/** Whether `category` is currently at its cap on `playerTable` (bypass-aware) — drives the tableau's "at cap" marker. */
export function categoryAtCap(playerTable: readonly CardInstance[], category: string): boolean {
  const { bypassCap } = activeBypassSets(playerTable);
  if (bypassCap.has(category)) {
    return false;
  }
  const definitionsInCategory = playerTable
    .map((instance) => getDefinition(instance.definitionId))
    .filter((definition) => definition.category === category);
  const cap = definitionsInCategory.find((definition) => definition.maxOnTable !== undefined)
    ?.maxOnTable;
  return cap !== undefined && definitionsInCategory.length >= cap;
}
