import { Component, computed, input, output, signal } from '@angular/core';
import type { CardInstance } from '@happy-card-game/shared';
import { canPlayCard, getDefinition, playRejectionText, resolveUpgrade } from './table-rules';

interface HandCardView {
  card: CardInstance;
  name: string;
  category: string;
  canPlay: boolean;
  playBlockedReason: string | null;
  hasMalusEffect: boolean;
}

@Component({
  selector: 'app-hand',
  imports: [],
  templateUrl: './hand.html',
  styleUrl: './hand.css',
})
export class Hand {
  readonly cards = input.required<CardInstance[]>();
  /** The local player's own table — needed to mirror the server's play-rules check. */
  readonly table = input.required<CardInstance[]>();
  readonly disabled = input<boolean>(false);
  /** Set while the board is waiting for a hand card to pair with a table-discard combo. */
  readonly pairingForTableDiscard = input<boolean>(false);

  readonly play = output<CardInstance>();
  readonly discardFromHand = output<CardInstance>();
  readonly useMalus = output<CardInstance>();
  readonly pairForTableDiscard = output<CardInstance>();

  protected readonly selectedCardId = signal<string | null>(null);

  protected readonly views = computed<HandCardView[]>(() =>
    this.cards().map((card) => {
      const definition = getDefinition(card.definitionId);
      const upgradeTarget = resolveUpgrade(this.table(), definition);
      const check = canPlayCard(this.table(), definition, upgradeTarget);
      return {
        card,
        name: definition.name,
        category: definition.category,
        canPlay: check.ok,
        playBlockedReason: check.ok ? null : playRejectionText(check.reason),
        hasMalusEffect: !!definition.effect,
      };
    }),
  );

  onCardClick(view: HandCardView): void {
    if (this.disabled()) {
      return;
    }
    if (this.pairingForTableDiscard()) {
      this.pairForTableDiscard.emit(view.card);
      return;
    }
    this.selectedCardId.set(this.selectedCardId() === view.card.instanceId ? null : view.card.instanceId);
  }

  onPlay(view: HandCardView): void {
    this.selectedCardId.set(null);
    this.play.emit(view.card);
  }

  onDiscard(view: HandCardView): void {
    this.selectedCardId.set(null);
    this.discardFromHand.emit(view.card);
  }

  onUseMalus(view: HandCardView): void {
    this.selectedCardId.set(null);
    this.useMalus.emit(view.card);
  }
}
