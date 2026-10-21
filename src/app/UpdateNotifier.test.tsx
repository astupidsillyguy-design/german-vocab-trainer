import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdateChannel, updateChannel } from '../pwa';
import { renderWithI18n } from '../test/render';
import { ToastRegion } from '../ui';
import { UpdateNotifier } from './UpdateNotifier';

function renderNotifier(locale: 'zh-CN' | 'en' = 'zh-CN') {
  const channel = new UpdateChannel();
  renderWithI18n(
    <>
      <UpdateNotifier channel={channel} />
      <ToastRegion />
    </>,
    { locale },
  );
  return channel;
}

describe('UpdateNotifier', () => {
  it('没有新版本时不显示任何通知', () => {
    renderNotifier();
    expect(screen.queryByText('有新版本可用')).not.toBeInTheDocument();
  });

  it('新版本就绪后显示需要手动关闭的通知，点“刷新”才让它接管', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const apply = vi.fn();
    const channel = renderNotifier();

    act(() => {
      channel.offer(apply);
    });
    expect(await screen.findByText('有新版本可用')).toBeInTheDocument();
    // 带操作的通知不会自动消失
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText('有新版本可用')).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '刷新' }));
    expect(apply).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('跟随界面语言', () => {
    const channel = renderNotifier('en');
    act(() => {
      channel.offer(vi.fn());
    });
    expect(screen.getByText('A new version is available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('是独立的全局通道', () => {
    expect(updateChannel).toBeInstanceOf(UpdateChannel);
  });
});
