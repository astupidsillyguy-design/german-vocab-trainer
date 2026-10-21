import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderWithI18n } from '../../test/render';
import {
  AccordionGroup,
  Badge,
  Card,
  Disclosure,
  EmptyState,
  ListGroup,
  ListRow,
  ProgressBar,
  Surface,
  Switch,
} from '..';

describe('Surface', () => {
  it('按 as 渲染语义元素，材质与阴影写入 data/CSS 变量', () => {
    renderWithI18n(
      <Surface as="aside" material="thick" elevation={3} aria-label="面板">
        内容
      </Surface>,
    );
    const surface = screen.getByRole('complementary', { name: '面板' });
    expect(surface).toHaveAttribute('data-material', 'thick');
    expect(surface.style.getPropertyValue('--surface-shadow')).toBe('var(--shadow-3)');
  });

  it('不支持原生超椭圆时生成 clip-path 路径；胶囊形不裁剪', () => {
    renderWithI18n(
      <>
        <Surface data-testid="card">卡片</Surface>
        <Surface data-testid="capsule" radius="capsule">
          胶囊
        </Surface>
      </>,
    );
    expect(screen.getByTestId('card').style.getPropertyValue('--surface-clip')).toMatch(
      /^path\('M /,
    );
    expect(screen.getByTestId('capsule')).not.toHaveAttribute('data-squircle');
    expect(screen.getByTestId('capsule').style.getPropertyValue('--surface-clip')).toBe('');
  });
});

describe('Card', () => {
  it('有标题时作为以标题命名的区块', () => {
    renderWithI18n(
      <Card title="今日进度" subtitle="继续加油">
        内容
      </Card>,
    );
    const region = screen.getByRole('region', { name: '今日进度' });
    expect(within(region).getByRole('heading', { level: 2 })).toHaveTextContent('今日进度');
    expect(region).toHaveTextContent('继续加油');
  });

  it('无标题时不产生空地标', () => {
    renderWithI18n(<Card as="div">纯内容</Card>);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

describe('ListGroup / ListRow', () => {
  it('分组以标题命名，三种行各自具有正确语义', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithI18n(
      <ListGroup header="数据">
        <ListRow title="das Haus" titleLang="de" subtitle="房子" />
        <ListRow title="导出" detail="JSON" onAction={onAction} />
        <ListRow title="关于" href="#/settings/about" />
        <ListRow title="自动发音" trailing={<Switch>自动发音</Switch>} />
      </ListGroup>,
    );
    const group = screen.getByRole('region', { name: '数据' });
    expect(within(group).getAllByRole('listitem')).toHaveLength(4);
    expect(within(group).getByText('das Haus')).toHaveAttribute('lang', 'de');

    await user.click(within(group).getByRole('button', { name: /导出/ }));
    expect(onAction).toHaveBeenCalledOnce();

    expect(within(group).getByRole('link', { name: '关于' })).toHaveAttribute(
      'href',
      '#/settings/about',
    );
    expect(within(group).getByRole('switch', { name: '自动发音' })).toBeInTheDocument();
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(
      <ListGroup header="数据" footer="说明文字">
        <ListRow title="导出" onAction={vi.fn()} showChevron />
        <ListRow title="关于" href="#/about" />
      </ListGroup>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('Disclosure', () => {
  it('标题按钮包在语义标题内，点击展开', async () => {
    const user = userEvent.setup();
    renderWithI18n(
      <Disclosure title="第 1 章" subtitle="3 课">
        课时列表
      </Disclosure>,
    );
    const heading = screen.getByRole('heading', { level: 3 });
    const trigger = within(heading).getByRole('button', { name: /第 1 章/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('课时列表')).toBeVisible();
  });

  it('AccordionGroup 默认一次只展开一项', async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    renderWithI18n(
      <AccordionGroup defaultExpandedKeys={['a']} onExpandedChange={onExpandedChange}>
        <Disclosure id="a" title="第 1 章">
          A
        </Disclosure>
        <Disclosure id="b" title="第 2 章">
          B
        </Disclosure>
      </AccordionGroup>,
    );
    const first = screen.getByRole('button', { name: '第 1 章' });
    const second = screen.getByRole('button', { name: '第 2 章' });
    expect(first).toHaveAttribute('aria-expanded', 'true');

    await user.click(second);

    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(onExpandedChange).toHaveBeenLastCalledWith(new Set(['b']));
  });

  it('标题行左右两侧可以放把手、复选框与操作按钮，它们不嵌套在展开按钮内', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithI18n(
      <Disclosure
        title="第 1 讲"
        appearance="inset"
        leading={<button type="button">移动</button>}
        actions={
          <button type="button" onClick={onAction}>
            测本课
          </button>
        }
      >
        词条
      </Disclosure>,
    );
    const trigger = screen.getByRole('button', { name: '第 1 讲' });
    expect(within(trigger).queryByRole('button')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '测本课' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('展开的章节不会让内部收起的课时也显示为展开（展开状态写在各自的箭头与面板上）', () => {
    const { container } = renderWithI18n(
      <Disclosure title="第 1 章" defaultExpanded>
        <Disclosure title="第 1 讲" appearance="inset">
          词条
        </Disclosure>
      </Disclosure>,
    );
    const chevrons = container.querySelectorAll('svg[aria-hidden]');
    const [outer, inner] = [...chevrons].slice(-2);
    expect(outer).toHaveAttribute('data-expanded');
    expect(inner).not.toHaveAttribute('data-expanded');
    expect(screen.getByRole('button', { name: '第 1 讲' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(
      <Disclosure title="第 1 章" defaultExpanded>
        内容
      </Disclosure>,
    );
    await expectNoAxeViolations(container);
  });
});

describe('Badge', () => {
  it('图标仅作装饰，文字承载信息', () => {
    renderWithI18n(
      <Badge tone="success" icon={<svg data-testid="icon" />}>
        已掌握
      </Badge>,
    );
    expect(screen.getByText('已掌握')).toHaveAttribute('data-tone', 'success');
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('ProgressBar', () => {
  it('暴露 progressbar 角色与数值，填充比例写入 CSS 变量', () => {
    const total = 30;
    const done = 12;
    renderWithI18n(
      <ProgressBar label="本轮进度" value={done} maxValue={total} valueLabel="12 / 30" />,
    );
    const bar = screen.getByRole('progressbar', { name: '本轮进度' });
    expect(bar).toHaveAttribute('aria-valuenow', String(done));
    expect(bar).toHaveAttribute('aria-valuemax', String(total));
    expect(bar).toHaveAttribute('aria-valuetext', '12 / 30');
    const fill = bar.querySelector<HTMLElement>('[style*="--progress"]');
    expect(fill?.style.getPropertyValue('--progress')).toBe(String(done / total));
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(<ProgressBar label="进度" value={40} />);
    await expectNoAxeViolations(container);
  });
});

describe('EmptyState', () => {
  it('包含标题、说明与引导操作', () => {
    renderWithI18n(
      <EmptyState
        title="还没有单词"
        description="导入词表后即可开始测验"
        actions={<button type="button">导入词表</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: '还没有单词' })).toBeInTheDocument();
    expect(screen.getByText('导入词表后即可开始测验')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入词表' })).toBeInTheDocument();
  });
});
