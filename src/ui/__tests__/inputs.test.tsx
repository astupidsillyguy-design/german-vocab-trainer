import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../../test/axe';
import { renderWithI18n } from '../../test/render';
import { SearchField, TextArea, TextField } from '..';

describe('TextField', () => {
  it('标签与输入框关联，说明文字作为描述', () => {
    renderWithI18n(<TextField label="德语" description="名词需要带冠词" />);
    const input = screen.getByRole('textbox', { name: '德语' });
    expect(input).toHaveAccessibleDescription('名词需要带冠词');
  });

  it('hideLabel 时标签仍可被读屏读到', () => {
    renderWithI18n(<TextField label="答案" hideLabel />);
    expect(screen.getByRole('textbox', { name: '答案' })).toBeInTheDocument();
  });

  it('输入时回调最新值（非受控）', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithI18n(<TextField label="德语" onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: '德语' }), 'der');
    expect(onChange).toHaveBeenLastCalledWith('der');
  });

  it('受控模式下以外部 value 为准', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState('');
      return (
        <TextField
          label="德语"
          value={value}
          onChange={(next) => {
            setValue(next.toUpperCase());
          }}
        />
      );
    }
    renderWithI18n(<Controlled />);
    const input = screen.getByRole('textbox', { name: '德语' });
    await user.type(input, 'ab');
    expect(input).toHaveValue('AB');
  });

  it('清除按钮清空内容后焦点回到输入框，且不在 Tab 顺序中', async () => {
    const user = userEvent.setup();
    renderWithI18n(<TextField label="德语" isClearable defaultValue="das Haus" />);
    const input = screen.getByRole('textbox', { name: '德语' });
    const clear = screen.getByRole('button', { name: '清除' });
    expect(clear).toHaveAttribute('tabindex', '-1');

    await user.click(clear);

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button', { name: '清除' })).not.toBeInTheDocument();
  });

  it('禁用或只读时不显示清除按钮', () => {
    renderWithI18n(
      <>
        <TextField label="禁用" isClearable defaultValue="x" isDisabled />
        <TextField label="只读" isClearable defaultValue="x" isReadOnly />
      </>,
    );
    expect(screen.queryByRole('button', { name: '清除' })).not.toBeInTheDocument();
  });

  it('isInvalid 时标记 aria-invalid 并显示错误信息', () => {
    renderWithI18n(<TextField label="德语" isInvalid errorMessage="缺少冠词" />);
    const input = screen.getByRole('textbox', { name: '德语' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('缺少冠词');
  });

  it('inputLang 与 autoCapitalize 透传到 input', () => {
    renderWithI18n(<TextField label="德语" inputLang="de" autoCapitalize="none" />);
    const input = screen.getByRole('textbox', { name: '德语' });
    expect(input).toHaveAttribute('lang', 'de');
    expect(input).toHaveAttribute('autocapitalize', 'none');
  });

  it('inputRef 指向真实 input 元素', () => {
    const ref: { current: HTMLInputElement | null } = { current: null };
    renderWithI18n(<TextField label="德语" inputRef={ref} />);
    expect(ref.current).toBe(screen.getByRole('textbox', { name: '德语' }));
  });

  it('无障碍检查通过', async () => {
    const { container } = renderWithI18n(
      <TextField label="德语" description="说明" isClearable defaultValue="x" />,
    );
    await expectNoAxeViolations(container);
  });
});

describe('SearchField', () => {
  it('是搜索框，Esc 清空，回车提交', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithI18n(<SearchField label="搜索单词" onSubmit={onSubmit} />);
    const input = screen.getByRole('searchbox', { name: '搜索单词' });

    await user.type(input, 'Haus{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('Haus');

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('有内容时显示清除按钮', async () => {
    const user = userEvent.setup();
    renderWithI18n(<SearchField label="搜索单词" />);
    expect(screen.queryByRole('button', { name: '清除' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: '搜索单词' }), 'a');
    await user.click(screen.getByRole('button', { name: '清除' }));
    expect(screen.getByRole('searchbox', { name: '搜索单词' })).toHaveValue('');
  });
});

describe('TextArea', () => {
  it('多行输入，默认 8 行，可选等宽', () => {
    renderWithI18n(<TextArea label="词表" monospace />);
    const textarea = screen.getByRole('textbox', { name: '词表' });
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('rows', '8');
    expect(textarea).toHaveAttribute('data-monospace');
  });

  it('错误信息可被读屏关联', () => {
    renderWithI18n(<TextArea label="词表" isInvalid errorMessage="第 3 行格式错误" />);
    expect(screen.getByRole('textbox', { name: '词表' })).toHaveAccessibleDescription(
      '第 3 行格式错误',
    );
  });
});
