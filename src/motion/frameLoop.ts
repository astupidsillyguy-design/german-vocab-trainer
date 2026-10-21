/**
 * 全局共享的逐帧循环：所有弹簧动画合用一个 requestAnimationFrame，
 * 同一帧内的样式写入集中在一起，没有任务时完全停止（不空转耗电）。
 */

/** 每帧执行的任务；返回 false 表示已完成，会被移出循环。 */
export type FrameTask = (now: number) => boolean;

export interface FrameScheduler {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

export interface FrameLoop {
  /** 加入任务（下一帧开始执行），返回移除函数 */
  add(task: FrameTask): () => void;
  /** 当前排队的任务数 */
  readonly size: number;
}

/** 没有 requestAnimationFrame 的环境（例如部分测试环境）退回定时器，按 60Hz 推进。 */
const MS_PER_SECOND = 1000;
const FALLBACK_FRAME_RATE = 60;
const FALLBACK_FRAME_MS = MS_PER_SECOND / FALLBACK_FRAME_RATE;

function browserScheduler(): FrameScheduler {
  if (typeof requestAnimationFrame === 'function') {
    return {
      // 与 SpringAnimation 的起点共用同一个时钟；jsdom / 多 realm 环境的
      // rAF 时间戳可能采用不同时间原点，直接传递会让弹簧误以为时间尚未推进。
      request: (callback) =>
        requestAnimationFrame(() => {
          callback(performance.now());
        }),
      cancel: (handle) => {
        cancelAnimationFrame(handle);
      },
    };
  }
  return {
    request: (callback) =>
      window.setTimeout(() => {
        callback(performance.now());
      }, FALLBACK_FRAME_MS),
    cancel: (handle) => {
      window.clearTimeout(handle);
    },
  };
}

export function createFrameLoop(scheduler?: FrameScheduler): FrameLoop {
  const tasks = new Set<FrameTask>();
  let resolved: FrameScheduler | null = scheduler ?? null;
  let handle: number | null = null;

  const tick = (now: number): void => {
    handle = null;
    // 拷贝一份：任务执行中新增的任务从下一帧开始
    for (const task of [...tasks]) {
      if (!tasks.has(task)) continue;
      if (!task(now)) tasks.delete(task);
    }
    if (tasks.size > 0) schedule();
  };

  const schedule = (): void => {
    if (handle !== null) return;
    resolved ??= browserScheduler();
    handle = resolved.request(tick);
  };

  return {
    add(task) {
      tasks.add(task);
      schedule();
      return () => {
        tasks.delete(task);
        if (tasks.size === 0 && handle !== null) {
          resolved?.cancel(handle);
          handle = null;
        }
      };
    },
    get size() {
      return tasks.size;
    },
  };
}

/** 应用唯一的帧循环 */
export const frameLoop: FrameLoop = createFrameLoop();
