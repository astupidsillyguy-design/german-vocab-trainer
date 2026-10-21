import { describe, expect, it } from 'vitest';
import { springs } from '../tokens/index.ts';
import {
  SPRING_MAX_DURATION_S,
  SPRING_REST_DELTA,
  springProgress,
  springSettleTime,
  springToCss,
  springToPhysics,
} from './spring.ts';

describe('springToPhysics', () => {
  it('把 response / dampingFraction 换算为刚度与阻尼', () => {
    const physics = springToPhysics({ response: 1, dampingFraction: 1 });
    expect(physics.mass).toBe(1);
    expect(physics.stiffness).toBeCloseTo((2 * Math.PI) ** 2);
    expect(physics.damping).toBeCloseTo(4 * Math.PI);
  });
});

describe('springProgress', () => {
  it.each(Object.entries(springs))('%s：从 0 出发并最终收敛到 1', (_name, config) => {
    const physics = springToPhysics(config);
    expect(springProgress(physics, 0)).toBeCloseTo(0);
    expect(springProgress(physics, SPRING_MAX_DURATION_S)).toBeCloseTo(1, 3);
  });

  it('欠阻尼弹簧会越过终点（回弹）', () => {
    const physics = springToPhysics(springs.bouncy);
    const samples = Array.from({ length: 200 }, (_, index) => springProgress(physics, index / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });

  it('临界阻尼弹簧不会越过终点', () => {
    const physics = springToPhysics(springs.smooth);
    const samples = Array.from({ length: 400 }, (_, index) => springProgress(physics, index / 100));
    expect(Math.max(...samples)).toBeLessThanOrEqual(1 + SPRING_REST_DELTA);
  });

  it('初速度会让早期进度更快（手势松手时速度连续）', () => {
    const physics = springToPhysics(springs.snappy);
    expect(springProgress(physics, 0.05, 10)).toBeGreaterThan(springProgress(physics, 0.05, 0));
  });
});

describe('springSettleTime', () => {
  it.each(Object.entries(springs))('%s：收敛时间为正且不超过上限', (_name, config) => {
    const time = springSettleTime(springToPhysics(config));
    expect(time).toBeGreaterThan(0);
    expect(time).toBeLessThanOrEqual(SPRING_MAX_DURATION_S);
  });

  it('收敛后保持在静止阈值内', () => {
    const physics = springToPhysics(springs.bouncy);
    const time = springSettleTime(physics);
    for (let t = time; t < time + 1; t += 0.05) {
      expect(Math.abs(1 - springProgress(physics, t))).toBeLessThanOrEqual(SPRING_REST_DELTA * 10);
    }
  });
});

describe('springToCss', () => {
  it('生成首尾为 0 和 1 的 linear() 缓动', () => {
    const { easing, durationMs } = springToCss(springs.snappy);
    expect(easing.startsWith('linear(0,')).toBe(true);
    expect(easing.endsWith(', 1)')).toBe(true);
    expect(durationMs).toBe(Math.round(springSettleTime(springToPhysics(springs.snappy)) * 1000));
  });

  it('不产生 NaN 或 Infinity', () => {
    for (const config of Object.values(springs)) {
      const { easing } = springToCss(config);
      expect(easing).not.toMatch(/NaN|Infinity/);
    }
  });
});
