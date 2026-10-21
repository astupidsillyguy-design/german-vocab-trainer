import { DEFAULT_LOCALE, LOCALE_PREFERENCE_KEY, SUPPORTED_LOCALES } from '../src/i18n/locales.ts';
import { selectLocale } from '../src/i18n/selectLocale.ts';
import { preferenceStorageKey } from '../src/shared/preferences.ts';

interface PreloadConfig {
  readonly supported: readonly string[];
  readonly fallback: string;
  readonly storageKey: string;
  readonly files: Readonly<Record<string, string>>;
}

type Selector = (
  stored: unknown,
  preferred: readonly string[],
  supported: readonly string[],
) => string | null;

/** 构建时序列化为外部脚本：只能引用参数、函数内变量与浏览器标准 API。 */
function preloadLocale(select: Selector, config: PreloadConfig): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(config.storageKey);
  } catch {
    // 存储被禁用时，和应用一样退回浏览器语言。
  }
  const locale = select(stored, navigator.languages, config.supported) ?? config.fallback;
  const file = config.files[locale];
  if (file === undefined) return;
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.crossOrigin = '';
  link.href = file;
  document.head.append(link);
}

/** 仅生成静态代码；运行时没有 eval、动态代码执行或 CSP 例外。 */
export function renderLocalePreload(files: Readonly<Record<string, string>>): string {
  const config: PreloadConfig = {
    supported: SUPPORTED_LOCALES,
    fallback: DEFAULT_LOCALE,
    storageKey: preferenceStorageKey(LOCALE_PREFERENCE_KEY),
    files,
  };
  return `(${preloadLocale.toString()})(${selectLocale.toString()},${JSON.stringify(config)});\n`;
}
