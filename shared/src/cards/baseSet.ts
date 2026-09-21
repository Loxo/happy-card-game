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
 * limit.
 */
export const BASE_CARD_SET: CardDefinition[] = [
  {
    id: 'job-waiter',
    name: 'Serveur',
    category: 'job',
    maxOnTable: 1,
    resources: { money: 1 },
    description: 'Un petit boulot pour commencer.',
  },
  {
    id: 'job-engineer',
    name: 'Ingénieur',
    category: 'job',
    maxOnTable: 1,
    resources: { money: 2, education: 1 },
    description: 'Un emploi stable et qualifié.',
  },
  {
    id: 'job-senior-engineer',
    name: 'Ingénieur senior',
    category: 'job',
    maxOnTable: 1,
    resources: { money: 4, education: 2 },
    upgrades: ['job-engineer'],
    description: 'Une promotion qui remplace le poste précédent.',
  },
  {
    id: 'relationship-marriage',
    name: 'Mariage',
    category: 'relationship',
    maxOnTable: 1,
    resources: { happiness: 2 },
    description: 'Un engagement qui ferme la porte aux flirts.',
  },
  {
    id: 'flirt-crush',
    name: 'Coup de coeur',
    category: 'flirt',
    maxOnTable: 5,
    excludedBy: ['relationship'],
    resources: { happiness: 1 },
    description: 'Un début de romance, incompatible avec un mariage actif.',
  },
  {
    id: 'flirt-date',
    name: 'Rendez-vous',
    category: 'flirt',
    maxOnTable: 5,
    excludedBy: ['relationship'],
    resources: { happiness: 1 },
    description: 'Un rendez-vous romantique.',
  },
  {
    id: 'flirt-kiss',
    name: 'Premier baiser',
    category: 'flirt',
    maxOnTable: 5,
    excludedBy: ['relationship'],
    resources: { happiness: 1 },
    description: 'Un moment marquant.',
  },
  {
    id: 'bonus-infidelity',
    name: 'Infidélité',
    category: 'bonus',
    bypassExclusion: ['flirt'],
    resources: { happiness: 1 },
    description:
      "Tant qu'elle est active, les flirts ignorent l'exclusion du mariage.",
  },
  {
    id: 'bonus-social-butterfly',
    name: 'Papillon social',
    category: 'bonus',
    bypassCap: ['flirt'],
    description:
      "Tant qu'elle est active, le plafond de flirts est ignoré.",
  },
  {
    id: 'child-baby',
    name: 'Bébé',
    category: 'child',
    maxOnTable: 3,
    requires: ['relationship'],
    resources: { happiness: 2 },
    description: 'Nécessite un mariage déjà sur la table.',
  },
  {
    id: 'education-degree',
    name: 'Diplôme',
    category: 'education',
    resources: { education: 3 },
    description: "Un titre qui n'a pas de plafond.",
  },
  {
    id: 'malus-rival',
    name: 'Rival amoureux',
    category: 'malus',
    effect: 'malus-skip-turn',
    description: 'Le joueur ciblé passe son prochain tour.',
  },
  {
    id: 'malus-layoff',
    name: 'Licenciement',
    category: 'malus',
    effect: 'malus-force-discard',
    description: 'Le joueur ciblé défausse une carte.',
  },
  {
    id: 'malus-thief',
    name: 'Voleur',
    category: 'malus',
    effect: 'malus-steal-card',
    description: 'Vole une carte au joueur ciblé.',
  },
];
