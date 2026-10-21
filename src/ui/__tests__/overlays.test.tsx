import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { dragPointer, linearSteps } from '../../test/pointer';
import { renderWithI18n } from '../../test/render';
import { setReducedMotion, setViewportWidth } from '../../test/viewport';
import {
  AlertDialog,
  Button,
  DialogTrigger,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  PopoverTrigger,
  Sheet,
  SheetTrigger,
  ToastQueue,
  ToastRegion,
} from '..';
import { TOAST_TIMEOUT_MS } from '../Toast/toastQueue';

const WIDE_VIEWPORT = 1024;

function renderAlert(tone: 'default' | 'destructive', onConfirm = vi.fn()) {
  renderWithI18n(
    <DialogTrigger>
      <Button>删除单词</Button>
      <AlertDialog title="删除这个单词？" confirmLabel="删除" tone={tone} onConfirm={onConfirm}>
        此操作可以在快照历史中撤销。
      </AlertDialog>
    </DialogTrigger>,
  );
  return onConfirm;
}

describe('AlertDialog', () => {
  it('以 alertdialog 角色打开，标题即名称', async () => {
    const user = userEvent.setup();
    renderAlert('default');
    await user.click(screen.getByRole('button', { name: '删除单词' }));
    expect(screen.getByRole('alertdialog', { name: '删除这个单词？' })).toBeInTheDocument();
  });

  it('破坏性操作默认聚焦“取消”，普通操作默认聚焦确认', async () => {
    const user = userEvent.setup();
    renderAlert('destructive');
    await user.click(screen.getByRole('button', { name: '删除单词' }));
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
  });

  it('普通操作默认聚焦确认按钮', async () => {
    const user = userEvent.setup();
    renderAlert('default');
    await user.click(screen.getByRole('button', { name: '删除单词' }));
    expect(screen.getByRole('button', { name: '删除' })).toHaveFocus();
  });

  it('Esc 关闭且不确认，焦点回到触发按钮', async () => {
    const user = userEvent.setup();
    const onConfirm = renderAlert('destructive');
    const trigger = screen.getByRole('button', { name: '删除单词' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('点击确认后回调并关闭', async () => {
    const user = userEvent.setup();
    const onConfirm = renderAlert('destructive');
    await user.click(screen.getByRole('button', { name: '删除单词' }));
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('触发按钮随确认的操作一起消失时，焦点交给 fallbackFocus 而不是回到页面开头', async () => {
    const user = userEvent.setup();
    renderWithI18n(<DeletableWords />);
    await user.click(screen.getByRole('button', { name: '删除甲' }));
    await user.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '删除乙' })).toHaveFocus();
    });
  });

  it('触发按钮仍在时照常把焦点还给它，不调用 fallbackFocus', async () => {
    const user = userEvent.setup();
    const fallbackFocus = vi.fn(() => null);
    renderWithI18n(<DeletableWords fallbackFocus={fallbackFocus} />);
    const trigger = screen.getByRole('button', { name: '删除甲' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(fallbackFocus).not.toHaveBeenCalled();
  });

  it('无障碍检查通过', async () => {
    const user = userEvent.setup();
    renderAlert('destructive');
    await user.click(screen.getByRole('button', { name: '删除单词' }));
    await expectNoAxeViolations(document.body);
  });
});

function DeletableWords({
  fallbackFocus = () => document.querySelector<HTMLElement>('[data-word]'),
}: {
  readonly fallbackFocus?: () => HTMLElement | null;
}) {
  const [words, setWords] = useState(['甲', '乙']);
  const [target, setTarget] = useState<string | null>(null);
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      {words.map((word) => (
        <Button
          key={word}
          data-word={word}
          onPress={() => {
            setTarget(word);
            setOpen(true);
          }}
        >
          {`删除${word}`}
        </Button>
      ))}
      <AlertDialog
        isOpen={isOpen}
        onOpenChange={setOpen}
        title="删除这个单词？"
        confirmLabel="删除"
        tone="destructive"
        onConfirm={() => {
          setWords((current) => current.filter((word) => word !== target));
        }}
        fallbackFocus={fallbackFocus}
      >
        删除后可以撤销。
      </AlertDialog>
    </>
  );
}

function renderSheet() {
  renderWithI18n(
    <SheetTrigger>
      <Button>同步</Button>
      <Sheet title="设备同步">
        <p>扫码或输入配对码</p>
      </Sheet>
    </SheetTrigger>,
  );
}

describe('Sheet', () => {
  it('以标题命名的模态对话框打开', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '同步' }));
    const dialog = screen.getByRole('dialog', { name: '设备同步' });
    expect(within(dialog).getByText('扫码或输入配对码')).toBeInTheDocument();
  });

  it('手机尺寸下从底部升起，把手按钮在中档与大档间切换', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '同步' }));
    const handle = screen.getByRole('button', { name: '调整面板高度' });
    expect(handle).toHaveAttribute('aria-expanded', 'false');
    await user.click(handle);
    expect(handle).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Enter}');
    expect(handle).toHaveAttribute('aria-expanded', 'false');
  });

  it('拖动标题栏：上拉切到全屏档，向下甩出即关闭', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '同步' }));
    const handle = screen.getByRole('button', { name: '调整面板高度' });
    const title = screen.getByRole('heading', { name: '设备同步' });
    dragPointer(title, linearSteps({ x: 0, y: 300, t: 0 }, { x: 0, y: 200 }, 4, 16));
    expect(handle).toHaveAttribute('aria-expanded', 'true');
    dragPointer(title, linearSteps({ x: 0, y: 200, t: 1000 }, { x: 0, y: 800 }, 4, 16));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('不可关闭的面板下滑不会关闭，回到停靠位', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    renderWithI18n(
      <SheetTrigger>
        <Button>同步</Button>
        <Sheet title="设备同步" isDismissable={false}>
          <p>扫码或输入配对码</p>
        </Sheet>
      </SheetTrigger>,
    );
    await user.click(screen.getByRole('button', { name: '同步' }));
    const dialog = screen.getByRole('dialog', { name: '设备同步' });
    dragPointer(
      screen.getByRole('heading', { name: '设备同步' }),
      linearSteps({ x: 0, y: 200, t: 0 }, { x: 0, y: 800 }, 4, 16),
    );
    expect(dialog).toBeInTheDocument();
    expect(dialog.closest('[data-presentation]')).not.toHaveAttribute('data-dragging');
  });

  it('宽屏下居中呈现，没有把手', async () => {
    setViewportWidth(WIDE_VIEWPORT);
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '同步' }));
    expect(screen.getByRole('dialog', { name: '设备同步' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '调整面板高度' })).not.toBeInTheDocument();
  });

  it('关闭按钮关闭面板并把焦点还给触发按钮', async () => {
    const user = userEvent.setup();
    renderSheet();
    const trigger = screen.getByRole('button', { name: '同步' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('无障碍检查通过', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('button', { name: '同步' }));
    await expectNoAxeViolations(document.body);
  });
});

describe('Menu', () => {
  it('以触发按钮命名，菜单项可用方向键选择，回车触发', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithI18n(
      <MenuTrigger>
        <Button>更多</Button>
        <Menu onAction={onAction}>
          <MenuItem id="edit">编辑</MenuItem>
          <MenuItem id="delete" isDestructive>
            删除
          </MenuItem>
        </Menu>
      </MenuTrigger>,
    );
    await user.tab();
    await user.keyboard('{ArrowDown}');
    const menu = screen.getByRole('menu', { name: '更多' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveFocus();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction.mock.lastCall?.[0]).toBe('delete');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '更多' })).toHaveFocus();
    });
  });
});

describe('Popover', () => {
  it('有标题时以标题命名，Esc 关闭并还原焦点', async () => {
    const user = userEvent.setup();
    renderWithI18n(
      <PopoverTrigger>
        <Button>说明</Button>
        <Popover title="判分规则">名词必须带冠词。</Popover>
      </PopoverTrigger>,
    );
    const trigger = screen.getByRole('button', { name: '说明' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: '判分规则' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});

describe('ToastRegion', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('在带名称的通知区域内以 polite 播报', () => {
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已导入 120 个单词' });
    });
    const region = screen.getByRole('region', { name: '通知' });
    expect(within(region).getByRole('list')).toHaveAttribute('aria-live', 'polite');
    expect(within(region).getByText('已导入 120 个单词')).toBeInTheDocument();
  });

  it('错误通知使用 role=alert 立即播报', () => {
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '导入失败', tone: 'danger' });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('导入失败');
  });

  it('关闭按钮移除通知', async () => {
    const user = userEvent.setup();
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已保存', timeoutMs: null });
    });
    await user.click(screen.getByRole('button', { name: '关闭通知' }));
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  });

  it('操作按钮触发回调并关闭通知', async () => {
    const user = userEvent.setup();
    const queue = new ToastQueue();
    const onAction = vi.fn();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已删除', action: { label: '撤销', onAction } });
    });
    await user.click(screen.getByRole('button', { name: '撤销' }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByText('已删除')).not.toBeInTheDocument();
  });

  it('到时自动消失', () => {
    vi.useFakeTimers();
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已保存' });
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS - 1);
    });
    expect(screen.getByText('已保存')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  });

  it('指针悬停时暂停计时，离开后只计剩余时间', () => {
    vi.useFakeTimers();
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已保存' });
    });
    const region = screen.getByRole('region', { name: '通知' });
    const half = TOAST_TIMEOUT_MS / 2;

    act(() => {
      vi.advanceTimersByTime(half);
    });
    fireEvent.pointerEnter(region);
    act(() => {
      vi.advanceTimersByTime(TOAST_TIMEOUT_MS * 2);
    });
    expect(screen.getByText('已保存')).toBeInTheDocument();

    fireEvent.pointerLeave(region);
    act(() => {
      vi.advanceTimersByTime(half);
    });
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  });

  it('手机上位于顶部，平板与桌面位于右下角', () => {
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    const region = screen.getByRole('region', { name: '通知' });
    expect(region).toHaveAttribute('data-placement', 'top');
    act(() => {
      setViewportWidth(WIDE_VIEWPORT);
    });
    expect(region).toHaveAttribute('data-placement', 'bottom-end');
  });

  it('关闭时先播完退场动画再移除；退场期间不可交互，也不再以 alert 播报', async () => {
    Object.defineProperty(Element.prototype, 'getAnimations', {
      value: () => [{}],
      configurable: true,
    });
    try {
      const user = userEvent.setup();
      const queue = new ToastQueue();
      renderWithI18n(<ToastRegion queue={queue} />);
      act(() => {
        queue.show({ title: '导入失败', tone: 'danger', timeoutMs: null });
      });
      await user.click(screen.getByRole('button', { name: '关闭通知' }));
      const item = screen.getByText('导入失败').closest('li');
      if (item === null) throw new Error('缺少通知项');
      expect(item).toHaveAttribute('data-exiting');
      expect(item).toHaveAttribute('inert');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      // 子元素冒泡上来的动画结束事件不算
      fireEvent.animationEnd(screen.getByText('导入失败'));
      expect(item).toBeInTheDocument();
      fireEvent.animationEnd(item);
      expect(screen.queryByText('导入失败')).not.toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(Element.prototype, 'getAnimations');
    }
  });

  it('手机上向上滑动关闭；反方向拖动有阻力，松手弹回', () => {
    setReducedMotion(true);
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已保存', timeoutMs: null });
    });
    const title = screen.getByText('已保存');
    dragPointer(title, linearSteps({ x: 0, y: 40, t: 0 }, { x: 0, y: 120 }, 4, 16));
    expect(screen.getByText('已保存')).toBeInTheDocument();
    dragPointer(title, linearSteps({ x: 0, y: 120, t: 1000 }, { x: 0, y: 20 }, 4, 16));
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  });

  it('宽屏下向右滑走关闭；从按钮上开始拖动不算滑动', async () => {
    setViewportWidth(WIDE_VIEWPORT);
    setReducedMotion(true);
    const user = userEvent.setup();
    const queue = new ToastQueue();
    renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已保存', timeoutMs: null });
    });
    const close = screen.getByRole('button', { name: '关闭通知' });
    dragPointer(close, linearSteps({ x: 0, y: 0, t: 0 }, { x: 200, y: 0 }, 4, 16));
    expect(screen.getByText('已保存')).toBeInTheDocument();
    // 指针移出按钮后松开，不算点击
    await user.pointer({ keys: '[/MouseLeft]', target: document.body });
    dragPointer(
      screen.getByText('已保存'),
      linearSteps({ x: 0, y: 0, t: 1000 }, { x: 200, y: 0 }, 4, 16),
    );
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  });

  it('无障碍检查通过', async () => {
    const queue = new ToastQueue();
    const { container } = renderWithI18n(<ToastRegion queue={queue} />);
    act(() => {
      queue.show({ title: '已保存', action: { label: '撤销', onAction: vi.fn() } });
      queue.show({ title: '失败', tone: 'danger' });
    });
    await expectNoAxeViolations(container);
  });
});
