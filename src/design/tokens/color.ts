/**
 * 色彩 Token。
 *
 * 分两层：
 * 1. `palette` —— 原始色板，只允许被语义层引用；
 * 2. `semanticColors` —— 按“角色”命名的颜色，组件只能使用这一层（经由 CSS 变量）。
 *
 * 文字类颜色（`label.*`、`*.text`）全部经过 WCAG AA（≥ 4.5:1）校验，
 * 校验逻辑见 `tokens.test.ts`，任何改动都会被测试拦截。
 */

/** 外观。深色模式已预留类型位置，当前版本只实现浅色。 */
export const APPEARANCES = ['light'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const palette = {
  white: '#FFFFFF',
  black: '#000000',
  gray: {
    groupedBackground: '#F2F2F7',
    separatorOpaque: '#C6C6C8',
    solidMaterial: '#F7F7FA',
    solidMaterialClear: '#EFEFF4',
    solidMaterialThick: '#FAFAFC',
  },
  indigo: { base: '#5856D6', pressed: '#4644BE', text: '#4E4CC6', deep: '#3634A3' },
  green: { base: '#34C759', deep: '#1E7B34', text: '#1C7231' },
  red: { base: '#FF3B30', deep: '#D70015', text: '#C40013' },
  orange: { base: '#FF9500', deep: '#C93400', text: '#BB3000' },
  wallpaper: {
    lavender: '#E4E3FF',
    blush: '#FCE4F1',
    sky: '#DDF1FF',
    cream: '#FFF3DB',
    base: '#F4F4FA',
  },
} as const;

export interface ToneColors {
  /** 图标、指示点等大面积填充 */
  readonly fill: string;
  /** 承载白色文字的实心底 */
  readonly solid: string;
  /** 直接作为文字颜色使用（已校验对比度） */
  readonly text: string;
  /** 浅色底（徽标、选中态背景） */
  readonly subtle: string;
}

export interface SemanticColorScheme {
  readonly label: {
    readonly primary: string;
    readonly secondary: string;
    readonly placeholder: string;
    /** 仅用于禁用态与装饰，不得承载必须阅读的信息 */
    readonly tertiary: string;
    readonly quaternary: string;
    readonly onSolid: string;
  };
  readonly background: {
    readonly primary: string;
    readonly secondary: string;
    readonly grouped: string;
    readonly groupedElevated: string;
    readonly scrim: string;
  };
  readonly fill: {
    readonly primary: string;
    readonly secondary: string;
    readonly tertiary: string;
    readonly quaternary: string;
  };
  readonly separator: {
    readonly default: string;
    readonly opaque: string;
  };
  readonly tint: {
    readonly base: string;
    readonly pressed: string;
    readonly text: string;
    readonly subtle: string;
  };
  readonly success: ToneColors;
  readonly danger: ToneColors;
  readonly warning: ToneColors;
  readonly focusRing: string;
  readonly wallpaper: {
    readonly base: string;
    readonly stop1: string;
    readonly stop2: string;
    readonly stop3: string;
    readonly stop4: string;
  };
}

export const semanticColors = {
  light: {
    label: {
      primary: palette.black,
      secondary: 'rgba(60, 60, 67, 0.82)',
      placeholder: 'rgba(60, 60, 67, 0.76)',
      tertiary: 'rgba(60, 60, 67, 0.45)',
      quaternary: 'rgba(60, 60, 67, 0.24)',
      onSolid: palette.white,
    },
    background: {
      primary: palette.white,
      secondary: palette.gray.groupedBackground,
      grouped: palette.gray.groupedBackground,
      groupedElevated: palette.white,
      scrim: 'rgba(0, 0, 0, 0.28)',
    },
    fill: {
      primary: 'rgba(120, 120, 128, 0.2)',
      secondary: 'rgba(120, 120, 128, 0.16)',
      tertiary: 'rgba(118, 118, 128, 0.12)',
      quaternary: 'rgba(116, 116, 128, 0.08)',
    },
    separator: {
      default: 'rgba(60, 60, 67, 0.29)',
      opaque: palette.gray.separatorOpaque,
    },
    tint: {
      base: palette.indigo.base,
      pressed: palette.indigo.pressed,
      text: palette.indigo.text,
      subtle: 'rgba(88, 86, 214, 0.14)',
    },
    success: {
      fill: palette.green.base,
      solid: palette.green.deep,
      text: palette.green.text,
      subtle: 'rgba(52, 199, 89, 0.16)',
    },
    danger: {
      fill: palette.red.base,
      solid: palette.red.deep,
      text: palette.red.text,
      subtle: 'rgba(255, 59, 48, 0.14)',
    },
    warning: {
      fill: palette.orange.base,
      solid: palette.orange.deep,
      text: palette.orange.text,
      subtle: 'rgba(255, 149, 0, 0.16)',
    },
    focusRing: palette.indigo.base,
    wallpaper: {
      base: palette.wallpaper.base,
      stop1: palette.wallpaper.lavender,
      stop2: palette.wallpaper.blush,
      stop3: palette.wallpaper.sky,
      stop4: palette.wallpaper.cream,
    },
  },
} as const satisfies Record<Appearance, SemanticColorScheme>;

/** “增强对比度”系统设置下覆盖的颜色（只列出需要变化的部分）。 */
export const highContrastOverrides = {
  label: {
    secondary: 'rgba(60, 60, 67, 0.96)',
    placeholder: 'rgba(60, 60, 67, 0.9)',
  },
  separator: { default: 'rgba(60, 60, 67, 0.62)' },
  tint: { text: palette.indigo.deep },
} as const;
