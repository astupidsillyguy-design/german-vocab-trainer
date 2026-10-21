import type { SpringConfig } from '../tokens/motion.ts';

/** 弹簧的物理参数（质量-弹簧-阻尼模型）。 */
export interface SpringPhysics {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

const TWO_PI = 2 * Math.PI;
const FOUR_PI = 2 * TWO_PI;
const MS_PER_SECOND = 1000;

/** 位移低于该值（相对总行程）即视为静止。 */
export const SPRING_REST_DELTA = 0.001;
/** 解算上限，防止极端参数导致死循环。 */
export const SPRING_MAX_DURATION_S = 4;
/** `linear()` 每秒采样点数，60 足以让 120Hz 屏幕上的插值保持平滑。 */
export const SPRING_SAMPLES_PER_SECOND = 60;
const MIN_SAMPLES = 12;
const SAMPLE_PRECISION = 4;
const DECIMAL_BASE = 10;
/** 临界/过阻尼情况下逐步搜索收敛时间的步长（秒）。 */
const SETTLE_SEARCH_RATE_HZ = 240;
const SETTLE_SEARCH_STEP_S = 1 / SETTLE_SEARCH_RATE_HZ;

/** SwiftUI 风格参数 → 物理参数（推导：ω₀ = 2π / response，c = 2ζω₀m）。 */
export function springToPhysics(config: SpringConfig, mass = 1): SpringPhysics {
  const stiffness = (TWO_PI / config.response) ** 2 * mass;
  const damping = (FOUR_PI * config.dampingFraction * mass) / config.response;
  return { stiffness, damping, mass };
}

/** 弹簧在某一时刻相对目标的状态。 */
export interface SpringStepResult {
  /** 当前位置减去目标位置 */
  readonly displacement: number;
  /** 速度（单位/秒） */
  readonly velocity: number;
}

/** 阻尼比与 1 的差小于该值时按临界阻尼求解，避免过阻尼公式在 ζ→1 时除以接近 0 的数。 */
const CRITICAL_DAMPING_EPSILON = 1e-6;

/**
 * 弹簧的通用解析解：已知 t=0 时相对目标的位移 x0 与速度 v0，求 t 秒后的位移与速度。
 * 解析解与帧率无关（120Hz 与 60Hz 屏幕上轨迹一致），也是“可打断”的基础：
 * 动画中途改目标时，以当前位移与速度作为新的初始条件重新求解，速度保持连续。
 */
export function springStep(
  physics: SpringPhysics,
  x0: number,
  v0: number,
  t: number,
): SpringStepResult {
  const { stiffness, damping, mass } = physics;
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (Math.abs(zeta - 1) < CRITICAL_DAMPING_EPSILON) {
    const decay = Math.exp(-omega0 * t);
    const slope = v0 + omega0 * x0;
    return {
      displacement: decay * (x0 + slope * t),
      velocity: decay * (v0 - omega0 * slope * t),
    };
  }
  if (zeta < 1) {
    const decayRate = zeta * omega0;
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-decayRate * t);
    const cos = Math.cos(omegaD * t);
    const sin = Math.sin(omegaD * t);
    const b = (v0 + decayRate * x0) / omegaD;
    return {
      displacement: envelope * (x0 * cos + b * sin),
      velocity:
        envelope * ((b * omegaD - decayRate * x0) * cos - (decayRate * b + x0 * omegaD) * sin),
    };
  }
  // 过阻尼：两个指数衰减项的叠加
  const root = omega0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega0 + root;
  const r2 = -zeta * omega0 - root;
  const c2 = (v0 - r1 * x0) / (r2 - r1);
  const c1 = x0 - c2;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return {
    displacement: c1 * e1 + c2 * e2,
    velocity: r1 * c1 * e1 + r2 * c2 * e2,
  };
}

/**
 * 弹簧从 0 运动到 1 的解析解，返回 t 秒时的进度（可能 > 1，即回弹）。
 * `initialVelocity` 单位为“行程/秒”，用于手势松手后继承速度。
 */
export function springProgress(physics: SpringPhysics, t: number, initialVelocity = 0): number {
  // 以“距离目标的位移”建模：x(0) = -1
  return 1 + springStep(physics, -1, initialVelocity, t).displacement;
}

/** 计算弹簧收敛（位移持续小于 restDelta）所需的时间，单位秒。 */
export function springSettleTime(physics: SpringPhysics, restDelta = SPRING_REST_DELTA): number {
  const { stiffness, damping, mass } = physics;
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    // 欠阻尼：振幅包络 A·e^(−ζω₀t) 低于 restDelta 后不会再超出
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const amplitude = Math.hypot(1, (zeta * omega0) / omegaD);
    return Math.min(Math.log(amplitude / restDelta) / (zeta * omega0), SPRING_MAX_DURATION_S);
  }
  // 临界/过阻尼且初速度为 0 时单调趋近目标：第一次进入阈值即收敛
  for (let t = 0; t < SPRING_MAX_DURATION_S; t += SETTLE_SEARCH_STEP_S) {
    if (Math.abs(1 - springProgress(physics, t)) < restDelta) return t;
  }
  return SPRING_MAX_DURATION_S;
}

export interface CssSpring {
  /** 可直接用于 transition-timing-function 的 `linear(...)` */
  readonly easing: string;
  readonly durationMs: number;
}

function round(value: number): number {
  const factor = DECIMAL_BASE ** SAMPLE_PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * 把弹簧解算为 CSS `linear()` 缓动：在收敛时间内均匀采样进度值。
 * 浏览器在采样点之间线性插值，配合足够的采样密度即可还原真实弹簧曲线（含回弹）。
 */
export function springToCss(config: SpringConfig): CssSpring {
  const physics = springToPhysics(config);
  const duration = springSettleTime(physics);
  const sampleCount = Math.max(Math.ceil(duration * SPRING_SAMPLES_PER_SECOND), MIN_SAMPLES);
  const points: number[] = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const t = (index / sampleCount) * duration;
    points.push(round(springProgress(physics, t)));
  }
  // 端点精确对齐，避免动画结束时出现亚像素跳动
  points[0] = 0;
  points[points.length - 1] = 1;
  return {
    easing: `linear(${points.join(', ')})`,
    durationMs: Math.round(duration * MS_PER_SECOND),
  };
}
