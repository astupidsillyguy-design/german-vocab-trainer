import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { I18nProvider, useI18n } from './I18nProvider';
import {
  isLocale,
  matchLocale,
  resolveInitialLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from './locales';
import { catalogs } from '../test/messages';
import { loadMessages } from './messages';
import { zhCN } from './messages/zh-CN';
import { plural } from './plural';

type Shape = string | { readonly [key: string]: Shape };

/** 把文案树描述为“结构”：字符串 → 'string'，函数 → 'fn/参数个数'。 */
function shapeOf(value: unknown): Shape {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'function') return `fn/${String(value.length)}`;
  if (typeof value === 'object' && value !== null) {
    const entries: [string, unknown][] = Object.entries(value);
    return Object.fromEntries(entries.map(([key, child]) => [key, shapeOf(child)]));
  }
  return typeof value;
}

function leafStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(leafStrings);
  return [];
}

describe('文案目录', () => {
  it.each(SUPPORTED_LOCALES)('%s 与简体中文结构完全一致', (locale) => {
    expect(shapeOf(catalogs[locale])).toEqual(shapeOf(zhCN));
  });

  it.each(SUPPORTED_LOCALES)('%s 没有空字符串', (locale) => {
    for (const text of leafStrings(catalogs[locale])) expect(text.trim()).not.toBe('');
  });

  it('带参数的文案会插入参数', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(catalogs[locale].gallery.wordCount(24)).toContain('24');
    }
  });

  it('英文与德文区分单复数', () => {
    expect(catalogs.en.gallery.wordCount(1)).toBe('1 word');
    expect(catalogs.en.gallery.wordCount(2)).toBe('2 words');
    expect(catalogs.de.gallery.wordCount(1)).toBe('1 Wort');
    expect(catalogs.de.gallery.wordCount(2)).toBe('2 Wörter');
  });
});

describe('plural', () => {
  const forms = { one: 'one', other: 'other' };
  it('按 CLDR 规则选择', () => {
    expect(plural('en', 1, forms)).toBe('one');
    expect(plural('en', 0, forms)).toBe('other');
    expect(plural('zh-CN', 1, forms)).toBe('other');
    expect(plural('ja', 1, forms)).toBe('other');
  });
});

describe('matchLocale', () => {
  it.each<[readonly string[], Locale | null]>([
    [['de-AT', 'en'], 'de'],
    [['zh-CN'], 'zh-CN'],
    [['zh-TW'], 'zh-CN'],
    [['ja-JP'], 'ja'],
    [['fr-FR', 'en-GB'], 'en'],
    [['fr-FR'], null],
    [[], null],
  ])('%j → %s', (preferred, expected) => {
    expect(matchLocale(preferred)).toBe(expected);
  });

  it('isLocale 只接受支持的语言', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it('已保存的选择优先于浏览器语言', () => {
    localStorage.setItem('gvt.pref.locale', 'ja');
    expect(resolveInitialLocale()).toBe('ja');
    localStorage.setItem('gvt.pref.locale', 'xx');
    expect(isLocale(resolveInitialLocale())).toBe(true);
  });
});

function LocaleProbe() {
  const { locale, messages, setLocale } = useI18n();
  return (
    <>
      <p>{messages.nav.quiz}</p>
      <button
        type="button"
        onClick={() => {
          setLocale(locale === 'de' ? 'ja' : 'de');
        }}
      >
        switch
      </button>
    </>
  );
}

describe('loadMessages', () => {
  it.each(SUPPORTED_LOCALES)('%s 按需加载，结果与静态目录一致', async (locale) => {
    await expect(loadMessages(locale)).resolves.toBe(catalogs[locale]);
  });

  it('同一语言只请求一次', () => {
    expect(loadMessages('ja')).toBe(loadMessages('ja'));
  });
});

describe('I18nProvider', () => {
  it('同步 <html lang>、标题并持久化选择', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider initialLocale="zh-CN" initialMessages={catalogs['zh-CN']}>
        <LocaleProbe />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toBe(catalogs['zh-CN'].meta.appName);
    expect(screen.getByText('测验')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'switch' }));

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('de');
    });
    expect(document.title).toBe(catalogs.de.meta.appName);
    expect(screen.getByText(catalogs.de.nav.quiz)).toBeInTheDocument();
    expect(localStorage.getItem('gvt.pref.locale')).toBe('de');
  });

  it('在 Provider 外使用会给出明确错误', () => {
    expect(() => render(<LocaleProbe />)).toThrow(/I18nProvider/);
  });
});
