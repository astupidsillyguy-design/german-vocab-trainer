import 'react';

declare module 'react' {
  /** 允许在 style 中设置 CSS 自定义属性（如 `--surface-radius`）。 */
  // 模块增强只能通过接口合并添加成员，无法改写为 Record
  // eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number | undefined;
  }
}
