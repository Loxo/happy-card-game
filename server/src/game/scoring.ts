import { RESOURCE_KINDS, type CardInstance, type ResourceKind } from '@happy-card-game/shared';
import { getDefinition } from './tableRules.js';

/**
 * Sums every `ResourceKind` across `playerTable`. Always derived live from
 * the current table — call this fresh after every play, upgrade
 * replacement, or table discard, never cache the result, since a removed
 * card's contribution must be able to disappear on the very next call.
 */
export function computeResources(playerTable: readonly CardInstance[]): Record<ResourceKind, number> {
  const totals = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, 0])) as Record<
    ResourceKind,
    number
  >;
  for (const instance of playerTable) {
    const definition = getDefinition(instance.definitionId);
    if (!definition.resources) {
      continue;
    }
    for (const kind of RESOURCE_KINDS) {
      const value = definition.resources[kind];
      if (value) {
        totals[kind] += value;
      }
    }
  }
  return totals;
}
