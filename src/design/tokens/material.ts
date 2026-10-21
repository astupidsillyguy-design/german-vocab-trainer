import type { BlurToken } from './blur.ts';
import { palette } from './color.ts';

/**
 * 玻璃材质（CSS 轻量档）。WebGL 完整档在阶段 4 复用同一组参数。
 *
 * `tint` 的最低不透明度是按“玻璃背后最坏情况的背景”反推出来的，
 * 保证 `label.primary / label.secondary` 在玻璃上仍满足 4.5:1（见 tokens.test.ts）。
 */
export interface GlassMaterial {
  /** 玻璃本体的着色层 */
  readonly tint: string;
  readonly blur: BlurToken;
  /** 背景饱和度增强倍数 */
  readonly saturation: number;
  /** 顶部内高光 */
  readonly highlight: string;
  /** 0.5px 外沿描边 */
  readonly rim: string;
  /** “降低透明度”时替换成的不透明颜色 */
  readonly solid: string;
}

export const materials = {
  /** 默认：卡片、列表、输入框 */
  regular: {
    tint: 'rgba(255, 255, 255, 0.64)',
    blur: 'regular',
    saturation: 1.8,
    highlight: 'rgba(255, 255, 255, 0.78)',
    rim: 'rgba(255, 255, 255, 0.5)',
    solid: palette.gray.solidMaterial,
  },
  /** 通透：只承载图标或大号文字的浮动控件 */
  clear: {
    tint: 'rgba(255, 255, 255, 0.34)',
    blur: 'thin',
    saturation: 1.6,
    highlight: 'rgba(255, 255, 255, 0.7)',
    rim: 'rgba(255, 255, 255, 0.42)',
    solid: palette.gray.solidMaterialClear,
  },
  /** 厚：Sheet、弹窗等需要强调层级的面板 */
  thick: {
    tint: 'rgba(250, 250, 252, 0.84)',
    blur: 'thick',
    saturation: 1.8,
    highlight: 'rgba(255, 255, 255, 0.85)',
    rim: 'rgba(255, 255, 255, 0.55)',
    solid: palette.gray.solidMaterialThick,
  },
  /** 系统栏：导航栏、Tab Bar、侧边栏 */
  chrome: {
    tint: 'rgba(249, 249, 252, 0.8)',
    blur: 'chrome',
    saturation: 2,
    highlight: 'rgba(255, 255, 255, 0.8)',
    rim: 'rgba(255, 255, 255, 0.5)',
    solid: palette.gray.solidMaterial,
  },
} as const satisfies Record<string, GlassMaterial>;

export type MaterialToken = keyof typeof materials;
