import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import type { Translation, TranslocoLoader } from '@jsverse/transloco';

/** Fetches `public/i18n/<lang>.json`, served at the app root by Angular's `public` asset dir. */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  constructor(private readonly http: HttpClient) {}

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

const STORED_LANG_KEY = 'happy-card-game.lang';
const SUPPORTED_LANGS = ['en', 'fr'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** Read before Transloco initializes so the first paint uses the stored locale, not a flash of the default. */
export function getStoredLang(): SupportedLang {
  try {
    const stored = localStorage.getItem(STORED_LANG_KEY);
    return (SUPPORTED_LANGS as readonly string[]).includes(stored ?? '')
      ? (stored as SupportedLang)
      : 'en';
  } catch {
    return 'en';
  }
}

export function storeLang(lang: SupportedLang): void {
  try {
    localStorage.setItem(STORED_LANG_KEY, lang);
  } catch {
    // Private browsing / storage disabled — the language just won't persist across reloads.
  }
}
