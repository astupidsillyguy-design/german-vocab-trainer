/**
 * 动效 Token。
 *
 * 弹簧采用 SwiftUI 的设计参数：
 * - response：无阻尼时完成一次振荡的时间（秒），越小越快；
 * - dampingFraction：阻尼比，1 = 临界阻尼（无回弹），< 1 有回弹。
 *
 * CSS 侧会被解算成 `linear()` 缓动 + 收敛时长；JS 弹簧（src/motion）读取同一组参数，
 * 用于可打断、可继承速度的手势动画。
 */
export interface SpringConfig {
  readonly response: number;
  readonly dampingFraction: number;
}

export const springs = {
  /** 按下/松开的弹性缩放 */
  press: { response: 0.24, dampingFraction: 0.66 },
  /** 开关、分段控件等小位移 */
  snappy: { response: 0.32, dampingFraction: 0.82 },
  /** 无回弹的平滑过渡 */
  smooth: { response: 0.45, dampingFraction: 1 },
  /** 带明显回弹，用于强调 */
  bouncy: { response: 0.5, dampingFraction: 0.64 },
  /** Sheet / 弹窗进出 */
  sheet: { response: 0.42, dampingFraction: 0.9 },
  /** 选择指示块（Tab Bar、分段控件）：轻微回弹，像水滴落定 */
  droplet: { response: 0.36, dampingFraction: 0.72 },
  /** 指针高光跟随：无回弹、略带拖尾 */
  pointer: { response: 0.18, dampingFraction: 1 },
  /** 抛掷后吸附到停靠点 */
  fling: { response: 0.5, dampingFraction: 0.78 },
} as const satisfies Record<string, SpringConfig>;

export type SpringToken = keyof typeof springs;

/** 纯透明度过渡（ms）。在“减少动态效果”时仍保留，用于替代位移动画。 */
export const fadeDuration = {
  fast: 120,
  standard: 200,
} as const;

/** 活动指示器旋转一周的时长（ms），以 8 步离散旋转模拟 iOS 菊花。 */
export const spinner = {
  periodMs: 800,
  spokeCount: 8,
  minSpokeOpacity: 0.25,
  /** 辐条宽度、长度相对指示器尺寸的比例 */
  spokeWidthRatio: 0.125,
  spokeLengthRatio: 0.28,
} as const;

/** 交互形变量。 */
export const interaction = {
  pressScale: 0.96,
  pressScaleKey: 0.9,
  hoverLift: -1,
  /** 禁用态整体不透明度（WCAG 对禁用控件不作对比度要求） */
  disabledOpacity: 0.38,
  /** 弹窗、菜单、通知出现时的起始缩放 */
  overlayEnterScale: 0.94,
  /** 玻璃按钮按下时像水滴一样微微鼓起（而不是缩小） */
  glassPressScale: 1.06,
  /** 拖动排序时被拿起的项轻微放大，像从列表中“浮起” */
  liftScale: 1.02,
  /** 按下反馈的最短可见时长（ms）：快速轻点也能看到完整的“按下—弹回” */
  minimumPressMs: 90,
} as const;

/**
 * 弹簧静止判定精度：位移小于该值、且速度小于 `precision × restSpeedFactor`（每秒）即视为静止。
 * 不同单位的通道使用不同精度。
 */
export const springRest = {
  /** 以像素计的位置 */
  px: 0.1,
  /** 缩放、进度等无量纲值 */
  unit: 0.001,
  restSpeedFactor: 10,
} as const;

/** 手势参数（与 UIKit 的默认值保持一致）。 */
export const gesture = {
  /** 指针移动超过该距离（px）才认定为拖动；低于它仍是点按 */
  dragThresholdPx: 8,
  /** 计算松手速度时回看的时间窗口（ms） */
  velocityWindowMs: 100,
  /** 松手前停顿超过该时长（ms），视为速度为 0 */
  velocityStaleMs: 60,
  /** 橡皮筋系数（UIScrollView 为 0.55）：越界距离按 (1 − 1 / (x·c / d + 1))·d 衰减 */
  rubberband: 0.55,
  /** 惯性投射的减速率：每毫秒保留的速度比例（UIScrollView.DecelerationRate.normal） */
  decelerationRate: 0.998,
  /** 在若干等宽项之间选择（Tab Bar、分段控件）时的减速率（DecelerationRate.fast）：甩动最多越过一两项 */
  selectionDecelerationRate: 0.99,
  /** 拖动松手后吞掉“迟到”点击的时间窗口（ms）：触屏的 click 可能在下一个任务才派发 */
  postDragClickWindowMs: 300,
  /** 滑动关闭：位移超过自身尺寸的该比例即关闭 */
  dismissRatio: 0.5,
  /** 选择指示块随速度拉伸的最大比例 */
  stretchMax: 0.2,
  /** 指示块速度（项/秒）达到该值时拉伸到最大 */
  stretchVelocity: 10,
  /** 拖动选择指示块时放大成“水滴”的比例 */
  dropletScale: 1.15,
  /** 双击 / 双触：两次松手的最长间隔（ms），与 macOS、iOS 的默认值一致 */
  doublePressMs: 300,
  /** 双击 / 双触：两次按下的位置最多相差的距离（px），容忍手指的轻微偏移 */
  doublePressSlopPx: 12,
  /** 拖动排序时，指针进入视口上下边缘该距离（px）内开始自动滚动 */
  autoScrollEdgePx: 80,
  /** 自动滚动的最高速度（px/s）：指针越靠近边缘越快 */
  autoScrollMaxSpeed: 1200,
} as const;
