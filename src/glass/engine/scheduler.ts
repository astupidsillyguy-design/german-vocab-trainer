/**
 * 按需渲染的帧调度器：只有“有变化”时才请求下一帧。
 *
 * - invalidate()：请求单帧（滚动、尺寸变化、参数变化）；
 * - setContinuous()：持续请求，直到原因消失（壁纸流动、指针高光缓动、CSS 过渡进行中）；
 * - setPaused()：页面隐藏时完全停止，恢复后补绘一帧。
 */
export type ContinuousReason = 'wallpaper' | 'pointer' | 'transition';

export interface FrameHost {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

export const browserFrameHost: FrameHost = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

export class FrameScheduler {
  readonly #host: FrameHost;
  readonly #render: (now: number) => void;
  readonly #reasons = new Set<ContinuousReason>();
  #pending: number | null = null;
  #paused = false;
  #disposed = false;

  constructor(host: FrameHost, render: (now: number) => void) {
    this.#host = host;
    this.#render = render;
  }

  get isScheduled(): boolean {
    return this.#pending !== null;
  }

  isContinuous(reason: ContinuousReason): boolean {
    return this.#reasons.has(reason);
  }

  invalidate(): void {
    if (this.#paused || this.#disposed || this.#pending !== null) return;
    this.#pending = this.#host.request(this.#tick);
  }

  setContinuous(reason: ContinuousReason, active: boolean): void {
    if (active) {
      this.#reasons.add(reason);
      this.invalidate();
    } else {
      this.#reasons.delete(reason);
    }
  }

  setPaused(paused: boolean): void {
    if (paused === this.#paused) return;
    this.#paused = paused;
    if (paused) this.#cancel();
    else this.invalidate();
  }

  dispose(): void {
    this.#cancel();
    this.#reasons.clear();
    this.#disposed = true;
  }

  #cancel(): void {
    if (this.#pending === null) return;
    this.#host.cancel(this.#pending);
    this.#pending = null;
  }

  readonly #tick = (now: number): void => {
    this.#pending = null;
    if (this.#paused || this.#disposed) return;
    this.#render(now);
    if (this.#reasons.size > 0) this.invalidate();
  };
}
