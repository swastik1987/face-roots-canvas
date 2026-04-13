/**
 * i18n initialisation (Phase 6 scaffold — English only in v1).
 *
 * Usage in components:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   <p>{t('splash.tagline')}</p>
 *
 * Adding a new language:
 *   1. Duplicate src/locales/en.json → src/locales/<code>.json
 *   2. Add the language code to `resources` below
 *   3. Update the `lng` default detection logic
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React handles XSS
  },
  returnNull: false,
});

export default i18n;
