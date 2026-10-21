/**
 * WebGL 玻璃引擎的公共接口。React 层只依赖这些类型；实现位于 GlassEngine.ts，
 * 通过动态 import 单独打包，首屏无需下载与编译着色器。
 */
import type { ShapeKind } from '../math/sdf';
import type { ResolvedOptics, Vec4 } from '../optics';

/** 引擎在根元素（玻璃组、壁纸）上写入的属性：第一帧绘制完成后出现，上下文丢失时移除 */
export const GLASS_RENDERED_ATTRIBUTE = 'data-glass-rendered';
/** 玻璃组根元素的标记属性（调试与端到端测试使用） */
export const GLASS_GROUP_ATTRIBUTE = 'data-glass-group';
/**
 * JS 驱动的动画（弹簧、拖动）每帧在被移动的元素上派发此事件（冒泡）。
 * CSS 过渡/动画会触发 transitionrun / animationstart，引擎能自行感知；
 * 直接改 style 的逐帧动画不会，因此需要显式通知所在玻璃组重绘。
 */
export const GLASS_MOTION_EVENT = 'gvt:motionframe';

export interface WallpaperTarget {
  /** 固定铺满视口的壁纸容器：其尺寸即着色器中的“视口” */
  readonly element: HTMLElement;
  /** 壁纸画布（2D），引擎把渲染结果拷贝到这里 */
  readonly canvas: HTMLCanvasElement;
}

export interface GroupOptions {
  /** 组根元素：画布覆盖它并向外扩 GLASS_CANVAS_BLEED 以容纳投影 */
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly optics: ResolvedOptics;
  /** smooth-min 融合半径（px），0 = 不融合 */
  readonly spacing: number;
}

export type GroupUpdate = Partial<Pick<GroupOptions, 'optics' | 'spacing'>>;

export interface ShapeOptions {
  readonly element: HTMLElement;
  readonly kind: ShapeKind;
  /** 圆角半径 token 值（px）；胶囊形忽略 */
  readonly radius: number;
  readonly tint: Vec4;
}

export type ShapeUpdate = Partial<Omit<ShapeOptions, 'element'>>;

export interface GlassShapeHandle {
  update(update: ShapeUpdate): void;
  remove(): void;
}

export interface GlassGroupHandle {
  update(update: GroupUpdate): void;
  addShape(options: ShapeOptions): GlassShapeHandle;
  /** 指针位置（视口坐标）；null 表示指针离开，高光淡出 */
  setPointer(point: { readonly x: number; readonly y: number } | null): void;
  remove(): void;
}

export interface GlassEngineStats {
  readonly status: 'ready' | 'lost';
  /** 实际执行绘制的帧数 */
  readonly frames: number;
  readonly wallpaperFrames: number;
  /** 玻璃组的绘制次数（每组每帧计 1） */
  readonly groupDraws: number;
  readonly registeredGroups: number;
  readonly visibleGroups: number;
  /** 壁纸是否正在流动 */
  readonly flowing: boolean;
  /** 每帧主线程渲染开销的滑动平均（ms） */
  readonly frameCostMs: number;
}

export interface GlassEngine {
  attachWallpaper(target: WallpaperTarget): () => void;
  registerGroup(options: GroupOptions): GlassGroupHandle;
  setReducedMotion(reduced: boolean): void;
  stats(): GlassEngineStats;
  dispose(): void;
}

/**
 * 引擎运行期的状态变化：
 * - `lost` / `ready`：上下文丢失 / 恢复；
 * - `degraded`：渲染开销持续超出预算，引擎已停止绘制，调用方应释放它并改用 CSS 档。
 */
export type GlassEngineEvent = 'ready' | 'lost' | 'degraded';

export interface GlassEngineCallbacks {
  readonly onStatusChange: (status: GlassEngineEvent) => void;
  readonly reducedMotion: boolean;
}

export type GlassEngineLoader = (callbacks: GlassEngineCallbacks) => Promise<GlassEngine | null>;

/** 开发模式下挂在 window.__gvtGlass 上的调试接口 */
export interface GlassDebugHandle {
  stats(): GlassEngineStats;
  loseContext(): void;
  restoreContext(): void;
}

declare global {
  interface Window {
    /** 开发模式下的调试接口：`__gvtGlass.stats()`、`loseContext()`、`restoreContext()` */
    __gvtGlass?: GlassDebugHandle;
    /**
     * 开发模式下设为 true（须在引擎加载前）：跳过软件渲染器检测与帧开销降级。
     * 供端到端测试在没有 GPU 的 CI / 沙盒（SwiftShader）中验证 WebGL 档的功能；生产构建中无效。
     */
    __gvtGlassForceWebgl?: boolean;
  }
}
