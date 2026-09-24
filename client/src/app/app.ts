import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

import type { SupportedLang } from './transloco.loader';
import { storeLang } from './transloco.loader';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly transloco = inject(TranslocoService);

  protected readonly activeLang = this.transloco.activeLang;

  protected setLang(lang: SupportedLang): void {
    this.transloco.setActiveLang(lang);
    storeLang(lang);
  }
}
