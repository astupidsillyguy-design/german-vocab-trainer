import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../src/i18n/locales.ts';
import { selectLocale } from '../src/i18n/selectLocale.ts';
import { renderLocalePreload } from './locale-preload.ts';

const files = Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, `./assets/${locale}.js`]),
);

function run(stored: unknown, languages: readonly string[], storageBlocked = false): string[] {
  const requested: string[] = [];
  runInNewContext(renderLocalePreload(files), {
    localStorage: {
      getItem(key: string) {
        expect(key).toBe('gvt.pref.locale');
        if (storageBlocked) throw new Error('disabled');
        return stored;
      },
    },
    navigator: { languages },
    document: {
      createElement(tag: string) {
        expect(tag).toBe('link');
        return {};
      },
      head: {
        append(link: { rel: string; crossOrigin: string; href: string }) {
          expect(link.rel).toBe('modulepreload');
          expect(link.crossOrigin).toBe('');
          requested.push(link.href);
        },
      },
    },
  });
  return requested;
}

describe('语言文案提前预加载', () => {
  it.each([
    { stored: 'ja', languages: ['de'] },
    { stored: 'en', languages: ['zh-CN'] },
    { stored: null, languages: ['fr-FR', 'de-AT'] },
    { stored: 'invalid', languages: ['zh-TW'] },
    { stored: null, languages: ['EN-US'] },
    { stored: null, languages: ['ja-JP'] },
    { stored: null, languages: ['fr'] },
    { stored: null, languages: [] },
  ])('选择规则和应用一致：%j', ({ stored, languages }) => {
    const locale = selectLocale(stored, languages, SUPPORTED_LOCALES) ?? DEFAULT_LOCALE;
    expect(run(stored, languages)).toEqual([files[locale]]);
  });

  it('存储被禁用时仍然按浏览器语言预加载', () => {
    expect(run(null, ['de-DE'], true)).toEqual([files.de]);
  });

  it('序列化没有依赖构建工具的私有辅助函数', () => {
    expect(renderLocalePreload(files)).not.toMatch(/__name|__publicField|eval\(/u);
  });
});
