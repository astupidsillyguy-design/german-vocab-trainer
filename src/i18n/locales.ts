import { readPreference, writePreference } from '../shared/preferences.ts';
import { selectLocale } from './selectLocale.ts';

export const SUPPORTED_LOCALES = ['zh-CN', 'en', 'de', 'ja'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'zh-CN';

/** 语言名称始终用该语言自身书写，方便用户在看不懂当前界面时也能找到自己的语言。 */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
  de: 'Deutsch',
  ja: '日本語',
};

export const LOCALE_PREFERENCE_KEY = 'locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** 按浏览器偏好语言列表匹配：先精确匹配，再按主语言匹配（如 de-AT → de）。 */
export function matchLocale(preferred: readonly string[]): Locale | null {
  return selectLocale(null, preferred, SUPPORTED_LOCALES);
}

export function resolveInitialLocale(): Locale {
  const stored = readPreference(LOCALE_PREFERENCE_KEY);
  const languages = typeof navigator === 'undefined' ? [] : navigator.languages;
  return selectLocale(stored, languages, SUPPORTED_LOCALES) ?? DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): boolean {
  return writePreference(LOCALE_PREFERENCE_KEY, locale);
}
