import { Component, input } from '@angular/core';

@Component({
  selector: 'app-table',
  imports: [],
  templateUrl: './table.html',
  styleUrl: './table.css',
})
export class Table {
  readonly deckCount = input.required<number>();
}
