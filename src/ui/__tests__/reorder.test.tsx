import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gesture } from '../../design/tokens';
import { expectNoAxeViolations } from '../../test/axe';
import { dispatchPointer, dragPointer, linearSteps } from '../../test/pointer';
import { ANNOUNCE_DELAY_MS, announce } from '../a11y/announce';
import { useDoublePress } from '../hooks/useDoublePress';
import { ReorderHandle } from '../Reorder/ReorderHandle';
import {
  autoScrollSpeed,
  dropIndex,
  keyboardTarget,
  REORDER_STATE_ATTRIBUTE,
  REORDERING_ATTRIBUTE,
} from '../Reorder/reorderGesture';
import { useReorder } from '../Reorder/useReorder';

/** 测试布局：每项高 50，间距 10 */
const ITEM_HEIGHT = 50;
const ITEM_PITCH = 60;
const VIEWPORT_HEIGHT = 800;

describe('keyboardTarget', () => {
  it('上下方向键移动一位，Home / End 移到两端，越界时停在原处', () => {
    expect(keyboardTarget('ArrowDown', 0, 3)).toBe(1);
    expect(keyboardTarget('ArrowUp', 2, 3)).toBe(1);
    expect(keyboardTarget('ArrowUp', 0, 3)).toBe(0);
    expect(keyboardTarget('ArrowDown', 2, 3)).toBe(2);
    expect(keyboardTarget('Home', 2, 3)).toBe(0);
    expect(keyboardTarget('End', 0, 3)).toBe(2);
  });

  it('其他按键不处理', () => {
    expect(keyboardTarget('Enter', 1, 3)).toBeNull();
    expect(keyboardTarget('ArrowLeft', 1, 3)).toBeNull();
  });
});

describe('dropIndex', () => {
  const layout = {
    tops: [0, ITEM_PITCH, ITEM_PITCH * 2],
    heights: [ITEM_HEIGHT, ITEM_HEIGHT, ITEM_HEIGHT],
  };

  it('下边缘越过下一项的中线才换位', () => {
    const midline = ITEM_PITCH + ITEM_HEIGHT / 2;
    expect(dropIndex(layout, 0, midline - ITEM_HEIGHT)).toBe(0);
    expect(dropIndex(layout, 0, midline - ITEM_HEIGHT + 1)).toBe(1);
    expect(dropIndex(layout, 0, ITEM_PITCH * 2)).toBe(2);
  });

  it('向上拖时看上边缘', () => {
    const midline = ITEM_PITCH + ITEM_HEIGHT / 2;
    expect(dropIndex(layout, 2, midline - ITEM_PITCH * 2)).toBe(2);
    expect(dropIndex(layout, 2, midline - ITEM_PITCH * 2 - 1)).toBe(1);
    expect(dropIndex(layout, 2, -ITEM_PITCH * 2)).toBe(0);
  });
});

describe('autoScrollSpeed', () => {
  const edge = gesture.autoScrollEdgePx;

  it('只在靠近视口上下边缘时滚动，越靠近越快', () => {
    expect(autoScrollSpeed(VIEWPORT_HEIGHT / 2, VIEWPORT_HEIGHT)).toBe(0);
    expect(autoScrollSpeed(edge / 2, VIEWPORT_HEIGHT)).toBeCloseTo(-gesture.autoScrollMaxSpeed / 2);
    expect(autoScrollSpeed(0, VIEWPORT_HEIGHT)).toBe(-gesture.autoScrollMaxSpeed);
    expect(autoScrollSpeed(VIEWPORT_HEIGHT - edge / 2, VIEWPORT_HEIGHT)).toBeCloseTo(
      gesture.autoScrollMaxSpeed / 2,
    );
  });

  it('指针移出视口时不超过最高速度', () => {
    expect(autoScrollSpeed(VIEWPORT_HEIGHT * 2, VIEWPORT_HEIGHT)).toBe(gesture.autoScrollMaxSpeed);
  });
});

const NAMES = ['甲', '乙', '丙'];

function SortableList({ onMove }: { readonly onMove?: (from: number, to: number) => void }) {
  const [items, setItems] = useState(NAMES);
  const reorder = useReorder({
    count: items.length,
    onMove: (from, to) => {
      onMove?.(from, to);
      setItems((current) => {
        const next = [...current];
        const [moved] = next.splice(from, 1);
        if (moved !== undefined) next.splice(to, 0, moved);
        return next;
      });
    },
  });
  return (
    <>
      <span id="hint" hidden>
        用方向键调整顺序
      </span>
      <ul>
        {items.map((item, index) => (
          <li key={item} ref={reorder.itemRef(index)} data-testid={`item-${item}`}>
            {item}
            <ReorderHandle
              {...reorder.handleProps(index)}
              label={`移动${item}`}
              describedBy="hint"
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function itemTexts(): string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent);
}

/** jsdom 没有布局：按位置给每一项一个固定的矩形 */
function mockLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const item = this.closest('li');
    const index = item === null ? 0 : [...(item.parentElement?.children ?? [])].indexOf(item);
    const translate = Number.parseFloat(item?.style.translate ?? '') || 0;
    const top = index * ITEM_PITCH + translate;
    return DOMRect.fromRect({ x: 0, y: top, width: VIEWPORT_HEIGHT, height: ITEM_HEIGHT });
  });
}

describe('useReorder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('把手是带说明与快捷键的按钮，无障碍检查通过', async () => {
    const { container } = render(<SortableList />);
    const handle = screen.getByRole('button', { name: '移动甲' });
    expect(handle).toHaveAccessibleDescription('用方向键调整顺序');
    expect(handle).toHaveAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Home End');
    await expectNoAxeViolations(container);
  });

  it('方向键逐位移动，Home / End 移到两端，焦点始终留在被移动项的把手上', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<SortableList onMove={onMove} />);
    screen.getByRole('button', { name: '移动甲' }).focus();

    await user.keyboard('{ArrowDown}');
    expect(itemTexts()).toEqual(['乙', '甲', '丙']);
    expect(screen.getByRole('button', { name: '移动甲' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(itemTexts()).toEqual(['乙', '丙', '甲']);
    await user.keyboard('{Home}');
    expect(itemTexts()).toEqual(['甲', '乙', '丙']);
    expect(screen.getByRole('button', { name: '移动甲' })).toHaveFocus();
    expect(onMove.mock.calls).toEqual([
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
  });

  it('已在最前时按上方向键不移动，也不滚动页面', () => {
    const onMove = vi.fn();
    render(<SortableList onMove={onMove} />);
    const handle = screen.getByRole('button', { name: '移动甲' });
    const event = fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(event).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('拖过下一项的中线后松手即换位；拖动期间被拖项浮起、其余让位', () => {
    mockLayout();
    const onMove = vi.fn();
    render(<SortableList onMove={onMove} />);
    const handle = screen.getByRole('button', { name: '移动甲' });
    const start = { x: 10, y: ITEM_HEIGHT / 2, t: 0 };
    const steps = linearSteps(start, { x: 10, y: start.y + ITEM_PITCH + ITEM_HEIGHT / 2 }, 6, 16);
    const [first, ...moves] = steps;
    if (first === undefined) throw new Error('缺少起点');

    dispatchPointer('pointerDown', handle, first, { pointerType: 'mouse' });
    for (const step of moves)
      dispatchPointer('pointerMove', window, step, { pointerType: 'mouse' });
    expect(screen.getByTestId('item-甲')).toHaveAttribute(REORDER_STATE_ATTRIBUTE, 'lifted');
    expect(screen.getByTestId('item-乙')).toHaveAttribute(REORDER_STATE_ATTRIBUTE, 'shifting');
    expect(document.documentElement).toHaveAttribute(REORDERING_ATTRIBUTE);

    act(() => {
      dispatchPointer('pointerUp', window, moves.at(-1) ?? first, { pointerType: 'mouse' });
    });
    expect(onMove).toHaveBeenCalledWith(0, 1);
    expect(itemTexts()).toEqual(['乙', '甲', '丙']);
    expect(document.documentElement).not.toHaveAttribute(REORDERING_ATTRIBUTE);
    // 没有过渡（jsdom）时归位状态立即清除
    expect(screen.getByTestId('item-甲')).not.toHaveAttribute(REORDER_STATE_ATTRIBUTE);
  });

  it('移动距离不足阈值时只是一次点按，不会开始拖动', () => {
    mockLayout();
    const onMove = vi.fn();
    render(<SortableList onMove={onMove} />);
    const handle = screen.getByRole('button', { name: '移动甲' });
    dragPointer(handle, [
      { x: 10, y: 10, t: 0 },
      { x: 10, y: 10 + gesture.dragThresholdPx / 2, t: 16 },
    ]);
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByTestId('item-甲')).not.toHaveAttribute(REORDER_STATE_ATTRIBUTE);
  });

  it('拖动中按 Esc 放弃，所有项回到原位', () => {
    mockLayout();
    const onMove = vi.fn();
    render(<SortableList onMove={onMove} />);
    const handle = screen.getByRole('button', { name: '移动甲' });
    dispatchPointer('pointerDown', handle, { x: 10, y: 10, t: 0 }, { pointerType: 'mouse' });
    dispatchPointer(
      'pointerMove',
      window,
      { x: 10, y: 10 + ITEM_PITCH * 2, t: 16 },
      {
        pointerType: 'mouse',
      },
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    dispatchPointer(
      'pointerUp',
      window,
      { x: 10, y: 10 + ITEM_PITCH * 2, t: 32 },
      {
        pointerType: 'mouse',
      },
    );
    expect(onMove).not.toHaveBeenCalled();
    expect(itemTexts()).toEqual(NAMES);
    expect(screen.getByTestId('item-甲').style.translate).toBe('');
  });
});

describe('announce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('通过礼貌模式的 live region 播报；同一句话再次播报时先清空', () => {
    vi.useFakeTimers();
    announce('已移到第 2 位');
    const region = document.querySelector('[aria-live="polite"][data-announcer]');
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent('');
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });
    expect(region).toHaveTextContent('已移到第 2 位');

    announce('已移到第 2 位');
    expect(region).toHaveTextContent('');
    act(() => {
      vi.advanceTimersByTime(ANNOUNCE_DELAY_MS);
    });
    expect(region).toHaveTextContent('已移到第 2 位');
    expect(document.querySelectorAll('[data-announcer]')).toHaveLength(1);
  });
});

function DoublePressRow({
  onDoublePress,
  isDisabled = false,
}: {
  readonly onDoublePress: () => void;
  readonly isDisabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDoublePress(ref, onDoublePress, { isDisabled });
  return (
    <div ref={ref} data-testid="row">
      der Schrank
      <button type="button">朗读</button>
    </div>
  );
}

function press(target: Element, t: number, x = 10): void {
  dispatchPointer('pointerDown', target, { x, y: 10, t });
  dispatchPointer('pointerUp', target, { x, y: 10, t: t + 1 });
}

describe('useDoublePress', () => {
  it('间隔与位移都在范围内的两次按压才算双击', () => {
    const onDoublePress = vi.fn();
    render(<DoublePressRow onDoublePress={onDoublePress} />);
    const row = screen.getByTestId('row');

    press(row, 0);
    press(row, gesture.doublePressMs + 2);
    expect(onDoublePress).not.toHaveBeenCalled();

    press(row, gesture.doublePressMs * 4);
    press(row, gesture.doublePressMs * 4 + 1, 10 + gesture.doublePressSlopPx * 2);
    expect(onDoublePress).not.toHaveBeenCalled();

    press(row, gesture.doublePressMs * 8);
    press(row, gesture.doublePressMs * 8 + gesture.doublePressMs / 2);
    expect(onDoublePress).toHaveBeenCalledOnce();
  });

  it('落在子控件上的按压不计入（连点朗读按钮不会打开编辑）', () => {
    const onDoublePress = vi.fn();
    render(<DoublePressRow onDoublePress={onDoublePress} />);
    const button = screen.getByRole('button', { name: '朗读' });
    press(button, 0);
    press(button, 1);
    expect(onDoublePress).not.toHaveBeenCalled();
  });

  it('禁用时不响应', () => {
    const onDoublePress = vi.fn();
    render(<DoublePressRow onDoublePress={onDoublePress} isDisabled />);
    const row = screen.getByTestId('row');
    press(row, 0);
    press(row, 1);
    expect(onDoublePress).not.toHaveBeenCalled();
  });
});
