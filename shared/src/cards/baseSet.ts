import type { CardDefinition } from './card.js';

/**
 * Seed content for the deck — a starter mix across a few categories, not
 * the final card list. It exists so phase 4's engine (table rules, caps,
 * exclusions, upgrades, bypass effects) has real cases to validate against:
 *
 * - a capped category: `'job'` (1), `'flirt'` (5), `'child'` (3)
 * - an exclusion pair: `'flirt'` is `excludedBy` `'relationship'`
 * - an upgrade pair: `job-senior-engineer` `upgrades` `job-engineer`
 * - bypass cards: `bonus-infidelity` (`bypassExclusion`),
 *   `bonus-social-butterfly` (`bypassCap`)
 *
 * The deck can hold any number of cards — this array is a seed, not a
 * limit. Display text (name/description) is a client-only concern, kept in
 * `client/public/i18n/<lang>.json` under `cards.<id>.*`, not here — the
 * engine never reads it.
 */
export const BASE_CARD_SET: CardDefinition[] = [
  {
    id: 'job-waiter',
    category: 'job',
    maxOnTable: 1,
    resources: { money: 1 },
  },
  {
    id: 'job-engineer',
    category: 'job',
    maxOnTable: 1,
    resources: { money: 2, education: 1 },
  },
  {
    id: 'job-senior-engineer',
    category: 'job',
    maxOnTable: 1,
    resources: { money: 4, education: 2 },
    upgrades: ['job-engineer'],
  },
  {
    id: 'relationship-marriage',
    category: 'relationship',
    maxOnTable: 1,
    resources: { happiness: 2 },
  },
  {
    id: 'flirt-crush',
    category: 'flirt',
    maxOnTable: 5,
    excludedBy: ['relationship'],
    resources: { happiness: 1 },
  },
  {
    id: 'flirt-date',
    category: 'flirt',
    maxOnTable: 5,
    excludedBy: ['relationship'],
    resources: { happiness: 1 },
  },
  {
    id: 'flirt-kiss',
    category: 'flirt',
    maxOnTable: 5,
    excludedBy: ['relationship'],
    resources: { happiness: 1 },
  },
  {
    id: 'bonus-infidelity',
    category: 'bonus',
    bypassExclusion: ['flirt'],
    resources: { happiness: 1 },
  },
  {
    id: 'bonus-social-butterfly',
    category: 'bonus',
    bypassCap: ['flirt'],
  },
  {
    id: 'child-baby',
    category: 'child',
    maxOnTable: 3,
    requires: ['relationship'],
    resources: { happiness: 2 },
  },
  {
    id: 'education-degree',
    category: 'education',
    resources: { education: 3 },
  },
  {
    id: 'malus-rival',
    category: 'malus',
    effect: 'malus-skip-turn',
  },
  {
    id: 'malus-layoff',
    category: 'malus',
    effect: 'malus-force-discard',
  },
  {
    id: 'malus-thief',
    category: 'malus',
    effect: 'malus-steal-card',
  },
];
