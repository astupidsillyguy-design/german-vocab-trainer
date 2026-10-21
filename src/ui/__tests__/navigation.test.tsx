import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookOpen, Settings } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderWithI18n } from '../../test/render';
import { NavigationBar, Sidebar, TabBar, type SidebarSection, type TabBarItem } from '..';

type Tab = 'quiz' | 'settings';
const ARCHIVE_COUNT = 1200;

const TABS: readonly TabBarItem<Tab>[] = [
  { id: 'quiz', label: '测验', href: '#/quiz', icon: <BookOpen />, badge: 3 },
  { id: 'settings', label: '设置', href: '#/settings', icon: <Settings /> },
];

describe('TabBar', () => {
  it('是带名称的导航地标，当前项 aria-current=page', () => {
    renderWithI18n(<TabBar label="主导航" items={TABS} activeId="settings" />);
    const nav = screen.getByRole('navigation', { name: '主导航' });
    const current = within(nav).getByRole('link', { current: 'page' });
    expect(current).toHaveAccessibleName('设置');
    expect(current).toHaveAttribute('href', '#/settings');
  });

  it('角标数字同时以可读文本提供给读屏', () => {
    renderWithI18n(<TabBar label="主导航" items={TABS} activeId="quiz" />);
    expect(screen.getByRole('link', { name: /测验/ })).toHaveAccessibleName(/^测验\s?\(3\)$/);
  });

  it('没有匹配的当前项时不显示指示块', () => {
    const { container, rerender } = renderWithI18n(
      <TabBar label="主导航" items={TABS} activeId={null} />,
    );
    expect(screen.queryByRole('link', { current: 'page' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-selection-indicator]')).toBeNull();
    rerender(<TabBar label="主导航" items={TABS} activeId="settings" />);
    expect(container.querySelector('[data-selection-indicator]')).not.toBeNull();
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(<TabBar label="主导航" items={TABS} activeId="quiz" />);
    await expectNoAxeViolations(container);
  });
});

const SECTIONS: readonly SidebarSection<Tab>[] = [
  {
    id: 'learn',
    title: '学习',
    items: [
      { id: 'quiz', label: '测验', href: '#/quiz', icon: <BookOpen />, count: ARCHIVE_COUNT },
    ],
  },
  {
    id: 'app',
    items: [{ id: 'settings', label: '设置', href: '#/settings', icon: <Settings /> }],
  },
];

describe('Sidebar', () => {
  it('分组以标题命名，计数按语言格式化', () => {
    renderWithI18n(
      <Sidebar label="主导航" header="德语词汇" sections={SECTIONS} activeId="quiz" />,
    );
    const group = screen.getByRole('region', { name: '学习' });
    expect(within(group).getByRole('link', { current: 'page' })).toHaveTextContent('1,200');
  });

  it('折叠按钮切换 aria-expanded，收起后链接名称仍完整', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    renderWithI18n(
      <Sidebar
        label="主导航"
        header="德语词汇"
        sections={SECTIONS}
        activeId="quiz"
        onCollapsedChange={onCollapsedChange}
      />,
    );
    const toggle = screen.getByRole('button', { name: '收起侧边栏' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const controlled = toggle.getAttribute('aria-controls');
    expect(controlled).not.toBeNull();
    expect(document.getElementById(controlled ?? '')).not.toBeNull();

    await user.click(toggle);

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    const expand = screen.getByRole('button', { name: '展开侧边栏' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(
      <Sidebar label="主导航" header="德语词汇" sections={SECTIONS} activeId="quiz" />,
    );
    await expectNoAxeViolations(container);
  });
});

describe('NavigationBar', () => {
  it('大标题模式下页面只有一个 h1，且导航栏内的小标题对读屏隐藏', () => {
    renderWithI18n(<NavigationBar title="归档" titleId="page-title" />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('归档');
    expect(headings[0]).toHaveAttribute('id', 'page-title');
  });

  it('普通标题模式下导航栏内的标题即 h1', () => {
    renderWithI18n(<NavigationBar title="设置" largeTitle={false} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('渲染前后操作区', () => {
    renderWithI18n(
      <NavigationBar
        title="词表"
        leading={<button type="button">返回</button>}
        trailing={<button type="button">编辑</button>}
      />,
    );
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
  });
});
