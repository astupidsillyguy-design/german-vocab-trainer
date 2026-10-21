/**
 * 在 TS 中以类型安全的方式引用 CSS 变量，避免手写字符串拼错。
 */
import { cssVarName } from './build/naming.ts';
import type {
  RadiusToken,
  SemanticColorScheme,
  SpaceToken,
  TypeStyleToken,
} from './tokens/index.ts';

/** 把嵌套对象展开为点路径联合类型：{ label: { primary } } → 'label.primary' */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

export type ColorToken = Paths<SemanticColorScheme>;

export function colorVar(token: ColorToken): string {
  return `var(${cssVarName('color', ...token.split('.'))})`;
}

export function spaceVar(token: SpaceToken): string {
  return `var(${cssVarName('space', token)})`;
}

export function radiusVar(token: RadiusToken | 'capsule'): string {
  return `var(${cssVarName('radius', token)})`;
}

/** 全局排版工具类名（由 tokens CSS 生成）。 */
export function typeClass(token: TypeStyleToken): string {
  return `type-${token}`;
}
