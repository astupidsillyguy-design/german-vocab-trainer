/**
 * 圆角 Token（px）。所有圆角均为连续曲率（超椭圆），平滑度统一为 `CORNER_SMOOTHING`。
 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  sheet: 36,
} as const;

export type RadiusToken = keyof typeof radius;

/** 胶囊形：足够大的值，渲染时会被裁到短边的一半。 */
export const CAPSULE_RADIUS = 9999;

/** Apple 风格的角平滑度（0 = 普通圆弧，1 = 最平滑）。 */
export const CORNER_SMOOTHING = 0.6;

/**
 * 原生 `corner-shape: squircle` 的曲线比同半径圆弧更“方”，
 * 放大半径后视觉范围与 Figma 平滑 60% 的曲线接近。
 */
export const NATIVE_SQUIRCLE_RADIUS_SCALE = 1 + CORNER_SMOOTHING;

/** 嵌套元素内圆角不得小于此值，避免出现尖角。 */
export const MIN_CONCENTRIC_RADIUS = 4;

/**
 * 同心圆角：内层圆角 = 外层圆角 − 内边距。
 * 这样嵌套的卡片/按钮边缘始终平行，是 Apple 新设计语言的关键规则之一。
 */
export function concentricRadius(outer: number, inset: number): number {
  return Math.max(outer - inset, MIN_CONCENTRIC_RADIUS);
}
