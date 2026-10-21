/**
 * 尺寸等级（借用 Apple 的 size class 概念）：
 * - compact  手机：底部 Tab Bar
 * - regular  平板：可折叠侧边栏
 * - expanded 桌面：常驻侧边栏
 *
 * 组件 CSS 不写媒体查询数字，而是读取 `<html data-size-class>`。
 */
export const SIZE_CLASSES = ['compact', 'regular', 'expanded'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

/** 各等级的最小视口宽度（px）。 */
export const sizeClassMinWidth = {
  compact: 0,
  regular: 600,
  expanded: 1024,
} as const satisfies Record<SizeClass, number>;
