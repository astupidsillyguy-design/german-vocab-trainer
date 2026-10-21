/**
 * 字体 Token：参照 iOS 默认动态字体档（Large）。
 * 数值单位：size / lineHeight 为 pt≈px，tracking 为 px（来自 SF Pro 的字距表）。
 */

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
} as const;

export type FontWeightToken = keyof typeof fontWeight;

export interface TypeStyle {
  readonly size: number;
  readonly lineHeight: number;
  readonly weight: FontWeightToken;
  /** SF Pro 在该字号下的推荐字距，只作用于拉丁文字 */
  readonly tracking: number;
}

export const typeScale = {
  largeTitle: { size: 34, lineHeight: 41, weight: 'bold', tracking: 0.4 },
  title1: { size: 28, lineHeight: 34, weight: 'bold', tracking: 0.38 },
  title2: { size: 22, lineHeight: 28, weight: 'bold', tracking: -0.26 },
  title3: { size: 20, lineHeight: 25, weight: 'semibold', tracking: -0.45 },
  headline: { size: 17, lineHeight: 22, weight: 'semibold', tracking: -0.43 },
  body: { size: 17, lineHeight: 22, weight: 'regular', tracking: -0.43 },
  callout: { size: 16, lineHeight: 21, weight: 'regular', tracking: -0.31 },
  subhead: { size: 15, lineHeight: 20, weight: 'regular', tracking: -0.23 },
  footnote: { size: 13, lineHeight: 18, weight: 'regular', tracking: -0.08 },
  caption1: { size: 12, lineHeight: 16, weight: 'medium', tracking: 0 },
  caption2: { size: 11, lineHeight: 13, weight: 'medium', tracking: 0.06 },
} as const satisfies Record<string, TypeStyle>;

export type TypeStyleToken = keyof typeof typeScale;

/** 中日文需要更松的行高；大号标题适当收紧。 */
export const cjkLeading = {
  text: 1.5,
  display: 1.3,
  /** 字号 ≥ 此值视为标题，使用 display 行高 */
  displayThresholdPx: 22,
} as const;

/** 浏览器默认根字号。 */
export const BROWSER_DEFAULT_FONT_SIZE_PX = 16;

/**
 * 应用根字号 = iOS 正文 17pt。
 * - 普通浏览器：把根字号设为 17/16 = 106.25%，rem 仍跟随用户的浏览器字号设置；
 * - iOS Safari：根字号改用 `-apple-system-body`，从而跟随系统“动态字体”大小。
 * 所有字号都以 17px 为 1rem 换算。
 */
export const ROOT_FONT_SIZE_PX = 17;

const LATIN_STACK = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Text"',
  '"Inter Variable"',
  '"Segoe UI Variable Text"',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
] as const;

/** 内容里的中文释义默认按简体中文字形显示；日文界面单独使用日文字体。 */
export const cjkStacks = {
  zh: [
    '"PingFang SC"',
    '"Hiragino Sans GB"',
    '"Microsoft YaHei UI"',
    '"Microsoft YaHei"',
    '"Noto Sans SC"',
    '"Noto Sans CJK SC"',
  ],
  ja: [
    '"Hiragino Sans"',
    '"Hiragino Kaku Gothic ProN"',
    '"Yu Gothic UI"',
    'Meiryo',
    '"Noto Sans JP"',
    '"Noto Sans CJK JP"',
  ],
} as const;

export type CjkScript = keyof typeof cjkStacks;

export function textFontStack(script: CjkScript): string {
  return [...LATIN_STACK, ...cjkStacks[script], 'sans-serif'].join(', ');
}

export const monoFontStack = [
  'ui-monospace',
  '"SF Mono"',
  '"Cascadia Mono"',
  'Consolas',
  '"Roboto Mono"',
  'monospace',
].join(', ');
