import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderWithI18n } from '../../test/render';
import { setReducedMotion } from '../../test/viewport';
import { Checkbox, SegmentedControl, Slider, Switch, type SegmentedItem } from '..';

/** 弹簧从静止滑过两格并停稳所需的上限时间 */
const SPRING_SETTLE_TIMEOUT_MS = 4000;

describe('Switch', () => {
  it('点击与空格都能切换', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<Switch onChange={onChange}>自动发音</Switch>);
    const control = screen.getByRole('switch', { name: '自动发音' });
    expect(control).not.toBeChecked();

    await user.click(control);
    expect(control).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(true);

    await user.keyboard(' ');
    expect(control).not.toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('禁用时不可切换', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Switch isDisabled>自动发音</Switch>);
    const control = screen.getByRole('switch', { name: '自动发音' });
    await user.click(control);
    expect(control).not.toBeChecked();
    expect(control).toBeDisabled();
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(<Switch defaultSelected>自动发音</Switch>);
    await expectNoAxeViolations(container);
  });
});

describe('Checkbox', () => {
  it('点击切换选中', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Checkbox>第 1 课</Checkbox>);
    const box = screen.getByRole('checkbox', { name: '第 1 课' });
    await user.click(box);
    expect(box).toBeChecked();
  });

  it('半选状态以 mixed 暴露给读屏', () => {
    renderWithI18n(<Checkbox isIndeterminate>第 2 章</Checkbox>);
    const box = screen.getByRole('checkbox', { name: '第 2 章' });
    expect(box).toBePartiallyChecked();
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(<Checkbox defaultSelected>第 1 课</Checkbox>);
    await expectNoAxeViolations(container);
  });
});

type Mode = 'de' | 'zh' | 'mixed';
const MODES: readonly SegmentedItem<Mode>[] = [
  { id: 'de', label: '德→中' },
  { id: 'zh', label: '中→德' },
  { id: 'mixed', label: '混合' },
];

function ControlledSegments({ onChange }: { readonly onChange?: (mode: Mode) => void }) {
  const [mode, setMode] = useState<Mode>('de');
  return (
    <SegmentedControl
      label="测验方向"
      items={MODES}
      selectedKey={mode}
      onSelectionChange={(next) => {
        setMode(next);
        onChange?.(next);
      }}
    />
  );
}

describe('SegmentedControl', () => {
  it('作为带名称的组呈现，当前段 aria-pressed / checked', () => {
    renderWithI18n(<ControlledSegments />);
    const group = screen.getByRole('radiogroup', { name: '测验方向' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '德→中' })).toBeChecked();
  });

  it('点击切换并回调', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<ControlledSegments onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: '混合' }));
    expect(onChange).toHaveBeenCalledWith('mixed');
    expect(screen.getByRole('radio', { name: '混合' })).toBeChecked();
  });

  it('方向键在各段之间移动焦点，Tab 只停留一次', async () => {
    const user = userEvent.setup();
    renderWithI18n(
      <>
        <ControlledSegments />
        <button type="button">之后</button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('radio', { name: '德→中' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '中→德' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '之后' })).toHaveFocus();
  });

  it('选中块以弹簧滑到新位置，位置由 CSS 变量驱动（只做 transform）', async () => {
    const user = userEvent.setup();
    renderWithI18n(<ControlledSegments />);
    const group = screen.getByRole('radiogroup', { name: '测验方向' });
    expect(group.style.getPropertyValue('--segment-count')).toBe('3');
    expect(group.style.getPropertyValue('--selection-position')).toBe('0');
    await user.click(screen.getByRole('radio', { name: '混合' }));
    await waitFor(
      () => {
        expect(group.style.getPropertyValue('--selection-position')).toBe('2');
      },
      { timeout: SPRING_SETTLE_TIMEOUT_MS },
    );
  });

  it('减少动态效果时选中块直接跳到新位置', async () => {
    setReducedMotion(true);
    const user = userEvent.setup();
    renderWithI18n(<ControlledSegments />);
    const group = screen.getByRole('radiogroup', { name: '测验方向' });
    await user.click(screen.getByRole('radio', { name: '混合' }));
    expect(group.style.getPropertyValue('--selection-position')).toBe('2');
    expect(group.style.getPropertyValue('--selection-stretch')).toBe('0');
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(<ControlledSegments />);
    await expectNoAxeViolations(container);
  });
});

describe('Slider', () => {
  it('方向键调节数值并使用自定义格式', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(
      <Slider
        label="语速"
        minValue={0.5}
        maxValue={1.5}
        step={0.1}
        defaultValue={1}
        onChange={onChange}
        formatValue={(value) => `${value.toFixed(1)}×`}
      />,
    );
    const slider = screen.getByRole('slider', { name: '语速' });
    expect(screen.getByText('1.0×')).toBeInTheDocument();

    await user.click(slider);
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenLastCalledWith(expect.closeTo(1.1));
    expect(screen.getByText('1.1×')).toBeInTheDocument();
  });

  it('Home / End 跳到边界', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Slider label="音量" defaultValue={50} />);
    const slider = screen.getByRole('slider', { name: '音量' });
    slider.focus();
    await user.keyboard('{End}');
    expect(slider).toHaveValue('100');
    await user.keyboard('{Home}');
    expect(slider).toHaveValue('0');
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(<Slider label="音量" defaultValue={50} />);
    await expectNoAxeViolations(container);
  });
});
