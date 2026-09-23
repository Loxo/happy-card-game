import type { ResourceKind } from '@happy-card-game/shared';
import type { IconName } from './icon';

/**
 * Single source for how a card category or resource kind looks — color,
 * icon, and display label. Every template that colors or labels a
 * category/resource reads from here instead of hardcoding a hex or a
 * translated string, so the two stay in sync everywhere they appear
 * (opponent chips, tableau headers, card-face, the top-bar legend).
 *
 * `CardDefinition.category` is a plain string (see shared/src/cards/card.ts),
 * not a closed union — `BASE_CARD_SET`'s known categories are covered here;
 * `categoryVisual` throws on anything else rather than guessing a look,
 * matching `table-rules.ts`'s `getDefinition` pattern.
 */
interface CategoryVisual {
  color: string;
  icon: IconName;
  /** Display label — French, alongside already-French card content; UI chrome elsewhere stays English. */
  label: string;
}

interface ResourceVisual {
  color: string;
  icon: IconName;
  label: string;
}

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  job: { color: 'var(--cat-job)', icon: 'job', label: 'Emploi' },
  flirt: { color: 'var(--cat-flirt)', icon: 'flirt', label: 'Flirt' },
  relationship: { color: 'var(--cat-relationship)', icon: 'relationship', label: 'Relation' },
  child: { color: 'var(--cat-child)', icon: 'child', label: 'Enfant' },
  education: { color: 'var(--cat-education)', icon: 'education', label: 'Éducation' },
  bonus: { color: 'var(--cat-bonus)', icon: 'bonus', label: 'Bonus' },
  malus: { color: 'var(--cat-malus)', icon: 'malus', label: 'Malus' },
};

const RESOURCE_VISUALS: Record<ResourceKind, ResourceVisual> = {
  happiness: { color: 'var(--res-happiness)', icon: 'happiness', label: 'Happiness' },
  education: { color: 'var(--res-education)', icon: 'education', label: 'Education' },
  money: { color: 'var(--res-money)', icon: 'money', label: 'Money' },
};

/** The fixed, ordered category list the tableau grid renders one slot per — `malus` excluded, since malus cards resolve instantly and never sit on a table. */
export const TABLEAU_CATEGORY_ORDER = ['job', 'flirt', 'relationship', 'child', 'education', 'bonus'] as const;

export function categoryVisual(category: string): CategoryVisual {
  const visual = CATEGORY_VISUALS[category];
  if (!visual) {
    throw new Error(`Unknown card category: ${category}`);
  }
  return visual;
}

export function resourceVisual(kind: ResourceKind): ResourceVisual {
  return RESOURCE_VISUALS[kind];
}
