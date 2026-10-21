/** 间距：4pt 网格（px）。 */
export const space = {
  none: 0,
  xxxs: 2,
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  giant: 48,
  colossal: 64,
} as const;

export type SpaceToken = keyof typeof space;

/** 页面左右留白，按尺寸等级（size class）区分。 */
export const layoutMargin = {
  compact: 16,
  regular: 24,
  expanded: 32,
} as const;

/** 控件高度。`md` 同时是最小点击区域（Apple HIG 44pt）。 */
export const controlHeight = {
  sm: 32,
  md: 44,
  lg: 52,
  xl: 56,
} as const;

export type ControlSizeToken = keyof typeof controlHeight;

export const HIT_TARGET_MIN = controlHeight.md;

/** 内容最大宽度（可读行长）。 */
export const contentMaxWidth = {
  reading: 680,
  wide: 1120,
  alert: 320,
  panel: 600,
  toast: 440,
  menu: 260,
} as const;

/** Sheet 档位：中档占视口高度的百分比，大档距顶部的留白（px）。 */
export const sheetDetent = {
  mediumViewportPercent: 56,
  largeTopInset: 12,
} as const;

/** 侧边栏宽度。 */
export const sidebarWidth = {
  expanded: 280,
  collapsed: 76,
} as const;

/** 开关、滑块等组件的几何尺寸（px）。 */
export const componentGeometry = {
  switchTrackWidth: 51,
  switchTrackHeight: 31,
  switchThumbInset: 2,
  /** 按住开关时滑块向行进方向拉长的距离 */
  switchThumbStretch: 7,
  sliderTrackHeight: 6,
  sliderThumbSize: 28,
  checkboxSize: 22,
  tabBarHeight: 64,
  navBarHeight: 52,
  sheetHandleWidth: 36,
  sheetHandleHeight: 5,
  focusRingWidth: 2,
  focusRingOffset: 2,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  /** 配对二维码的显示尺寸：手机相机在 20 – 40 cm 外都能识别 */
  pairingQrSize: 176,
  /** 扫码取景框的边长 */
  scannerSize: 280,
} as const;

/** 线性图标（lucide）的描边粗细：与相邻文字字重视觉匹配。 */
export const iconStroke = {
  regular: 2,
  semibold: 2.5,
  bold: 3,
} as const;

export type IconStrokeToken = keyof typeof iconStroke;
