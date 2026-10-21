/**
 * 特殊字符键：在光标处插入（替换选中的文字），并给出插入后的光标位置。
 */
export interface TextSelection {
  /** 输入框从未获得过焦点时浏览器可能给出 null：视为在末尾 */
  readonly start: number | null;
  readonly end: number | null;
}

export interface TextEdit {
  readonly value: string;
  readonly caret: number;
}

/** 超出长度上限时返回 null（不插入） */
export function insertText(
  value: string,
  selection: TextSelection,
  text: string,
  maxLength: number,
): TextEdit | null {
  const start = Math.min(selection.start ?? value.length, value.length);
  const end = Math.max(start, Math.min(selection.end ?? start, value.length));
  const next = value.slice(0, start) + text + value.slice(end);
  if (next.length > maxLength) return null;
  return { value: next, caret: start + text.length };
}
