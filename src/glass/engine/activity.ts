/**
 * 壁纸流动的时钟与开关，以及指针高光的缓动。全部为纯逻辑，时间由调用方传入。
 */

const MS_PER_SECOND = 1000;
/** 单帧最多推进的时间（ms）：主线程卡顿或标签页节流后恢复时，色块不会突然跳一大截 */
const MAX_STEP_MS = 100;
/** 帧率上限的容差：rAF 时间戳有抖动，略早于目标间隔的帧也接受，避免在 30/20fps 之间来回跳 */
const FRAME_INTERVAL_TOLERANCE = 0.9;

export interface FlowConditions {
  readonly reducedMotion: boolean;
  /** 窗口获得焦点 */
  readonly focused: boolean;
  readonly hidden: boolean;
}

/** 壁纸时钟：只在流动时累加时间，暂停后从原处继续 */
export class WallpaperClock {
  #seconds = 0;
  #last: number | null = null;

  get seconds(): number {
    return this.#seconds;
  }

  tick(now: number, flowing: boolean): number {
    if (flowing && this.#last !== null) {
      this.#seconds += Math.min(Math.max(now - this.#last, 0), MAX_STEP_MS) / MS_PER_SECOND;
    }
    this.#last = flowing ? now : null;
    return this.#seconds;
  }
}

/** 决定壁纸是否流动：减少动态效果、窗口失焦、页面隐藏或长时间无输入时冻结 */
export class FlowGate {
  readonly #idleMs: number;
  #lastInput: number;

  constructor(idleMs: number, now: number) {
    this.#idleMs = idleMs;
    this.#lastInput = now;
  }

  noteInput(now: number): void {
    this.#lastInput = now;
  }

  isIdle(now: number): boolean {
    return now - this.#lastInput >= this.#idleMs;
  }

  isFlowing(now: number, conditions: FlowConditions): boolean {
    return (
      !conditions.reducedMotion && conditions.focused && !conditions.hidden && !this.isIdle(now)
    );
  }
}

/** 是否到了按帧率上限绘制下一帧的时间 */
export function isFrameDue(now: number, last: number, fps: number): boolean {
  return now - last >= (MS_PER_SECOND / fps) * FRAME_INTERVAL_TOLERANCE;
}

/** 缓动到位的阈值 */
export const EASE_EPSILON = 1e-3;

/** 指数缓动（与帧率无关）：经过 tau 毫秒走完剩余距离的 63% */
export function easeToward(value: number, target: number, dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return target;
  const next = target + (value - target) * Math.exp(-dtMs / tauMs);
  return Math.abs(next - target) < EASE_EPSILON ? target : next;
}

export interface FrameBudgetOptions {
  /** 忽略的预热帧数：首帧要分配纹理，驱动也可能延迟编译着色器 */
  readonly warmupFrames: number;
  /** 单帧主线程开销超过此值（ms）记为慢帧 */
  readonly slowFrameMs: number;
  /** 观察窗口（帧数） */
  readonly windowFrames: number;
  /** 窗口内慢帧达到此数量即判定超支 */
  readonly maxSlowFrames: number;
}

/**
 * 渲染开销预算：主线程花在渲染上的时间（含 drawImage 拷贝时可能发生的 GPU 同步）持续过高时，
 * 判定该设备不适合 WebGL 玻璃。只看最近一个窗口，偶发的卡顿（例如切换标签页）不会触发。
 */
export class FrameBudget {
  readonly #options: FrameBudgetOptions;
  readonly #recent: boolean[] = [];
  #seen = 0;

  constructor(options: FrameBudgetOptions) {
    this.#options = options;
  }

  /** 记录一帧的开销；返回是否超支 */
  record(costMs: number): boolean {
    this.#seen += 1;
    if (this.#seen <= this.#options.warmupFrames) return false;
    this.#recent.push(costMs > this.#options.slowFrameMs);
    if (this.#recent.length > this.#options.windowFrames) this.#recent.shift();
    return this.#recent.filter(Boolean).length >= this.#options.maxSlowFrames;
  }
}
