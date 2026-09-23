import { Component, input } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'app-table',
  imports: [Icon],
  templateUrl: './table.html',
  styleUrl: './table.css',
})
export class Table {
  readonly deckCount = input.required<number>();
}
