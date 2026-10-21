import { gesture } from '../design/tokens';

const MS_PER_SECOND = 1000;

/**
 * 橡皮筋阻尼（UIScrollView 同款公式）：越界距离 x 在尺寸 d 内被压缩为 (1 − 1 / (x·c / d + 1))·d，
 * 越拉越“紧”，但永远不会超过 d。保留符号。
 */
export function rubberband(
  overshoot: number,
  dimension: number,
  coefficient: number = gesture.rubberband,
): number {
  if (dimension <= 0) return 0;
  const distance = Math.abs(overshoot);
  const damped = (1 - 1 / ((distance * coefficient) / dimension + 1)) * dimension;
  return Math.sign(overshoot) * damped;
}

/** 把值限制在 [min, max] 内，越界部分按橡皮筋衰减 */
export function rubberbandClamp(
  value: number,
  min: number,
  max: number,
  dimension: number,
  coefficient: number = gesture.rubberband,
): number {
  if (value < min) return min + rubberband(value - min, dimension, coefficient);
  if (value > max) return max + rubberband(value - max, dimension, coefficient);
  return value;
}

/**
 * 惯性投射：以速度 v（单位/秒）松手后，按 UIScrollView 的减速率还会再滑多远。
 * 推导：每毫秒速度乘以 rate，总位移 = v/1000 · rate / (1 − rate)。
 */
export function projectMomentum(
  velocity: number,
  decelerationRate: number = gesture.decelerationRate,
): number {
  return ((velocity / MS_PER_SECOND) * decelerationRate) / (1 - decelerationRate);
}

/** 离 value 最近的停靠点；points 为空时返回 value */
export function nearestSnapPoint(value: number, points: readonly number[]): number {
  let best = value;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const distance = Math.abs(point - value);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
