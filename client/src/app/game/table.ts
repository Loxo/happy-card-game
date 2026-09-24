import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from './icon';

@Component({
  selector: 'app-table',
  imports: [Icon, TranslocoPipe],
  templateUrl: './table.html',
  styleUrl: './table.css',
})
export class Table {
  readonly deckCount = input.required<number>();
}
