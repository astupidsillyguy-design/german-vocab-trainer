import { springStep, springToPhysics, type SpringPhysics } from '../design/math/spring';
import { springRest, type SpringConfig } from '../design/tokens';
import { frameLoop as defaultLoop, type FrameLoop } from './frameLoop';

const MS_PER_SECOND = 1000;

/**
 * 单个可打断的弹簧通道。
 *
 * 状态以“上一次改目标时的位移 x0、速度 v0 与时间”记录，任意时刻的位置都由解析解直接求出：
 * 与帧率无关，也不会因为掉帧而积累误差。中途改目标时以当前位置与速度作为新的初始条件，
 * 因此运动方向可以随时反转而速度保持连续（手势松手、快速连点都不会“顿一下”）。
 */
export class Spring {
  #physics: SpringPhysics;
  readonly #precision: number;
  #target: number;
  #value: number;
  #velocity = 0;
  #x0 = 0;
  #v0 = 0;
  #startedAt = 0;
  #resting = true;

  constructor(value: number, config: SpringConfig, precision: number = springRest.unit) {
    this.#physics = springToPhysics(config);
    this.#precision = precision;
    this.#target = value;
    this.#value = value;
  }

  get value(): number {
    return this.#value;
  }

  /** 单位/秒 */
  get velocity(): number {
    return this.#velocity;
  }

  get target(): number {
    return this.#target;
  }

  get isResting(): boolean {
    return this.#resting;
  }

  /** 改目标；`velocity` 省略时继承当前速度 */
  setTarget(target: number, now: number, velocity?: number): void {
    this.advance(now);
    this.#begin(target, velocity ?? this.#velocity, now);
  }

  /** 切换弹簧参数（例如拖动中跟手、松手后回弹），保持当前位置与速度 */
  setConfig(config: SpringConfig, now: number): void {
    this.advance(now);
    this.#physics = springToPhysics(config);
    if (!this.#resting) this.#begin(this.#target, this.#velocity, now);
  }

  /** 立即跳到某个值并静止 */
  jump(value: number): void {
    this.#target = value;
    this.#value = value;
    this.#velocity = 0;
    this.#resting = true;
  }

  /** 推进到 now 时刻；返回是否仍在运动 */
  advance(now: number): boolean {
    if (this.#resting) return false;
    const elapsed = Math.max(now - this.#startedAt, 0) / MS_PER_SECOND;
    const { displacement, velocity } = springStep(this.#physics, this.#x0, this.#v0, elapsed);
    if (this.#isSettled(displacement, velocity)) {
      this.jump(this.#target);
      return false;
    }
    this.#value = this.#target + displacement;
    this.#velocity = velocity;
    return true;
  }

  #begin(target: number, velocity: number, now: number): void {
    this.#target = target;
    this.#x0 = this.#value - target;
    this.#v0 = velocity;
    this.#startedAt = now;
    this.#velocity = velocity;
    this.#resting = this.#isSettled(this.#x0, velocity);
    if (this.#resting) this.jump(target);
  }

  #isSettled(displacement: number, velocity: number): boolean {
    return (
      Math.abs(displacement) < this.#precision &&
      Math.abs(velocity) < this.#precision * springRest.restSpeedFactor
    );
  }
}

export type SpringValues<Key extends string> = Readonly<Record<Key, number>>;

export interface SpringAnimationOptions<Key extends string> {
  readonly initial: SpringValues<Key>;
  readonly config: SpringConfig;
  /** 静止精度；可按通道分别指定 */
  readonly precision?: number | Partial<Record<Key, number>>;
  /** 每帧（以及 set 时）调用一次，在这里直接写样式，不要触发 React 渲染 */
  readonly onUpdate: (values: SpringValues<Key>, velocities: SpringValues<Key>) => void;
  /** 从静止开始运动 */
  readonly onStart?: () => void;
  /** 所有通道都已静止 */
  readonly onRest?: () => void;
  readonly loop?: FrameLoop;
  readonly now?: () => number;
}

/** 可在运行中替换的回调（React 绑定在每次渲染后换成最新闭包） */
export type SpringCallbacks<Key extends string> = Pick<
  SpringAnimationOptions<Key>,
  'onUpdate' | 'onStart' | 'onRest'
>;

export interface AnimateOptions<Key extends string> {
  /** 初速度（单位/秒），用于继承手势速度；省略时保持当前速度 */
  readonly velocity?: Partial<Record<Key, number>>;
  /** 本次运动使用的弹簧参数 */
  readonly config?: SpringConfig;
}

/**
 * 多通道弹簧动画（例如 x / y、位置 / 拉伸），共用一个帧循环，每帧只回调一次。
 */
export class SpringAnimation<Key extends string> {
  readonly #springs: ReadonlyMap<Key, Spring>;
  readonly #options: SpringAnimationOptions<Key>;
  #callbacks: SpringCallbacks<Key>;
  readonly #loop: FrameLoop;
  readonly #now: () => number;
  #config: SpringConfig;
  #removeTask: (() => void) | null = null;

  constructor(options: SpringAnimationOptions<Key>) {
    this.#options = options;
    this.#callbacks = options;
    this.#loop = options.loop ?? defaultLoop;
    this.#now = options.now ?? (() => performance.now());
    this.#config = options.config;
    const springs = new Map<Key, Spring>();
    for (const key of Object.keys(options.initial) as Key[]) {
      springs.set(key, new Spring(options.initial[key], options.config, this.#precisionOf(key)));
    }
    this.#springs = springs;
  }

  get isAnimating(): boolean {
    return this.#removeTask !== null;
  }

  value(key: Key): number {
    return this.#spring(key).value;
  }

  velocity(key: Key): number {
    return this.#spring(key).velocity;
  }

  target(key: Key): number {
    return this.#spring(key).target;
  }

  /** 以弹簧运动到目标；与当前目标相同且未指定速度时不打断正在进行的运动 */
  animateTo(targets: Partial<Record<Key, number>>, options: AnimateOptions<Key> = {}): void {
    const now = this.#now();
    if (options.config !== undefined && options.config !== this.#config) {
      this.#config = options.config;
      for (const spring of this.#springs.values()) spring.setConfig(options.config, now);
    }
    let moving = false;
    for (const [key, spring] of this.#springs) {
      const target = targets[key];
      const velocity = options.velocity?.[key];
      if (target !== undefined && (target !== spring.target || velocity !== undefined)) {
        spring.setTarget(target, now, velocity);
      }
      moving ||= !spring.isResting;
    }
    if (moving) this.#start();
  }

  /** 立即跳到指定值（同步回调 onUpdate）；被跳转的通道停止运动 */
  set(values: Partial<Record<Key, number>>): void {
    for (const [key, spring] of this.#springs) {
      const value = values[key];
      if (value !== undefined) spring.jump(value);
    }
    this.#emit();
    if (this.isAnimating && this.#allResting()) this.#finish();
  }

  /** 停在当前位置 */
  stop(): void {
    for (const spring of this.#springs.values()) spring.jump(spring.value);
    if (this.isAnimating) this.#finish();
  }

  /** 替换回调；不影响正在进行的运动 */
  setCallbacks(callbacks: SpringCallbacks<Key>): void {
    this.#callbacks = callbacks;
  }

  /** 移出帧循环，不再回调 */
  dispose(): void {
    this.#removeTask?.();
    this.#removeTask = null;
  }

  #start(): void {
    if (this.#removeTask !== null) return;
    this.#callbacks.onStart?.();
    this.#removeTask = this.#loop.add(this.#tick);
  }

  readonly #tick = (now: number): boolean => {
    let moving = false;
    for (const spring of this.#springs.values()) moving = spring.advance(now) || moving;
    this.#emit();
    if (moving) return true;
    this.#removeTask = null;
    this.#callbacks.onRest?.();
    return false;
  };

  #finish(): void {
    this.dispose();
    this.#callbacks.onRest?.();
  }

  #allResting(): boolean {
    for (const spring of this.#springs.values()) if (!spring.isResting) return false;
    return true;
  }

  #emit(): void {
    const values = {} as Record<Key, number>;
    const velocities = {} as Record<Key, number>;
    for (const [key, spring] of this.#springs) {
      values[key] = spring.value;
      velocities[key] = spring.velocity;
    }
    this.#callbacks.onUpdate(values, velocities);
  }

  #spring(key: Key): Spring {
    const spring = this.#springs.get(key);
    if (spring === undefined) throw new Error(`未知的弹簧通道：${key}`);
    return spring;
  }

  #precisionOf(key: Key): number {
    const { precision } = this.#options;
    if (typeof precision === 'number') return precision;
    return precision?.[key] ?? springRest.unit;
  }
}
