import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { glassVariants, radius } from '../../design/tokens';
import type { GlassEngineCallbacks, GlassEngineLoader } from '../../glass';
import { createFakeEngine, FULL_CAPABILITIES, type FakeEngine } from '../../test/glassEngine';
import { setMediaQuery, setReducedMotion } from '../../test/viewport';
import { GlassGroup, GlassProvider, GlassWallpaper, LiquidGlass, useGlass } from '..';
import { GlassContext, ShapeHub, type GlassContextValue } from '../Glass/GlassContext';
import { clearRefractionMapCache } from '../Glass/refractionMap';

const PREFERENCE_STORAGE_KEY = 'gvt.pref.glass.tier';

function webglContext(engine: FakeEngine['engine']): GlassContextValue {
  return {
    tier: 'webgl',
    capabilities: FULL_CAPABILITIES,
    engine,
    engineStatus: 'ready',
    preference: 'auto',
    setPreference: () => undefined,
  };
}

function WithEngine({
  fake,
  children,
}: {
  readonly fake: FakeEngine;
  readonly children: ReactNode;
}) {
  return <GlassContext value={webglContext(fake.engine)}>{children}</GlassContext>;
}

function tierContext(tier: GlassContextValue['tier']): GlassContextValue {
  return { ...webglContext(createFakeEngine().engine), tier, engine: null };
}

describe('ShapeHub', () => {
  it('组就绪前暂存形状，attach 时统一提交；detach 后可重新提交（含期间的更新）', () => {
    const fake = createFakeEngine();
    const hub = new ShapeHub();
    const element = document.createElement('div');
    const shape = hub.add({ element, kind: 'squircle', radius: 12, tint: [0, 0, 0, 0] });
    expect(hub.size).toBe(1);

    const first = fake.engine.registerGroup({
      root: element,
      canvas: document.createElement('canvas'),
      optics: {
        ...glassVariants.regular,
        tint: [0, 0, 0, 0],
        rim: [0, 0, 0, 0],
        blurPx: 0,
        saturation: 1,
      },
      spacing: 0,
    });
    hub.attach(first);
    const [group] = fake.groups;
    if (group === undefined) throw new Error('未注册组');
    expect(fake.activeShapes(group)).toHaveLength(1);

    hub.detach();
    expect(fake.activeShapes(group)).toHaveLength(0);
    shape.update({ radius: 20 });
    hub.setPointer({ x: 1, y: 2 });
    expect(group.setPointer).not.toHaveBeenCalled();

    hub.attach(first);
    expect(fake.activeShapes(group)).toEqual([expect.objectContaining({ radius: 20 })]);
    hub.setPointer(null);
    expect(group.setPointer).toHaveBeenCalledWith(null);

    shape.remove();
    expect(hub.size).toBe(0);
    expect(fake.activeShapes(group)).toHaveLength(0);
  });
});

describe('GlassProvider', () => {
  let fake: FakeEngine;
  let loader: ReturnType<typeof vi.fn<GlassEngineLoader>>;
  let callbacks: GlassEngineCallbacks | undefined;

  beforeEach(() => {
    fake = createFakeEngine();
    callbacks = undefined;
    loader = vi.fn<GlassEngineLoader>((received) => {
      callbacks = received;
      return Promise.resolve(fake.engine);
    });
  });

  function Probe() {
    const glass = useGlass();
    return (
      <button
        type="button"
        onClick={() => {
          glass.setPreference('opaque');
        }}
      >
        {`${glass.tier}:${glass.engine === null ? 'none' : 'engine'}`}
      </button>
    );
  }

  function renderProvider(load: GlassEngineLoader = loader) {
    return render(
      <GlassProvider capabilities={FULL_CAPABILITIES} loadEngine={load}>
        <Probe />
      </GlassProvider>,
    );
  }

  const root = () => document.documentElement;

  it('首屏先用 CSS 档，空闲时加载引擎后升级为 webgl；卸载时释放引擎并移除根属性', async () => {
    const view = renderProvider();
    expect(root()).toHaveAttribute('data-glass-tier', 'refraction');
    expect(screen.getByRole('button')).toHaveTextContent('refraction:none');
    await waitFor(() => {
      expect(root()).toHaveAttribute('data-glass-tier', 'webgl');
    });
    expect(screen.getByRole('button')).toHaveTextContent('webgl:engine');
    expect(loader).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(fake.dispose).toHaveBeenCalled();
    expect(root()).not.toHaveAttribute('data-glass-tier');
  });

  it('上下文丢失时立即退回 CSS 档，恢复后升级回来', async () => {
    renderProvider();
    await waitFor(() => {
      expect(root()).toHaveAttribute('data-glass-tier', 'webgl');
    });
    act(() => {
      callbacks?.onStatusChange('lost');
    });
    expect(root()).toHaveAttribute('data-glass-tier', 'refraction');
    act(() => {
      callbacks?.onStatusChange('ready');
    });
    expect(root()).toHaveAttribute('data-glass-tier', 'webgl');
  });

  it('引擎不可用（返回 null 或加载失败）时停留在 CSS 档，不重复加载', async () => {
    const unavailable = vi.fn<GlassEngineLoader>(() => Promise.resolve(null));
    const first = renderProvider(unavailable);
    await waitFor(() => {
      expect(unavailable).toHaveBeenCalledTimes(1);
    });
    expect(root()).toHaveAttribute('data-glass-tier', 'refraction');
    first.unmount();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = vi.fn<GlassEngineLoader>(() => Promise.reject(new Error('编译失败')));
    renderProvider(failing);
    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(root()).toHaveAttribute('data-glass-tier', 'refraction');
  });

  it('偏好持久化：选择“不透明”后写入存储；下次启动按存储的偏好且不加载引擎', async () => {
    const user = userEvent.setup();
    const first = renderProvider();
    await user.click(screen.getByRole('button'));
    expect(root()).toHaveAttribute('data-glass-tier', 'opaque');
    expect(localStorage.getItem(PREFERENCE_STORAGE_KEY)).toBe('opaque');
    first.unmount();

    localStorage.setItem(PREFERENCE_STORAGE_KEY, 'blur');
    const lazy = vi.fn<GlassEngineLoader>(() => Promise.resolve(fake.engine));
    renderProvider(lazy);
    expect(root()).toHaveAttribute('data-glass-tier', 'blur');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(lazy).not.toHaveBeenCalled();
  });

  it('增强对比度时切到不透明档，并跟随系统设置变化', async () => {
    setMediaQuery('(prefers-contrast: more)', true);
    renderProvider();
    expect(root()).toHaveAttribute('data-glass-tier', 'opaque');
    act(() => {
      setMediaQuery('(prefers-contrast: more)', false);
    });
    expect(root()).toHaveAttribute('data-glass-tier', 'refraction');
    await waitFor(() => {
      expect(root()).toHaveAttribute('data-glass-tier', 'webgl');
    });
  });

  it('引擎报告渲染开销超支：释放引擎，永久退回 CSS 档', async () => {
    renderProvider();
    await waitFor(() => {
      expect(root()).toHaveAttribute('data-glass-tier', 'webgl');
    });
    act(() => {
      callbacks?.onStatusChange('degraded');
    });
    expect(root()).toHaveAttribute('data-glass-tier', 'refraction');
    expect(screen.getByRole('button')).toHaveTextContent('refraction:none');
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('“减少动态效果”变化时通知引擎', async () => {
    renderProvider();
    await waitFor(() => {
      expect(fake.setReducedMotion).toHaveBeenLastCalledWith(false);
    });
    act(() => {
      setReducedMotion(true);
    });
    expect(fake.setReducedMotion).toHaveBeenLastCalledWith(true);
  });
});

describe('LiquidGlass', () => {
  afterEach(() => {
    clearRefractionMapCache();
    vi.unstubAllGlobals();
  });

  it('没有 Provider 时按“仅模糊”渲染，变体 token 以变量注入', () => {
    render(<LiquidGlass data-testid="glass">内容</LiquidGlass>);
    const glass = screen.getByTestId('glass');
    expect(glass).toHaveAttribute('data-tier', 'blur');
    expect(glass).toHaveAttribute('data-variant', 'regular');
    expect(glass.style.getPropertyValue('--surface-tint')).toBe('var(--glass-regular-tint)');
    expect(glass.style.getPropertyValue('--surface-blur')).toBe('var(--glass-regular-blur)');
    expect(glass.querySelector('canvas')).toBeNull();
  });

  it('webgl 档：独立的玻璃自带画布并注册为单形状组；卸载时注销', () => {
    const fake = createFakeEngine();
    const view = render(
      <WithEngine fake={fake}>
        <LiquidGlass data-testid="glass" variant="clear" radius="lg">
          内容
        </LiquidGlass>
      </WithEngine>,
    );
    const glass = screen.getByTestId('glass');
    expect(glass).toHaveAttribute('data-tier', 'webgl');
    expect(glass).toHaveAttribute('data-glass-group');
    const canvas = glass.querySelector('canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    const [group] = fake.activeGroups();
    expect(group?.options).toMatchObject({ root: glass, canvas, spacing: 0 });
    expect(group?.options.optics.refraction).toBe(glassVariants.clear.refraction);
    if (group === undefined) throw new Error('未注册组');
    expect(fake.activeShapes(group)).toEqual([
      expect.objectContaining({ element: glass, kind: 'squircle', radius: radius.lg }),
    ]);
    view.unmount();
    expect(fake.activeGroups()).toHaveLength(0);
    expect(fake.activeShapes(group)).toHaveLength(0);
  });

  it('renderer = css 的固定元素在 webgl 档退回 CSS 折射档，不注册引擎', () => {
    const fake = createFakeEngine();
    render(
      <WithEngine fake={fake}>
        <LiquidGlass data-testid="glass" renderer="css" radius="capsule">
          标签栏
        </LiquidGlass>
      </WithEngine>,
    );
    expect(screen.getByTestId('glass')).toHaveAttribute('data-tier', 'refraction');
    expect(fake.groups).toHaveLength(0);
  });

  it('光学参数变化只做增量更新，不重新注册', () => {
    const fake = createFakeEngine();
    const view = render(
      <WithEngine fake={fake}>
        <LiquidGlass optics={{ refraction: 10 }}>内容</LiquidGlass>
      </WithEngine>,
    );
    view.rerender(
      <WithEngine fake={fake}>
        <LiquidGlass optics={{ refraction: 30 }}>内容</LiquidGlass>
      </WithEngine>,
    );
    expect(fake.groups).toHaveLength(1);
    expect(fake.groups[0]?.update.mock.lastCall?.[0].optics?.refraction).toBe(30);
  });

  it('refraction 档：生成位移贴图并通过 SVG 滤镜接入 backdrop-filter', () => {
    const putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AA==',
    );
    vi.stubGlobal(
      'ImageData',
      class {
        readonly data: Uint8ClampedArray;
        readonly width: number;
        readonly height: number;
        constructor(data: Uint8ClampedArray, width: number, height: number) {
          this.data = data;
          this.width = width;
          this.height = height;
        }
      },
    );
    vi.stubGlobal(
      'ResizeObserver',
      class {
        readonly #callback: () => void;
        constructor(callback: () => void) {
          this.#callback = callback;
        }
        observe() {
          this.#callback();
        }
        disconnect() {
          /* 无需清理 */
        }
      },
    );
    render(
      <GlassContext value={tierContext('refraction')}>
        <LiquidGlass data-testid="glass">内容</LiquidGlass>
      </GlassContext>,
    );
    const glass = screen.getByTestId('glass');
    expect(glass).toHaveAttribute('data-refraction');
    const reference = glass.style.getPropertyValue('--glass-refraction');
    const id = /^url\(#(.+)\)$/.exec(reference)?.[1];
    expect(id).toMatch(/^glass-refraction-/);
    const filter = document.getElementById(id ?? '');
    expect(filter?.tagName.toLowerCase()).toBe('filter');
    expect(filter?.closest('svg')?.parentElement).toBe(document.body);
    expect(filter?.querySelector('feImage')).toHaveAttribute('href', 'data:image/png;base64,AA==');
    expect(filter?.querySelector('feDisplacementMap')).toHaveAttribute(
      'scale',
      String(2 * glassVariants.regular.refraction),
    );
    expect(putImageData).toHaveBeenCalledTimes(1);
  });

  it('refraction 档：浏览器无法创建 2D 画布时退回纯模糊', () => {
    render(
      <GlassContext value={tierContext('refraction')}>
        <LiquidGlass data-testid="glass">内容</LiquidGlass>
      </GlassContext>,
    );
    expect(screen.getByTestId('glass')).not.toHaveAttribute('data-refraction');
  });

  it('指针高光（CSS 档）：写入位置变量与标记，离开时清除；保留调用方的事件处理', () => {
    const onPointerMove = vi.fn();
    render(
      <LiquidGlass data-testid="glass" interactive onPointerMove={onPointerMove}>
        内容
      </LiquidGlass>,
    );
    const glass = screen.getByTestId('glass');
    expect(glass).toHaveAttribute('data-interactive');
    fireEvent.pointerMove(glass);
    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(glass).toHaveAttribute('data-pointer');
    expect(glass.style.getPropertyValue('--glass-pointer-x')).toMatch(/px$/);
    fireEvent.pointerLeave(glass);
    expect(glass).not.toHaveAttribute('data-pointer');
  });

  it('指针高光：不透明档关闭；webgl 档交给引擎绘制', () => {
    const view = render(
      <GlassContext value={tierContext('opaque')}>
        <LiquidGlass data-testid="glass" interactive>
          内容
        </LiquidGlass>
      </GlassContext>,
    );
    fireEvent.pointerMove(screen.getByTestId('glass'));
    expect(screen.getByTestId('glass')).not.toHaveAttribute('data-pointer');
    view.unmount();

    const fake = createFakeEngine();
    render(
      <WithEngine fake={fake}>
        <LiquidGlass data-testid="glass" interactive>
          内容
        </LiquidGlass>
      </WithEngine>,
    );
    const glass = screen.getByTestId('glass');
    fireEvent.pointerMove(glass, { clientX: 10, clientY: 20 });
    expect(glass).not.toHaveAttribute('data-pointer');
    expect(fake.groups[0]?.setPointer).toHaveBeenCalledWith({ x: 10, y: 20 });
    fireEvent.pointerLeave(glass);
    expect(fake.groups[0]?.setPointer).toHaveBeenLastCalledWith(null);
  });
});

describe('GlassGroup', () => {
  it('webgl 档：组内多块玻璃共享一张画布、一次注册；融合半径可增量更新', () => {
    const fake = createFakeEngine();
    const tree = (spacing: number) => (
      <WithEngine fake={fake}>
        <GlassGroup data-testid="group" spacing={spacing}>
          <LiquidGlass data-testid="card">卡片</LiquidGlass>
          <LiquidGlass data-testid="pill" variant="prominent" radius="capsule">
            按钮
          </LiquidGlass>
        </GlassGroup>
      </WithEngine>
    );
    const view = render(tree(24));
    const group = screen.getByTestId('group');
    expect(group.querySelectorAll('canvas')).toHaveLength(1);
    expect(screen.getByTestId('card').querySelector('canvas')).toBeNull();
    expect(screen.getByTestId('card')).not.toHaveAttribute('data-glass-group');
    expect(fake.groups).toHaveLength(1);
    const [record] = fake.groups;
    if (record === undefined) throw new Error('未注册组');
    expect(record.options).toMatchObject({ root: group, spacing: 24 });
    expect(fake.activeShapes(record)).toEqual([
      expect.objectContaining({ element: screen.getByTestId('card'), kind: 'squircle' }),
      expect.objectContaining({ element: screen.getByTestId('pill'), kind: 'capsule' }),
    ]);
    // 每块玻璃保留自己变体的着色
    const [card, pill] = fake.activeShapes(record);
    expect(card?.tint).not.toEqual(pill?.tint);

    view.rerender(tree(0));
    expect(record.update).toHaveBeenLastCalledWith(expect.objectContaining({ spacing: 0 }));
    expect(fake.groups).toHaveLength(1);

    view.unmount();
    expect(record.removed).toBe(true);
    expect(fake.activeShapes(record)).toHaveLength(0);
  });

  it('CSS 档：不渲染画布，子元素各自渲染', () => {
    render(
      <GlassGroup data-testid="group">
        <LiquidGlass data-testid="card">卡片</LiquidGlass>
      </GlassGroup>,
    );
    expect(screen.getByTestId('group').querySelector('canvas')).toBeNull();
    expect(screen.getByTestId('card')).toHaveAttribute('data-tier', 'blur');
  });
});

describe('GlassWallpaper', () => {
  it('CSS 档只有静态渐变；webgl 档挂上画布交给引擎，卸载时解除', () => {
    const view = render(<GlassWallpaper />);
    const wallpaper = document.querySelector('[data-glass-wallpaper]');
    expect(wallpaper).toHaveAttribute('aria-hidden', 'true');
    expect(wallpaper?.querySelector('canvas')).toBeNull();
    view.unmount();

    const fake = createFakeEngine();
    const withEngine = render(
      <WithEngine fake={fake}>
        <GlassWallpaper />
      </WithEngine>,
    );
    const element = document.querySelector<HTMLElement>('[data-glass-wallpaper]');
    expect(fake.wallpapers).toEqual([{ element, canvas: element?.querySelector('canvas') }]);
    withEngine.unmount();
    expect(fake.detachWallpaper).toHaveBeenCalledTimes(1);
  });
});
