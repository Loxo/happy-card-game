import { Component, input } from '@angular/core';

/**
 * The complete, closed set of icons the board draws — one `@switch` case per
 * name in `icon.html`, no `[innerHTML]`/sanitization surface. Extend this
 * union (and `icon.html`) together; an unlisted name fails at compile time
 * rather than silently rendering nothing.
 */
export type IconName =
  // Card categories (CardDefinition.category)
  | 'job'
  | 'flirt'
  | 'relationship'
  | 'child'
  | 'education'
  | 'bonus'
  | 'malus'
  // Resources (ResourceKind)
  | 'happiness'
  | 'money'
  // Chrome
  | 'discard'
  | 'check'
  | 'upgrade'
  | 'target';

@Component({
  selector: 'app-icon',
  imports: [],
  templateUrl: './icon.html',
  styleUrl: './icon.css',
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input<number>(16);
}
