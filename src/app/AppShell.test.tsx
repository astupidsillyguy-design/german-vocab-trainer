import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { sizeClassMinWidth } from '../design/tokens';
import { renderWithProviders } from '../test/library';
import { setViewportWidth } from '../test/viewport';
import { AppShell } from './AppShell';
import { APP_ROUTES } from './routes';

function renderShell(path: string) {
  return renderWithProviders(<AppShell />, { path }).location;
}

describe('AppShell', () => {
  it('手机尺寸显示底部 Tab Bar，四个主入口，当前页高亮', () => {
    renderShell('/archive');
    const nav = screen.getByRole('navigation', { name: '主导航' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['测验', '归档', '词表', '设置']);
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveTextContent('归档');
    expect(screen.queryByRole('button', { name: '收起侧边栏' })).not.toBeInTheDocument();
  });

  it('平板及以上显示侧边栏，可折叠并记住偏好', async () => {
    setViewportWidth(sizeClassMinWidth.regular);
    const user = userEvent.setup();
    renderShell('/settings');
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveTextContent('设置');

    await user.click(within(nav).getByRole('button', { name: '收起侧边栏' }));

    expect(localStorage.getItem('gvt.pref.sidebar.collapsed')).toBe('true');
    expect(within(nav).getByRole('button', { name: '展开侧边栏' })).toBeInTheDocument();
  });

  it('跨越断点时在 Tab Bar 与侧边栏之间切换', () => {
    renderShell('/quiz');
    expect(screen.queryByRole('button', { name: '收起侧边栏' })).not.toBeInTheDocument();
    setViewportWidth(sizeClassMinWidth.expanded);
    return waitFor(() => {
      expect(screen.getByRole('button', { name: '收起侧边栏' })).toBeInTheDocument();
    });
  });

  it('未知路径重定向到测验页（replace，不留历史）', async () => {
    const location = renderShell('/nope');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('测验');
    });
    expect(location.history.at(-1)).toBe('/quiz');
    expect(location.history).not.toContain('/nope');
  });

  it.each(APP_ROUTES.map((route) => route.path))(
    '%s 页面按需加载完成后，只有一个 h1，主内容区是 main 地标',
    async (path) => {
      renderShell(path);
      expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    },
  );

  it('跳转链接是第一个可聚焦元素，回车后焦点进入主内容区', async () => {
    const user = userEvent.setup();
    renderShell('/quiz');
    await user.tab();
    const skip = screen.getByRole('link', { name: '跳到主要内容' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('通知区域常驻', () => {
    renderShell('/quiz');
    expect(screen.getByRole('region', { name: '通知' })).toBeInTheDocument();
  });
});
