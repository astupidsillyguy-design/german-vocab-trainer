import { screen, within } from '@testing-library/react';
import { createRef } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderWithI18n } from '../../test/render';
import { Button, IconButton, KeyButton, LinkButton, Spinner, TextField } from '..';

describe('Button', () => {
  it('点击与回车都会触发 onPress', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    renderWithI18n(<Button onPress={onPress}>保存</Button>);
    const button = screen.getByRole('button', { name: '保存' });

    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onPress).toHaveBeenCalledTimes(3);
  });

  it('禁用时不触发', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    renderWithI18n(
      <Button onPress={onPress} isDisabled>
        保存
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('isPending 时保持可聚焦但不可重复提交，并显示活动指示器', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const { container } = renderWithI18n(
      <Button onPress={onPress} isPending>
        提交
      </Button>,
    );
    const button = screen.getByRole('button', { name: /提交/ });
    await user.click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('data-pending', 'true');
    expect(container.querySelector('[aria-hidden="true"] span')).not.toBeNull();
  });

  it('按下时带 data-pressed，用于缩放反馈', async () => {
    const user = userEvent.setup();
    renderWithI18n(<Button>按住</Button>);
    const button = screen.getByRole('button', { name: '按住' });
    await user.pointer({ keys: '[MouseLeft>]', target: button });
    expect(button).toHaveAttribute('data-pressed', 'true');
    await user.pointer({ keys: '[/MouseLeft]', target: button });
    expect(button).not.toHaveAttribute('data-pressed');
  });

  it('无障碍检查通过', async () => {
    renderWithI18n(
      <>
        <Button variant="filled">实心</Button>
        <Button variant="destructive">删除</Button>
        <IconButton label="朗读" icon={<svg />} />
      </>,
    );
    await expectNoAxeViolations();
  });
});

describe('IconButton', () => {
  it('以 label 作为可访问名称', () => {
    renderWithI18n(<IconButton label="朗读单词" icon={<svg />} />);
    expect(screen.getByRole('button', { name: '朗读单词' })).toBeInTheDocument();
  });

  it('Button 与 IconButton 都可以通过 ref 拿到按钮元素（用于主动移动焦点）', () => {
    const textRef = createRef<HTMLButtonElement>();
    const iconRef = createRef<HTMLButtonElement>();
    renderWithI18n(
      <>
        <Button ref={textRef}>管理</Button>
        <IconButton ref={iconRef} label="朗读单词" icon={<svg />} />
      </>,
    );
    expect(textRef.current).toBe(screen.getByRole('button', { name: '管理' }));
    expect(iconRef.current).toBe(screen.getByRole('button', { name: '朗读单词' }));
  });
});

describe('KeyButton', () => {
  it('插入字符时输入框保持焦点（手机键盘不会收起）', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    renderWithI18n(
      <>
        <TextField label="答案" />
        <KeyButton character="ä" onInsert={onInsert} />
      </>,
    );
    const input = screen.getByRole('textbox', { name: '答案' });
    await user.click(input);
    await user.click(screen.getByRole('button', { name: 'ä' }));

    expect(onInsert).toHaveBeenCalledWith('ä');
    expect(input).toHaveFocus();
  });

  it('标记为德语，读屏按德语发音', () => {
    renderWithI18n(<KeyButton character="ß" onInsert={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'ß' });
    expect(within(button).getByText('ß')).toHaveAttribute('lang', 'de');
  });
});

describe('LinkButton', () => {
  it('语义是链接', () => {
    renderWithI18n(<LinkButton href="#/settings">设置</LinkButton>);
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '#/settings');
  });
});

describe('Spinner', () => {
  it('默认以“加载中”播报', () => {
    renderWithI18n(<Spinner />);
    expect(screen.getByRole('status', { name: '加载中…' })).toBeInTheDocument();
  });

  it('装饰用途时对读屏隐藏', () => {
    const { container } = renderWithI18n(<Spinner decorative />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
