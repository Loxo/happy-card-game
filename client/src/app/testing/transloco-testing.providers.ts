import { provideTransloco, translocoConfig, TRANSLOCO_LOADER } from '@jsverse/transloco';
import { TestingLoader } from '@jsverse/transloco';

import en from '../../../public/i18n/en.json';
import fr from '../../../public/i18n/fr.json';

/**
 * The real `en`/`fr` dictionaries loaded synchronously (no HTTP), so specs assert against
 * the actual shipped copy instead of a hand-maintained duplicate that can drift.
 */
export function provideTranslocoTesting() {
  return [
    provideTransloco({
      config: translocoConfig({
        availableLangs: ['en', 'fr'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: true,
      }),
    }),
    { provide: TRANSLOCO_LOADER, useValue: new TestingLoader({ en, fr }) },
  ];
}
