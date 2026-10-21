import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogs } from '../test/messages';
import { I18nProvider, useI18n } from './I18nProvider';
import type { Locale } from './locales';
import * as messagesModule from './messages';
import type { Messages } from './messages';

interface PendingLoad {
  readonly resolve: (messages: Messages) => void;
  readonly reject: (error: Error) => void;
}

const pending = new Map<Locale, PendingLoad>();

function pendingLoad(locale: Locale): PendingLoad {
  const load = pending.get(locale);
  if (!load) throw new Error(`没有等待中的 ${locale} 加载`);
  return load;
}

function Probe() {
  const { locale, messages, setLocale } = useI18n();
  return (
    <>
      <p data-testid="current">{`${locale}:${messages.nav.quiz}`}</p>
      <button
        type="button"
        onClick={() => {
          setLocale('de');
        }}
      >
        de
      </button>
      <button
        type="button"
        onClick={() => {
          setLocale('ja');
        }}
      >
        ja
      </button>
    </>
  );
}

function renderProbe() {
  render(
    <I18nProvider initialLocale="zh-CN" initialMessages={catalogs['zh-CN']}>
      <Probe />
    </I18nProvider>,
  );
}

beforeEach(() => {
  pending.clear();
  // 由测试决定每种语言何时下载完成、是否失败
  vi.spyOn(messagesModule, 'loadMessages').mockImplementation(
    (locale: Locale) =>
      new Promise<Messages>((resolve, reject) => {
        pending.set(locale, { resolve, reject });
      }),
  );
  vi.spyOn(messagesModule, 'preloadMessages').mockResolvedValue(undefined);
});

describe('I18nProvider 的异步切换', () => {
  it('下载完成前保持当前语言，完成后才切换', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'de' }));
    expect(screen.getByTestId('current')).toHaveTextContent('zh-CN:测验');
    expect(localStorage.getItem('gvt.pref.locale')).toBeNull();

    pendingLoad('de').resolve(catalogs.de);
    await waitFor(() => {
      expect(screen.getByTestId('current')).toHaveTextContent(`de:${catalogs.de.nav.quiz}`);
    });
    expect(localStorage.getItem('gvt.pref.locale')).toBe('de');
  });

  it('连续切换时只采用最后一次选择，即使先发起的后完成', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'de' }));
    await user.click(screen.getByRole('button', { name: 'ja' }));
    pendingLoad('ja').resolve(catalogs.ja);
    await waitFor(() => {
      expect(screen.getByTestId('current')).toHaveTextContent(`ja:${catalogs.ja.nav.quiz}`);
    });
    pendingLoad('de').resolve(catalogs.de);

    await waitFor(() => {
      expect(localStorage.getItem('gvt.pref.locale')).toBe('ja');
    });
    expect(screen.getByTestId('current')).toHaveTextContent('ja:');
  });

  it('下载失败时保持当前语言且不保存选择，之后可以重试', async () => {
    const user = userEvent.setup();
    renderProbe();

    await user.click(screen.getByRole('button', { name: 'de' }));
    pendingLoad('de').reject(new Error('offline'));
    await Promise.resolve();
    expect(screen.getByTestId('current')).toHaveTextContent('zh-CN:测验');
    expect(localStorage.getItem('gvt.pref.locale')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'de' }));
    pendingLoad('de').resolve(catalogs.de);
    await waitFor(() => {
      expect(screen.getByTestId('current')).toHaveTextContent('de:');
    });
  });
});
