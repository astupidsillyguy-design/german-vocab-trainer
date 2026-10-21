import type { zhCN } from './zh-CN';

/** 把源文案的字面量类型放宽为 string，函数保留参数签名。 */
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer Args) => string
    ? (...args: Args) => string
    : { readonly [Key in keyof T]: Widen<T[Key]> };

export type Messages = Widen<typeof zhCN>;
