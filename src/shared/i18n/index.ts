/**
 * @fileoverview Инициализация vue-i18n и помощники для сообщений вне Vue.
 */

import { createI18n } from 'vue-i18n';

import ru from '@/shared/i18n/messages/ru';

export const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'ru',
  messages: { ru },
  globalInjection: true,
  warnHtmlMessage: false,
  pluralRules: {
    ru: (choice, choicesLength) => {
      const value = Math.abs(choice);
      const lastTwo = value % 100;
      const last = value % 10;
      if (lastTwo >= 11 && lastTwo <= 14) {
        return choicesLength > 2 ? 2 : 1;
      }
      if (last === 1) {
        return 0;
      }
      if (last >= 2 && last <= 4) {
        return choicesLength > 2 ? 1 : 1;
      }
      return choicesLength > 2 ? 2 : 1;
    },
  },
});

export function translate(
  key: string,
  named?: Record<string, string | number>,
): string {
  return named ? i18n.global.t(key, named) : i18n.global.t(key);
}

export function translatePlural(key: string, count: number): string {
  return i18n.global.t(key, count);
}

export function applyDocumentLocale(): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = String(i18n.global.locale.value);
  document.title = translate('app.title');
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', translate('app.description'));
}
