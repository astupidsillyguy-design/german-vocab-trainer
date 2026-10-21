import { gesture } from '../design/tokens';

export interface Vector {
  readonly x: number;
  readonly y: number;
}

interface Sample extends Vector {
  readonly time: number;
}

const MS_PER_SECOND = 1000;
const ZERO: Vector = { x: 0, y: 0 };

/**
 * 指针速度估计：只看最近一小段时间窗口内的位移，
 * 松手前如果停顿过（手指已经停下），速度视为 0，避免“停住后松手却被甩出去”。
 */
export class VelocityTracker {
  readonly #windowMs: number;
  readonly #staleMs: number;
  #samples: Sample[] = [];

  constructor(
    windowMs: number = gesture.velocityWindowMs,
    staleMs: number = gesture.velocityStaleMs,
  ) {
    this.#windowMs = windowMs;
    this.#staleMs = staleMs;
  }

  reset(): void {
    this.#samples = [];
  }

  add(time: number, x: number, y: number): void {
    this.#samples.push({ time, x, y });
    const horizon = time - this.#windowMs;
    while (this.#samples.length > 2 && (this.#samples[0]?.time ?? time) < horizon) {
      this.#samples.shift();
    }
  }

  /** 单位：px/s。`now` 用于判断松手前是否停顿过 */
  velocity(now?: number): Vector {
    const first = this.#samples[0];
    const last = this.#samples.at(-1);
    if (first === undefined || last === undefined || last === first) return ZERO;
    if (now !== undefined && now - last.time > this.#staleMs) return ZERO;
    const elapsed = last.time - first.time;
    if (elapsed <= 0) return ZERO;
    return {
      x: ((last.x - first.x) / elapsed) * MS_PER_SECOND,
      y: ((last.y - first.y) / elapsed) * MS_PER_SECOND,
    };
  }
}
