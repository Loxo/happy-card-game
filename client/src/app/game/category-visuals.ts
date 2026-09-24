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
  /** A `categories.*` translation key, resolved via the `transloco` pipe at each call site — not display text itself. */
  labelKey: string;
}

interface ResourceVisual {
  color: string;
  icon: IconName;
  /** A `resources.*` translation key, resolved via the `transloco` pipe at each call site — not display text itself. */
  labelKey: string;
}

const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  job: { color: 'var(--cat-job)', icon: 'job', labelKey: 'categories.job' },
  flirt: { color: 'var(--cat-flirt)', icon: 'flirt', labelKey: 'categories.flirt' },
  relationship: { color: 'var(--cat-relationship)', icon: 'relationship', labelKey: 'categories.relationship' },
  child: { color: 'var(--cat-child)', icon: 'child', labelKey: 'categories.child' },
  education: { color: 'var(--cat-education)', icon: 'education', labelKey: 'categories.education' },
  bonus: { color: 'var(--cat-bonus)', icon: 'bonus', labelKey: 'categories.bonus' },
  malus: { color: 'var(--cat-malus)', icon: 'malus', labelKey: 'categories.malus' },
};

const RESOURCE_VISUALS: Record<ResourceKind, ResourceVisual> = {
  happiness: { color: 'var(--res-happiness)', icon: 'happiness', labelKey: 'resources.happiness' },
  education: { color: 'var(--res-education)', icon: 'education', labelKey: 'resources.education' },
  money: { color: 'var(--res-money)', icon: 'money', labelKey: 'resources.money' },
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
