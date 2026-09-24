import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { CardDefinition, CardInstance } from '@happy-card-game/shared';
import { CardFace } from './card-face';
import { canPlayCard, getDefinition, resolveUpgrade } from './table-rules';

interface HandCardView {
  card: CardInstance;
  definition: CardDefinition;
  name: string;
  canPlay: boolean;
  playBlockedReason: string | null;
  hasMalusEffect: boolean;
}

@Component({
  selector: 'app-hand',
  imports: [CardFace, TranslocoPipe],
  templateUrl: './hand.html',
  styleUrl: './hand.css',
})
export class Hand {
  private readonly transloco = inject(TranslocoService);

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

  protected readonly views = computed<HandCardView[]>(() => {
    const lang = this.transloco.activeLang();
    return this.cards().map((card) => {
      const definition = getDefinition(card.definitionId);
      const upgradeTarget = resolveUpgrade(this.table(), definition);
      const check = canPlayCard(this.table(), definition, upgradeTarget);
      return {
        card,
        definition,
        name: this.transloco.translate(`cards.${definition.id}.name`, {}, lang),
        canPlay: check.ok,
        playBlockedReason: check.ok ? null : this.transloco.translate(`errors.${check.reason}`, {}, lang),
        hasMalusEffect: !!definition.effect,
      };
    });
  });

  /** The single selected card's view — drives the one floating action bar below the fan. */
  protected readonly selectedView = computed(() =>
    this.views().find((v) => v.card.instanceId === this.selectedCardId()),
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
