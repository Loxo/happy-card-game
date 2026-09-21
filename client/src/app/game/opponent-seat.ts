import { Component, computed, input, output } from '@angular/core';
import type { OpponentSummary } from '@happy-card-game/shared';
import { getDefinition } from './table-rules';

interface CategoryCount {
  category: string;
  count: number;
}

@Component({
  selector: 'app-opponent-seat',
  imports: [],
  templateUrl: './opponent-seat.html',
  styleUrl: './opponent-seat.css',
})
export class OpponentSeat {
  readonly opponent = input.required<OpponentSummary>();
  readonly seatLabel = input.required<string>();
  readonly position = input.required<'top' | 'left' | 'right'>();
  readonly isTurn = input<boolean>(false);
  readonly connected = input<boolean>(true);
  readonly selectable = input<boolean>(false);

  readonly pick = output<string>();

  protected readonly tableauSummary = computed<CategoryCount[]>(() => {
    const counts = new Map<string, number>();
    for (const instance of this.opponent().table) {
      const category = getDefinition(instance.definitionId).category;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()].map(([category, count]) => ({ category, count }));
  });

  onClick(): void {
    if (this.selectable()) {
      this.pick.emit(this.opponent().playerId);
    }
  }
}
