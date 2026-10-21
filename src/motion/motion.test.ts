import { describe, expect, it, vi } from 'vitest';
import { gesture, springs } from '../design/tokens';
import {
  clamp,
  createFrameLoop,
  NAV_DIRECTION_ATTRIBUTE,
  navigationDirection,
  nearestSnapPoint,
  presentEntries,
  projectMomentum,
  reconcilePresence,
  removeExited,
  rubberband,
  rubberbandClamp,
  runViewTransition,
  Spring,
  SpringAnimation,
  VelocityTracker,
  type FrameScheduler,
  type TransitionDocument,
} from '.';

const FRAME_MS = 16;

/** 手动推进的帧调度器 */
function manualScheduler() {
  let pending: ((now: number) => void) | null = null;
  let now = 0;
  let requests = 0;
  const scheduler: FrameScheduler = {
    request: (callback) => {
      pending = callback;
      requests += 1;
      return requests;
    },
    cancel: () => {
      pending = null;
    },
  };
  return {
    scheduler,
    get now() {
      return now;
    },
    get hasPending() {
      return pending !== null;
    },
    frame(ms = FRAME_MS) {
      now += ms;
      const callback = pending;
      pending = null;
      callback?.(now);
    },
    run(maxFrames = 600) {
      for (let index = 0; index < maxFrames && pending !== null; index += 1) this.frame();
    },
  };
}

describe('createFrameLoop', () => {
  it('帧时间与弹簧起点共用 performance 时钟，不受 rAF 时间原点差异影响', () => {
    let pending: FrameRequestCallback | undefined;
    let now = 10_000;
    const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      pending = callback;
      return 1;
    });
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    const animation = new SpringAnimation({
      initial: { scale: 1 },
      config: springs.press,
      onUpdate: vi.fn(),
      loop: createFrameLoop(),
    });
    try {
      animation.animateTo({ scale: 1.04 });
      now += FRAME_MS;
      expect(pending).toBeDefined();
      // jsdom / 多 realm 环境的 rAF 时间戳可能采用另一个时间原点。
      pending?.(FRAME_MS);
      expect(animation.value('scale')).toBeGreaterThan(1);
    } finally {
      animation.dispose();
      clock.mockRestore();
      cancel.mockRestore();
      request.mockRestore();
    }
  });

  it('所有任务共用一次请求，返回 false 的任务被移除，空闲时停止', () => {
    const clock = manualScheduler();
    const loop = createFrameLoop(clock.scheduler);
    let a = 0;
    let b = 0;
    loop.add(() => {
      a += 1;
      return a < 2;
    });
    loop.add(() => {
      b += 1;
      return true;
    });
    expect(loop.size).toBe(2);
    clock.frame();
    clock.frame();
    expect(a).toBe(2);
    expect(b).toBe(2);
    expect(loop.size).toBe(1);
  });

  it('移除最后一个任务时取消已请求的帧', () => {
    const clock = manualScheduler();
    const loop = createFrameLoop(clock.scheduler);
    const remove = loop.add(() => true);
    expect(clock.hasPending).toBe(true);
    remove();
    expect(clock.hasPending).toBe(false);
    expect(loop.size).toBe(0);
  });

  it('执行中新增的任务从下一帧开始', () => {
    const clock = manualScheduler();
    const loop = createFrameLoop(clock.scheduler);
    const order: string[] = [];
    loop.add(() => {
      order.push('first');
      loop.add(() => {
        order.push('second');
        return false;
      });
      return false;
    });
    clock.frame();
    expect(order).toEqual(['first']);
    clock.frame();
    expect(order).toEqual(['first', 'second']);
  });
});

describe('Spring', () => {
  it('收敛到目标并精确停在目标上', () => {
    const spring = new Spring(0, springs.smooth);
    spring.setTarget(100, 0);
    let now = 0;
    while (spring.advance(now)) now += FRAME_MS;
    expect(spring.value).toBe(100);
    expect(spring.velocity).toBe(0);
    expect(spring.isResting).toBe(true);
  });

  it('中途改目标时速度连续（可打断）', () => {
    const spring = new Spring(0, springs.snappy);
    spring.setTarget(100, 0);
    spring.advance(100);
    const before = spring.velocity;
    expect(before).toBeGreaterThan(0);
    spring.setTarget(0, 100);
    expect(spring.velocity).toBeCloseTo(before);
    spring.advance(116);
    expect(spring.value).toBeGreaterThan(0);
  });

  it('可以指定初速度（继承手势速度）', () => {
    const spring = new Spring(0, springs.fling);
    spring.setTarget(0, 0, 1000);
    expect(spring.isResting).toBe(false);
    spring.advance(50);
    expect(spring.value).toBeGreaterThan(0);
  });

  it('jump 立即静止；setConfig 保持当前位置', () => {
    const spring = new Spring(0, springs.smooth);
    spring.setTarget(50, 0);
    spring.advance(100);
    const value = spring.value;
    spring.setConfig(springs.bouncy, 100);
    expect(spring.value).toBeCloseTo(value);
    spring.jump(10);
    expect(spring.value).toBe(10);
    expect(spring.isResting).toBe(true);
    expect(spring.advance(200)).toBe(false);
  });

  it('目标等于当前值且无速度时直接静止', () => {
    const spring = new Spring(5, springs.smooth);
    spring.setTarget(5, 0);
    expect(spring.isResting).toBe(true);
  });
});

describe('SpringAnimation', () => {
  function setup(initial = { x: 0, y: 0 }) {
    const clock = manualScheduler();
    const loop = createFrameLoop(clock.scheduler);
    const onUpdate = vi.fn();
    const onStart = vi.fn();
    const onRest = vi.fn();
    const animation = new SpringAnimation<'x' | 'y'>({
      initial,
      config: springs.snappy,
      onUpdate,
      onStart,
      onRest,
      loop,
      now: () => clock.now,
    });
    return { clock, loop, animation, onUpdate, onStart, onRest };
  }

  it('每帧回调一次所有通道，静止后回调 onRest 并离开帧循环', () => {
    const { clock, loop, animation, onUpdate, onStart, onRest } = setup();
    animation.animateTo({ x: 10, y: 20 });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(animation.isAnimating).toBe(true);
    clock.run();
    expect(onRest).toHaveBeenCalledTimes(1);
    expect(loop.size).toBe(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ x: 10, y: 20 }, { x: 0, y: 0 });
    expect(animation.value('x')).toBe(10);
    expect(animation.target('y')).toBe(20);
  });

  it('目标不变时不打断正在进行的运动', () => {
    const { clock, animation, onStart } = setup();
    animation.animateTo({ x: 10 });
    clock.frame();
    const velocity = animation.velocity('x');
    animation.animateTo({ x: 10 });
    expect(animation.velocity('x')).toBe(velocity);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('set 同步回调并停止被跳转的通道；全部静止时结束', () => {
    const { animation, onUpdate, onRest } = setup();
    animation.animateTo({ x: 10 });
    animation.set({ x: 3 });
    expect(onUpdate).toHaveBeenLastCalledWith({ x: 3, y: 0 }, { x: 0, y: 0 });
    expect(animation.isAnimating).toBe(false);
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it('stop 停在当前位置；dispose 后不再回调', () => {
    const { clock, animation, onUpdate } = setup();
    animation.animateTo({ x: 100 });
    clock.frame();
    animation.stop();
    const value = animation.value('x');
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
    animation.animateTo({ x: 0 });
    animation.dispose();
    onUpdate.mockClear();
    clock.run();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('可以按次切换弹簧参数并传入初速度', () => {
    const { clock, animation } = setup();
    animation.animateTo({ x: 0 }, { velocity: { x: 500 }, config: springs.bouncy });
    clock.frame();
    expect(animation.value('x')).toBeGreaterThan(0);
  });

  it('setCallbacks 替换回调', () => {
    const { clock, animation, onUpdate } = setup();
    const replacement = vi.fn();
    animation.setCallbacks({ onUpdate: replacement });
    animation.animateTo({ x: 5 });
    clock.frame();
    expect(replacement).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('未知通道抛出错误', () => {
    const { animation } = setup();
    expect(() => animation.value('z' as 'x')).toThrow();
  });
});

describe('VelocityTracker', () => {
  it('按最近时间窗口计算速度（px/s）', () => {
    const tracker = new VelocityTracker();
    tracker.add(0, 0, 0);
    tracker.add(50, 50, -25);
    tracker.add(100, 100, -50);
    expect(tracker.velocity(100)).toEqual({ x: 1000, y: -500 });
  });

  it('只保留窗口内的样本', () => {
    const tracker = new VelocityTracker(gesture.velocityWindowMs);
    tracker.add(0, 0, 0);
    tracker.add(500, 500, 0);
    tracker.add(550, 510, 0);
    tracker.add(600, 520, 0);
    expect(tracker.velocity(600).x).toBeCloseTo(200);
  });

  it('松手前停顿过则速度为 0；样本不足时为 0', () => {
    const tracker = new VelocityTracker();
    expect(tracker.velocity()).toEqual({ x: 0, y: 0 });
    tracker.add(0, 0, 0);
    tracker.add(16, 30, 0);
    expect(tracker.velocity(16 + gesture.velocityStaleMs + 1)).toEqual({ x: 0, y: 0 });
    tracker.reset();
    expect(tracker.velocity()).toEqual({ x: 0, y: 0 });
  });
});

describe('手势数学', () => {
  it('橡皮筋：越拉越紧，永远不超过尺寸，保留方向', () => {
    expect(rubberband(0, 100)).toBe(0);
    expect(rubberband(50, 100)).toBeLessThan(50);
    expect(rubberband(10_000, 100)).toBeLessThan(100);
    expect(rubberband(-50, 100)).toBeCloseTo(-rubberband(50, 100));
    expect(rubberband(50, 0)).toBe(0);
  });

  it('rubberbandClamp 只衰减越界部分', () => {
    expect(rubberbandClamp(50, 0, 100, 100)).toBe(50);
    expect(rubberbandClamp(120, 0, 100, 100)).toBeGreaterThan(100);
    expect(rubberbandClamp(120, 0, 100, 100)).toBeLessThan(120);
    expect(rubberbandClamp(-20, 0, 100, 100)).toBeLessThan(0);
  });

  it('惯性投射与 UIScrollView 一致', () => {
    expect(projectMomentum(0)).toBe(0);
    expect(projectMomentum(1000)).toBeCloseTo(499);
    expect(projectMomentum(-1000, gesture.selectionDecelerationRate)).toBeCloseTo(-99);
  });

  it('最近停靠点与 clamp', () => {
    expect(nearestSnapPoint(40, [0, 100, 300])).toBe(0);
    expect(nearestSnapPoint(260, [0, 100, 300])).toBe(300);
    expect(nearestSnapPoint(7, [])).toBe(7);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});

describe('在场状态', () => {
  const keyOf = (item: string): string => item;

  it('删除的项保留在原位并标记 exiting，退场后移除', () => {
    const initial = presentEntries(['a', 'b', 'c'], keyOf);
    const next = reconcilePresence(initial, ['a', 'c'], keyOf);
    expect(next.map((entry) => `${entry.key}:${entry.state}`)).toEqual([
      'a:present',
      'b:exiting',
      'c:present',
    ]);
    expect(removeExited(next, 'b').map((entry) => entry.key)).toEqual(['a', 'c']);
    // 仍在场的项不会被移除
    expect(removeExited(next, 'a')).toBe(next);
  });

  it('新增项插在新列表中前一项之后；重新出现的项恢复在场', () => {
    const initial = presentEntries(['a', 'b'], keyOf);
    const exiting = reconcilePresence(initial, ['b'], keyOf);
    const next = reconcilePresence(exiting, ['x', 'a', 'b', 'y'], keyOf);
    expect(next.map((entry) => `${entry.key}:${entry.state}`)).toEqual([
      'x:present',
      'a:present',
      'b:present',
      'y:present',
    ]);
  });
});

describe('页面过渡', () => {
  it('按路径层级判断方向', () => {
    expect(navigationDirection('/words', '/words/42')).toBe('forward');
    expect(navigationDirection('/words/42', '/words')).toBe('back');
    expect(navigationDirection('/quiz', '/archive')).toBe('lateral');
    expect(navigationDirection('/quiz?x=1', '/archive#top')).toBe('lateral');
  });

  it('不支持 View Transitions 时直接更新', () => {
    const update = vi.fn();
    const doc: TransitionDocument = { documentElement: document.createElement('html') };
    expect(runViewTransition(update, 'forward', doc)).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(doc.documentElement.hasAttribute(NAV_DIRECTION_ATTRIBUTE)).toBe(false);
  });

  it('支持时写入方向、过渡结束后移除，被跳过的过渡不产生未处理的拒绝', async () => {
    const root = document.createElement('html');
    const update = vi.fn();
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const doc: TransitionDocument = {
      documentElement: root,
      startViewTransition: (callback) => {
        callback();
        return { ready: Promise.reject(new Error('skipped')), finished };
      },
    };
    expect(runViewTransition(update, 'back', doc)).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(root.getAttribute(NAV_DIRECTION_ATTRIBUTE)).toBe('back');
    finish();
    await finished;
    await Promise.resolve();
    await Promise.resolve();
    expect(root.hasAttribute(NAV_DIRECTION_ATTRIBUTE)).toBe(false);
  });

  it('下一个过渡已开始时不移除它的方向', async () => {
    const root = document.createElement('html');
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const doc: TransitionDocument = {
      documentElement: root,
      startViewTransition: (callback) => {
        callback();
        return { ready: Promise.resolve(), finished };
      },
    };
    runViewTransition(() => undefined, 'forward', doc);
    root.setAttribute(NAV_DIRECTION_ATTRIBUTE, 'lateral');
    finish();
    await finished;
    await Promise.resolve();
    await Promise.resolve();
    expect(root.getAttribute(NAV_DIRECTION_ATTRIBUTE)).toBe('lateral');
  });
});
