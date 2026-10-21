import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLASS_MOTION_EVENT } from '../../glass';
import { dispatchPointer, dragPointer, linearSteps } from '../../test/pointer';
import { renderWithI18n } from '../../test/render';
import { setReducedMotion } from '../../test/viewport';
import {
  Button,
  notifyGlassMotion,
  SegmentedControl,
  Sidebar,
  Switch,
  TabBar,
  useDrag,
  usePresenceList,
  useReducedMotion,
  type DragOptions,
  type SegmentedItem,
  type SidebarSection,
  type TabBarItem,
} from '..';

const SETTLE_TIMEOUT_MS = 4000;

function ReducedMotionProbe() {
  return <output>{useReducedMotion() ? 'reduce' : 'full'}</output>;
}

describe('useReducedMotion', () => {
  it('读取系统设置，并在设置变化时实时更新', () => {
    render(<ReducedMotionProbe />);
    expect(screen.getByRole('status')).toHaveTextContent('full');
    act(() => {
      setReducedMotion(true);
    });
    expect(screen.getByRole('status')).toHaveTextContent('reduce');
  });
});

interface Item {
  readonly id: string;
}

function PresenceProbe({ items }: { readonly items: readonly Item[] }) {
  const { entries, onExited } = usePresenceList(items, (item) => item.id);
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.key} data-state={entry.state}>
          {entry.key}
          <button
            type="button"
            onClick={() => {
              onExited(entry.key);
            }}
          >
            {`完成 ${entry.key}`}
          </button>
        </li>
      ))}
    </ul>
  );
}

describe('usePresenceList', () => {
  it('被移除的项先保留为 exiting，播完退场后才真正移除；重新加入时恢复', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PresenceProbe items={[{ id: 'a' }, { id: 'b' }]} />);
    rerender(<PresenceProbe items={[{ id: 'b' }]} />);
    expect(screen.getByText('a').closest('li')).toHaveAttribute('data-state', 'exiting');
    expect(screen.getByText('b').closest('li')).toHaveAttribute('data-state', 'present');

    rerender(<PresenceProbe items={[{ id: 'a' }, { id: 'b' }]} />);
    expect(screen.getByText('a').closest('li')).toHaveAttribute('data-state', 'present');

    rerender(<PresenceProbe items={[{ id: 'b' }]} />);
    await user.click(screen.getByRole('button', { name: '完成 a' }));
    expect(screen.queryByText('a')).not.toBeInTheDocument();
  });
});

interface DragProbeProps extends DragOptions {
  readonly onClick?: () => void;
  readonly onControls?: (didDrag: () => boolean) => void;
}

function DragProbe({ onClick, onControls, ...options }: DragProbeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useDrag(ref, options);
  onControls?.(controls.didDrag);
  return (
    <div ref={ref} data-testid="surface">
      <button type="button" onClick={onClick}>
        目标
      </button>
    </div>
  );
}

describe('useDrag', () => {
  it('未超过阈值时仍是点按：不触发拖动，点击照常', () => {
    const onStart = vi.fn();
    const onClick = vi.fn();
    render(<DragProbe onStart={onStart} onClick={onClick} />);
    const surface = screen.getByTestId('surface');
    dragPointer(surface, [
      { x: 0, y: 0, t: 0 },
      { x: 4, y: 0, t: 16 },
    ]);
    fireEvent.click(screen.getByRole('button', { name: '目标' }));
    expect(onStart).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('超过阈值后激活：位移从激活点算起，松手时报告速度', () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    render(<DragProbe axis="x" onStart={onStart} onMove={onMove} onEnd={onEnd} />);
    dragPointer(screen.getByTestId('surface'), [
      { x: 0, y: 0, t: 0 },
      { x: 20, y: 0, t: 10 },
      { x: 40, y: 0, t: 20 },
      { x: 60, y: 0, t: 30 },
    ]);
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0]?.[0]).toMatchObject({ offset: { x: 0, y: 0 } });
    expect(onMove.mock.calls.at(-1)?.[0]).toMatchObject({ offset: { x: 40, y: 0 } });
    const end = onEnd.mock.calls[0]?.[0] as { velocity: { x: number; y: number } };
    // 每 10ms 移动 20px → 2000px/s
    expect(end.velocity.x).toBeCloseTo(2000, -2);
    expect(end.velocity.y).toBe(0);
  });

  it('停顿后再松手，速度为 0（不会被“甩”出去）', () => {
    const onEnd = vi.fn();
    render(<DragProbe onEnd={onEnd} />);
    const surface = screen.getByTestId('surface');
    dispatchPointer('pointerDown', surface, { x: 0, y: 0, t: 0 });
    dispatchPointer('pointerMove', window, { x: 40, y: 0, t: 16 });
    dispatchPointer('pointerUp', window, { x: 40, y: 0, t: 400 });
    const end = onEnd.mock.calls[0]?.[0] as { velocity: { x: number } };
    expect(end.velocity.x).toBe(0);
  });

  it('锁定横向时，先纵向移动则放弃（交给页面滚动）', () => {
    const onStart = vi.fn();
    render(<DragProbe axis="x" onStart={onStart} />);
    dragPointer(screen.getByTestId('surface'), [
      { x: 0, y: 0, t: 0 },
      { x: 2, y: 12, t: 16 },
      { x: 40, y: 12, t: 32 },
    ]);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('拖动后迟到的点击被吞掉，didDrag 持续到该点击为止', async () => {
    const onClick = vi.fn();
    let didDrag: () => boolean = () => false;
    render(
      <DragProbe
        onClick={onClick}
        onControls={(read) => {
          didDrag = read;
        }}
      />,
    );
    dragPointer(
      screen.getByTestId('surface'),
      linearSteps({ x: 0, y: 0, t: 0 }, { x: 60, y: 0 }, 4, 16),
    );
    expect(didDrag()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '目标' }));
    expect(onClick).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(didDrag()).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: '目标' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('忽略非主键、非主指针、禁用状态与 shouldStart 拒绝的按下', () => {
    const onStart = vi.fn();
    const steps = linearSteps({ x: 0, y: 0, t: 0 }, { x: 60, y: 0 }, 4, 16);
    const { rerender } = render(<DragProbe onStart={onStart} />);
    const surface = screen.getByTestId('surface');
    dragPointer(surface, steps, { button: 2 });
    dragPointer(surface, steps, { isPrimary: false });
    rerender(<DragProbe onStart={onStart} isDisabled />);
    dragPointer(surface, steps);
    rerender(<DragProbe onStart={onStart} shouldStart={() => false} />);
    dragPointer(surface, steps);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('跟踪期间阻止链接的原生拖放（否则浏览器会取消指针），其余时候不干预', () => {
    render(<DragProbe />);
    const surface = screen.getByTestId('surface');
    expect(fireEvent.dragStart(surface)).toBe(true);
    dispatchPointer('pointerDown', surface, { x: 0, y: 0, t: 0 });
    expect(fireEvent.dragStart(surface)).toBe(false);
    dispatchPointer('pointerUp', window, { x: 0, y: 0, t: 16 });
    expect(fireEvent.dragStart(surface)).toBe(true);
  });

  it('只跟踪按下的那根手指；系统取消时回调 onCancel', () => {
    const onMove = vi.fn();
    const onCancel = vi.fn();
    const onEnd = vi.fn();
    render(<DragProbe onMove={onMove} onCancel={onCancel} onEnd={onEnd} />);
    const surface = screen.getByTestId('surface');
    dispatchPointer('pointerDown', surface, { x: 0, y: 0, t: 0 });
    dispatchPointer('pointerMove', window, { x: 40, y: 0, t: 16 }, { pointerId: 7 });
    expect(onMove).not.toHaveBeenCalled();
    dispatchPointer('pointerMove', window, { x: 40, y: 0, t: 32 });
    dispatchPointer('pointerCancel', window, { x: 40, y: 0, t: 48 });
    expect(onMove).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onEnd).not.toHaveBeenCalled();
  });
});

describe('notifyGlassMotion', () => {
  it('派发冒泡事件，通知所在的玻璃组重绘', () => {
    render(
      <div data-testid="group">
        <span data-testid="shape" />
      </div>,
    );
    const listener = vi.fn();
    screen.getByTestId('group').addEventListener(GLASS_MOTION_EVENT, listener);
    notifyGlassMotion(screen.getByTestId('shape'));
    notifyGlassMotion(null);
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe('按压缩放', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('按下时以弹簧放大（玻璃按钮），松开后回到原大小并清除样式', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Button>开始测验</Button>);
    const button = screen.getByRole('button', { name: '开始测验' });
    const motion = vi.fn();
    button.addEventListener(GLASS_MOTION_EVENT, motion);
    await user.pointer({ keys: '[MouseLeft>]', target: button });
    await waitFor(() => {
      expect(Number(button.style.scale)).toBeGreaterThan(1);
    });
    expect(motion).toHaveBeenCalled();
    await user.pointer({ keys: '[/MouseLeft]', target: button });
    await waitFor(
      () => {
        expect(button.style.scale).toBe('');
      },
      { timeout: SETTLE_TIMEOUT_MS },
    );
  });

  it('实心按钮按下时缩小', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Button variant="filled">保存</Button>);
    const button = screen.getByRole('button', { name: '保存' });
    await user.pointer({ keys: '[MouseLeft>]', target: button });
    await waitFor(() => {
      expect(button.style.scale).not.toBe('');
      expect(Number(button.style.scale)).toBeLessThan(1);
    });
  });

  it('减少动态效果时不缩放', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    renderWithI18n(<Button>开始测验</Button>);
    const button = screen.getByRole('button', { name: '开始测验' });
    await user.pointer({ keys: '[MouseLeft>]', target: button });
    await new Promise((resolve) => {
      window.setTimeout(resolve, 100);
    });
    expect(button.style.scale).toBe('');
  });
});

type Direction = 'de-zh' | 'zh-de' | 'mixed';
const DIRECTIONS: readonly SegmentedItem<Direction>[] = [
  { id: 'de-zh', label: '德→中' },
  { id: 'zh-de', label: '中→德' },
  { id: 'mixed', label: '混合' },
];

function Segments({ onChange }: { readonly onChange: (key: Direction) => void }) {
  const [selected, setSelected] = useState<Direction>('de-zh');
  return (
    <SegmentedControl
      label="测验方向"
      items={DIRECTIONS}
      selectedKey={selected}
      onSelectionChange={(key) => {
        onChange(key);
        setSelected(key);
      }}
    />
  );
}

describe('选中指示块拖动', () => {
  it('分段控件：按住选中块拖到最后一段，松手即选中（只触发一次）', () => {
    setReducedMotion(true);
    const onChange = vi.fn();
    renderWithI18n(<Segments onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: '测验方向' });
    dragPointer(
      screen.getByRole('radio', { name: '德→中' }),
      linearSteps({ x: 0, y: 0, t: 0 }, { x: 40, y: 0 }, 4, 16),
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('mixed');
    expect(screen.getByRole('radio', { name: '混合' })).toBeChecked();
    expect(group.style.getPropertyValue('--selection-position')).toBe('2');
    expect(group).not.toHaveAttribute('data-dragging');
  });

  it('拖动期间指示块鼓起并标记 data-dragging', () => {
    setReducedMotion(true);
    renderWithI18n(<Segments onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: '测验方向' });
    dispatchPointer('pointerDown', screen.getByRole('radio', { name: '德→中' }), {
      x: 0,
      y: 0,
      t: 0,
    });
    dispatchPointer('pointerMove', window, { x: 20, y: 0, t: 16 });
    expect(group).toHaveAttribute('data-dragging');
    expect(Number(group.style.getPropertyValue('--selection-lift'))).toBeGreaterThan(1);
    dispatchPointer('pointerCancel', window, { x: 20, y: 0, t: 32 });
    expect(group).not.toHaveAttribute('data-dragging');
    expect(group.style.getPropertyValue('--selection-position')).toBe('0');
  });

  it('Tab Bar：拖到另一项松手，等同点击该项的链接', () => {
    setReducedMotion(true);
    const items: readonly TabBarItem<'quiz' | 'settings'>[] = [
      { id: 'quiz', label: '测验', href: '#/quiz', icon: null },
      { id: 'settings', label: '设置', href: '#/settings', icon: null },
    ];
    renderWithI18n(<TabBar label="主导航" items={items} activeId="quiz" placement="inline" />);
    const target = screen.getByRole('link', { name: '设置' });
    const onClick = vi.fn((event: MouseEvent) => {
      event.preventDefault();
    });
    target.addEventListener('click', onClick);
    dragPointer(
      screen.getByRole('link', { name: '测验' }),
      linearSteps({ x: 0, y: 0, t: 0 }, { x: 40, y: 0 }, 4, 16),
    );
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('Switch 拖动', () => {
  it('按住滑块拖到另一侧，松手时切换（label 的迟到点击不会再切回去）', () => {
    setReducedMotion(true);
    const onChange = vi.fn();
    const { container } = renderWithI18n(<Switch onChange={onChange}>自动发音</Switch>);
    const track = container.querySelector('[aria-hidden="true"]');
    if (!(track instanceof HTMLElement)) throw new Error('缺少轨道');
    dragPointer(track, linearSteps({ x: 0, y: 0, t: 0 }, { x: 30, y: 0 }, 3, 16));
    fireEvent.click(track);
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch', { name: '自动发音' })).toBeChecked();
  });

  it('拖动距离不足一半时松手，弹回原位不切换', () => {
    setReducedMotion(true);
    const onChange = vi.fn();
    const { container } = renderWithI18n(
      <Switch onChange={onChange} defaultSelected>
        自动发音
      </Switch>,
    );
    const track = container.querySelector('[aria-hidden="true"]');
    if (!(track instanceof HTMLElement)) throw new Error('缺少轨道');
    const label = track.closest('label');
    // 向“关”的方向拖，但随后回到起点再停顿松手
    dispatchPointer('pointerDown', track, { x: 0, y: 0, t: 0 });
    dispatchPointer('pointerMove', window, { x: -20, y: 0, t: 16 });
    dispatchPointer('pointerMove', window, { x: 0, y: 0, t: 32 });
    dispatchPointer('pointerUp', window, { x: 0, y: 0, t: 400 });
    expect(onChange).not.toHaveBeenCalled();
    expect(label?.style.getPropertyValue('--switch-position')).toBe('1');
  });
});

const SECTIONS: readonly SidebarSection<'quiz' | 'settings'>[] = [
  {
    id: 'main',
    items: [
      { id: 'quiz', label: '测验', href: '#/quiz', icon: null },
      { id: 'settings', label: '设置', href: '#/settings', icon: null },
    ],
  },
];

describe('Sidebar 指示块', () => {
  it('没有当前页时隐藏，有当前页时显示', () => {
    const { container, rerender } = renderWithI18n(
      <Sidebar label="主导航" header="德语词汇" sections={SECTIONS} activeId={null} />,
    );
    const indicator = container.querySelector('[data-selection-indicator]');
    expect(indicator).toHaveAttribute('data-hidden');
    rerender(<Sidebar label="主导航" header="德语词汇" sections={SECTIONS} activeId="settings" />);
    expect(indicator).not.toHaveAttribute('data-hidden');
  });
});
