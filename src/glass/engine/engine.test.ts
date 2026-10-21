import { describe, expect, it, vi } from 'vitest';
import { wallpaper } from '../../design/tokens';
import { MAX_BLUR_TAPS } from '../math/blurPlan';
import { PROFILE_SIZE } from '../math/profile';
import { resolveOptics } from '../optics';
import {
  EASE_EPSILON,
  easeToward,
  FlowGate,
  FrameBudget,
  isFrameDue,
  WallpaperClock,
} from './activity';
import { isSoftwareRenderer, rendererName } from './gl';
import { GlassRegistry } from './registry';
import { FrameScheduler, type FrameHost } from './scheduler';
import {
  BLUR_SHADER,
  BLUR_UNIFORMS,
  COPY_SHADER,
  COPY_UNIFORMS,
  GLASS_SHADER,
  GLASS_UNIFORMS,
  MAX_BLOBS,
  MAX_SHAPES,
  VERTEX_SHADER,
  WALLPAPER_SHADER,
  WALLPAPER_UNIFORMS,
} from './shaders';

/** 手动驱动的 rAF */
function manualHost() {
  const callbacks = new Map<number, (now: number) => void>();
  let next = 1;
  const host: FrameHost = {
    request: (callback) => {
      const handle = next;
      next += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      callbacks.delete(handle);
    },
  };
  return {
    host,
    get pending() {
      return callbacks.size;
    },
    flush(now: number) {
      const due = [...callbacks.values()];
      callbacks.clear();
      for (const callback of due) callback(now);
    },
  };
}

describe('帧调度器', () => {
  it('invalidate 合并为一帧；没有持续原因时不再请求', () => {
    const frames = manualHost();
    const render = vi.fn();
    const scheduler = new FrameScheduler(frames.host, render);
    scheduler.invalidate();
    scheduler.invalidate();
    expect(frames.pending).toBe(1);
    frames.flush(16);
    expect(render).toHaveBeenCalledWith(16);
    expect(scheduler.isScheduled).toBe(false);
  });

  it('持续原因存在时逐帧请求，全部移除后停止', () => {
    const frames = manualHost();
    const render = vi.fn();
    const scheduler = new FrameScheduler(frames.host, render);
    scheduler.setContinuous('wallpaper', true);
    scheduler.setContinuous('pointer', true);
    frames.flush(1);
    frames.flush(2);
    expect(render).toHaveBeenCalledTimes(2);
    scheduler.setContinuous('wallpaper', false);
    expect(scheduler.isContinuous('pointer')).toBe(true);
    frames.flush(3);
    scheduler.setContinuous('pointer', false);
    frames.flush(4);
    expect(render).toHaveBeenCalledTimes(4);
    expect(frames.pending).toBe(0);
  });

  it('暂停时取消挂起的帧并拒绝请求；恢复后补绘一帧', () => {
    const frames = manualHost();
    const render = vi.fn();
    const scheduler = new FrameScheduler(frames.host, render);
    scheduler.setContinuous('wallpaper', true);
    scheduler.setPaused(true);
    expect(frames.pending).toBe(0);
    scheduler.invalidate();
    expect(frames.pending).toBe(0);
    scheduler.setPaused(false);
    expect(frames.pending).toBe(1);
    frames.flush(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('释放后不再渲染', () => {
    const frames = manualHost();
    const render = vi.fn();
    const scheduler = new FrameScheduler(frames.host, render);
    scheduler.invalidate();
    scheduler.dispose();
    scheduler.invalidate();
    frames.flush(1);
    expect(render).not.toHaveBeenCalled();
  });
});

describe('壁纸流动', () => {
  it('时钟只在流动时累加，单帧最多推进 100ms', () => {
    const clock = new WallpaperClock();
    clock.tick(0, true);
    expect(clock.tick(50, true)).toBeCloseTo(0.05);
    clock.tick(1000, false);
    clock.tick(5000, true);
    expect(clock.seconds).toBeCloseTo(0.05);
    expect(clock.tick(10_000, true)).toBeCloseTo(0.15);
  });

  it('减少动态效果、失焦、隐藏、长时间无输入时冻结', () => {
    const gate = new FlowGate(wallpaper.idlePauseMs, 0);
    const active = { reducedMotion: false, focused: true, hidden: false };
    expect(gate.isFlowing(1000, active)).toBe(true);
    expect(gate.isFlowing(1000, { ...active, reducedMotion: true })).toBe(false);
    expect(gate.isFlowing(1000, { ...active, focused: false })).toBe(false);
    expect(gate.isFlowing(1000, { ...active, hidden: true })).toBe(false);
    expect(gate.isFlowing(wallpaper.idlePauseMs, active)).toBe(false);
    gate.noteInput(wallpaper.idlePauseMs);
    expect(gate.isFlowing(wallpaper.idlePauseMs + 1, active)).toBe(true);
  });

  it('帧率上限带 10% 容差', () => {
    const interval = 1000 / wallpaper.fps;
    expect(isFrameDue(interval, 0, wallpaper.fps)).toBe(true);
    expect(isFrameDue(interval * 0.95, 0, wallpaper.fps)).toBe(true);
    expect(isFrameDue(interval / 2, 0, wallpaper.fps)).toBe(false);
  });

  it('指数缓动：经过 τ 走完 63%，足够接近时吸附到目标', () => {
    expect(easeToward(0, 1, 120, 120)).toBeCloseTo(1 - Math.exp(-1));
    expect(easeToward(1 - EASE_EPSILON / 2, 1, 1, 120)).toBe(1);
    expect(easeToward(0, 1, 16, 0)).toBe(1);
  });
});

describe('帧开销预算', () => {
  const options = { warmupFrames: 2, slowFrameMs: 32, windowFrames: 5, maxSlowFrames: 3 };

  it('忽略预热帧；窗口内慢帧达到上限才判定超支', () => {
    const budget = new FrameBudget(options);
    expect(budget.record(500)).toBe(false);
    expect(budget.record(500)).toBe(false);
    expect(budget.record(40)).toBe(false);
    expect(budget.record(5)).toBe(false);
    expect(budget.record(40)).toBe(false);
    expect(budget.record(40)).toBe(true);
  });

  it('偶发卡顿滑出窗口后不累计', () => {
    const budget = new FrameBudget(options);
    for (const cost of [0, 0, 40, 40, 5, 5, 5, 5, 40]) expect(budget.record(cost)).toBe(false);
  });
});

describe('渲染器识别', () => {
  function fakeGl(renderer: string, unmasked: string | null) {
    const UNMASKED = 0x9246;
    return {
      RENDERER: 0x1f01,
      getParameter: (name: number) => (name === UNMASKED ? unmasked : renderer),
      getExtension: () => (unmasked === null ? null : { UNMASKED_RENDERER_WEBGL: UNMASKED }),
    } as unknown as WebGL2RenderingContext;
  }

  it('名称被屏蔽时读取调试扩展；否则直接使用 RENDERER（Firefox）', () => {
    expect(rendererName(fakeGl('WebKit WebGL', 'ANGLE (Apple, Apple M2, OpenGL 4.1)'))).toBe(
      'ANGLE (Apple, Apple M2, OpenGL 4.1)',
    );
    expect(rendererName(fakeGl('WebKit WebGL', null))).toBe('WebKit WebGL');
    expect(rendererName(fakeGl('Mesa Intel(R) UHD Graphics', 'unused'))).toBe(
      'Mesa Intel(R) UHD Graphics',
    );
  });

  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Microsoft Basic Render Driver',
  ])('软件渲染：%s', (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(true);
  });

  it.each([
    'Apple GPU',
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
    'Adreno (TM) 740',
  ])('硬件渲染：%s', (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(false);
  });
});

describe('登记簿', () => {
  function group(registry: GlassRegistry) {
    return registry.addGroup(
      {
        root: document.createElement('div'),
        canvas: document.createElement('canvas'),
        optics: resolveOptics('regular'),
        spacing: 24,
      },
      false,
    );
  }

  it('组与形状分配唯一 id；按元素反查', () => {
    const registry = new GlassRegistry();
    const first = group(registry);
    const second = group(registry);
    expect(first.id).not.toBe(second.id);
    const element = document.createElement('div');
    first.dirty = false;
    const shape = registry.addShape(first, {
      element,
      kind: 'capsule',
      radius: 0,
      tint: [0, 0, 0, 0],
    });
    expect(first.dirty).toBe(true);
    expect(shape.id).not.toBe(second.id);
    expect(registry.groupsOf(element)).toEqual([first]);
    expect(registry.groupsOf(second.root)).toEqual([second]);
    expect(registry.isReferenced(document.createElement('div'))).toBe(false);
  });

  it('可见组筛选、全部标脏、移除', () => {
    const registry = new GlassRegistry();
    const first = group(registry);
    const second = group(registry);
    second.visible = true;
    first.dirty = false;
    second.dirty = false;
    expect(registry.visibleGroups()).toEqual([second]);
    registry.markAllDirty();
    expect([first.dirty, second.dirty]).toEqual([true, true]);
    expect(registry.removeGroup(first.id)).toBe(first);
    expect(registry.removeGroup(first.id)).toBeUndefined();
    expect(registry.isReferenced(first.root)).toBe(false);
  });
});

describe('着色器', () => {
  const programs = [
    ['wallpaper', WALLPAPER_SHADER, WALLPAPER_UNIFORMS],
    ['copy', COPY_SHADER, COPY_UNIFORMS],
    ['blur', BLUR_SHADER, BLUR_UNIFORMS],
    ['glass', GLASS_SHADER, GLASS_UNIFORMS],
  ] as const;

  function declaredUniforms(source: string): string[] {
    return [...source.matchAll(/^uniform\s+\w+\s+(\w+)/gm)].map((match) => match[1] ?? '');
  }

  it.each(programs)('%s：导出的 uniform 名单与源码声明完全一致', (_name, source, uniforms) => {
    expect(declaredUniforms(source).sort()).toEqual([...uniforms].sort());
  });

  it.each([
    ['vertex', VERTEX_SHADER] as const,
    ...programs.map(([name, source]) => [name, source] as const),
  ])('%s：GLSL ES 3.0，数组上限由 TS 常量注入', (_name, source) => {
    expect(source.startsWith('#version 300 es\n')).toBe(true);
    expect(source).not.toMatch(/\$\{|undefined|NaN/);
  });

  it('数组长度与 JS 侧常量一致', () => {
    expect(WALLPAPER_SHADER).toContain(`#define MAX_BLOBS ${String(MAX_BLOBS)}`);
    expect(BLUR_SHADER).toContain(`#define MAX_TAPS ${String(MAX_BLUR_TAPS)}`);
    expect(GLASS_SHADER).toContain(`#define MAX_SHAPES ${String(MAX_SHAPES)}`);
    expect(GLASS_SHADER).toContain(`#define PROFILE_SIZE ${String(PROFILE_SIZE)}`);
    expect(wallpaper.blobs.length).toBeLessThanOrEqual(MAX_BLOBS);
  });
});
