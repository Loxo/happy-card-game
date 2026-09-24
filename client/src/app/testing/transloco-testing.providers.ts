import { TranslocoTestingModule } from '@jsverse/transloco';

import en from '../../../public/i18n/en.json';
import fr from '../../../public/i18n/fr.json';

/**
 * The real `en`/`fr` dictionaries loaded synchronously (no HTTP), so specs assert against
 * the actual shipped copy instead of a hand-maintained duplicate that can drift.
 */
export function provideTranslocoTesting() {
  return TranslocoTestingModule.forRoot({
    langs: { en, fr },
    translocoConfig: { availableLangs: ['en', 'fr'], defaultLang: 'en' },
    preloadLangs: true,
  });
}
