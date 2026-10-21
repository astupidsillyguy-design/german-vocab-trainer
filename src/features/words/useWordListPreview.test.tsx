import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n';
import { catalogs } from '../../test/messages';
import { useWordListPreview } from './useWordListPreview';

function wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <I18nProvider initialLocale="zh-CN" initialMessages={catalogs['zh-CN']}>
      {children}
    </I18nProvider>
  );
}

/** 足够大、一片之内解析不完的词表 */
function bigList(count: number, prompt: string): string {
  return Array.from({ length: count }, (_, index) => `das Wort${String(index)} ${prompt}`).join(
    '\n',
  );
}

describe('useWordListPreview', () => {
  it('小词表在绘制前同步得到结果', () => {
    const { result } = renderHook(() => useWordListPreview('der Tisch 桌子'), { wrapper });
    expect(result.current.isPending).toBe(false);
    expect(result.current.result?.counts.entries).toBe(1);
  });

  it('大词表分片解析：期间保持上一次的结果，完成后更新', async () => {
    const { result, rerender } = renderHook(({ text }) => useWordListPreview(text), {
      wrapper,
      initialProps: { text: 'der Tisch 桌子' },
    });
    const big = bigList(20_000, '词');
    rerender({ text: big });
    expect(result.current.isPending).toBe(true);
    expect(result.current.result?.counts.entries).toBe(1);
    await waitFor(
      () => {
        expect(result.current.isPending).toBe(false);
      },
      { timeout: 10_000 },
    );
    expect(result.current.result?.counts.entries).toBe(20_000);
  });

  it('文本再次变化时放弃旧任务，只给出最新文本的结果', async () => {
    const { result, rerender } = renderHook(({ text }) => useWordListPreview(text), {
      wrapper,
      initialProps: { text: '' },
    });
    rerender({ text: bigList(20_000, '旧') });
    rerender({ text: bigList(3, '新') });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.result?.counts.entries).toBe(3);
    // 旧任务不会在之后覆盖结果
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(result.current.result?.counts.entries).toBe(3);
    expect(result.current.result?.entries[0]?.prompt).toBe('新');
  });
});
