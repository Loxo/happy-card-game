import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RESOURCE_KINDS, type CardDefinition } from '@happy-card-game/shared';
import { categoryVisual, resourceVisual } from './category-visuals';
import type { IconName } from './icon';
import { Icon } from './icon';

export type CardFaceSize = 'mini' | 'tableau' | 'hand';

interface ValueBadge {
  icon: IconName;
  value: number;
}

/**
 * One card's visual, in three sizes (`size`). The artifact repeats the same
 * anatomy — category header, illustration placeholder, name/description
 * body — at the played-row (mini), tableau (tableau), and hand (hand) call
 * sites; this component builds it once so the three don't drift and so
 * `card-face.css` stays a single file against the `anyComponentStyle`
 * budget instead of tripling.
 */
@Component({
  selector: 'app-card-face',
  imports: [Icon, TranslocoPipe],
  templateUrl: './card-face.html',
  styleUrl: './card-face.css',
})
export class CardFace {
  readonly definition = input.required<CardDefinition>();
  readonly size = input<CardFaceSize>('tableau');
  /** A short caller-supplied note, e.g. the tableau's "Salaire max 2" / "Cumulable" line. */
  readonly footer = input<string | null>(null);
  /** Gold-glow selected state — only visually applied at `size="hand"`. */
  readonly selected = input<boolean>(false);

  protected readonly visual = computed(() => categoryVisual(this.definition().category));

  /**
   * The header's value badge: the first resource this card contributes,
   * shown with that resource's own icon (not a fixed per-category icon) —
   * so the badge always reflects the card's real `resources`, never an
   * invented number. Cards with no resources (bonuses, malus effects)
   * render no badge at all rather than an empty one.
   */
  protected readonly badge = computed<ValueBadge | null>(() => {
    const resources = this.definition().resources;
    if (!resources) {
      return null;
    }
    for (const kind of RESOURCE_KINDS) {
      const value = resources[kind];
      if (value) {
        return { icon: resourceVisual(kind).icon, value };
      }
    }
    return null;
  });

  /** Header icon/badge and illustration-watermark icon sizes scale with `size()` — plain numbers, not CSS, since `<app-icon>` sizes itself via an attribute-bound `width`/`height`. */
  protected readonly headerIconSize = computed(() => ({ mini: 10, tableau: 10, hand: 14 })[this.size()]);
  protected readonly illustrationIconSize = computed(() => ({ mini: 30, tableau: 22, hand: 38 })[this.size()]);
}
