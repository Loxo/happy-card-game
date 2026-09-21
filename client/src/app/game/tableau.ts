import { Component, computed, input, output } from '@angular/core';
import type { CardInstance } from '@happy-card-game/shared';
import { categoryAtCap, getDefinition } from './table-rules';

interface CategoryGroup {
  category: string;
  atCap: boolean;
  cards: CardInstance[];
}

@Component({
  selector: 'app-tableau',
  imports: [],
  templateUrl: './tableau.html',
  styleUrl: './tableau.css',
})
export class Tableau {
  readonly cards = input.required<CardInstance[]>();
  /** Disabled while it's not your turn or an action is already in flight. */
  readonly disabled = input<boolean>(false);

  readonly discard = output<CardInstance>();

  protected readonly groups = computed<CategoryGroup[]>(() => {
    const table = this.cards();
    const byCategory = new Map<string, CardInstance[]>();
    for (const instance of table) {
      const category = getDefinition(instance.definitionId).category;
      byCategory.set(category, [...(byCategory.get(category) ?? []), instance]);
    }
    return [...byCategory.entries()].map(([category, cards]) => ({
      category,
      atCap: categoryAtCap(table, category),
      cards,
    }));
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
