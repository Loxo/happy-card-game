import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { BASE_CARD_SET, type CardInstance } from '@happy-card-game/shared';
import { CardFace } from './card-face';
import { categoryVisual, TABLEAU_CATEGORY_ORDER } from './category-visuals';
import { Icon } from './icon';
import { categoryAtCap, getDefinition } from './table-rules';

interface CategorySlot {
  category: string;
  atCap: boolean;
  count: number;
  /** From `CardDefinition.maxOnTable` for this category — `undefined` means uncapped (e.g. education, bonus). */
  cap: number | undefined;
  cards: CardInstance[];
}

/**
 * One category's cap doesn't depend on what's currently on the table (a cap
 * applies to empty categories too — a fresh "Relation" slot still shows
 * "0/1"), so it's read once from `BASE_CARD_SET` rather than derived from
 * `cards()`.
 */
const CATEGORY_CAP: Record<string, number | undefined> = Object.fromEntries(
  TABLEAU_CATEGORY_ORDER.map((category) => [
    category,
    BASE_CARD_SET.find((d) => d.category === category)?.maxOnTable,
  ]),
);

@Component({
  selector: 'app-tableau',
  imports: [CardFace, Icon, TranslocoPipe],
  templateUrl: './tableau.html',
  styleUrl: './tableau.css',
})
export class Tableau {
  readonly cards = input.required<CardInstance[]>();
  /** Disabled while it's not your turn or an action is already in flight. */
  readonly disabled = input<boolean>(false);

  readonly discard = output<CardInstance>();

  protected readonly categoryVisual = categoryVisual;

  /** One slot per known non-malus category, always — including ones with zero cards on the table (the artifact's "Libre" placeholder). */
  protected readonly groups = computed<CategorySlot[]>(() => {
    const table = this.cards();
    return TABLEAU_CATEGORY_ORDER.map((category) => {
      const cards = table.filter((instance) => getDefinition(instance.definitionId).category === category);
      return {
        category,
        atCap: categoryAtCap(table, category),
        count: cards.length,
        cap: CATEGORY_CAP[category],
        cards,
      };
    });
  });

  protected definitionOf(instance: CardInstance) {
    return getDefinition(instance.definitionId);
  }

  onCardClick(card: CardInstance): void {
    if (!this.disabled()) {
      this.discard.emit(card);
    }
  }
}
