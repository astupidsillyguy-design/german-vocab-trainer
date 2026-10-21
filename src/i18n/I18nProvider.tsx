import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { I18nProvider as AriaI18nProvider } from 'react-aria-components';
import { runWhenSettled } from '../shared/idle';
import { persistLocale, type Locale } from './locales';
import { loadMessages, preloadMessages, type Messages } from './messages';

export interface I18nContextValue {
  readonly locale: Locale;
  readonly messages: Messages;
  /** 切换语言：先下载该语言的文案，下载完成后一次性切换（失败时保持当前语言） */
  readonly setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  readonly initialLocale: Locale;
  /** 初始语言的文案：首帧渲染前由入口加载好，渲染时不需要等待 */
  readonly initialMessages: Messages;
  readonly children: ReactNode;
}

interface ActiveLanguage {
  readonly locale: Locale;
  readonly messages: Messages;
}

/**
 * 提供当前语言与文案，并同步：
 * - `<html lang>`：决定字体回退、断字和读屏发音；
 * - `document.title`；
 * - React Aria 的内置文案与数字格式。
 */
export function I18nProvider({ initialLocale, initialMessages, children }: I18nProviderProps) {
  const [active, setActive] = useState<ActiveLanguage>({
    locale: initialLocale,
    messages: initialMessages,
  });
  const { locale, messages } = active;
  /** 连续快速切换时，只采用最后一次选择 */
  const requested = useRef<Locale>(initialLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages.meta.appName;
  }, [locale, messages]);

  // 首屏稳定之后在空闲时下载其余语言，之后切换语言即时完成
  useEffect(
    () =>
      runWhenSettled(() => {
        void preloadMessages();
      }),
    [],
  );

  const setLocale = useCallback((next: Locale) => {
    requested.current = next;
    loadMessages(next).then(
      (nextMessages) => {
        if (requested.current !== next) return;
        setActive({ locale: next, messages: nextMessages });
        persistLocale(next);
      },
      () => {
        // 下载失败：保持当前语言，选择器仍停在原来的语言上，用户可以再试一次
      },
    );
  }, []);

  const value = useMemo(() => ({ locale, messages, setLocale }), [locale, messages, setLocale]);

  return (
    <I18nContext value={value}>
      <AriaI18nProvider locale={locale}>{children}</AriaI18nProvider>
    </I18nContext>
  );
}

export function useI18n(): I18nContextValue {
  const context = use(I18nContext);
  if (!context) throw new Error('useI18n 必须在 <I18nProvider> 内部使用');
  return context;
}
