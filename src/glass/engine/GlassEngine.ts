/**
 * WebGL2 Liquid Glass 引擎。
 *
 * 架构：
 * - 全局只有一个离屏 WebGL2 上下文；每个玻璃组有自己的 2D 画布（随 DOM 原生滚动，没有滞后），
 *   引擎把该组画到 GL 画布左下角，再用 drawImage 拷贝过去；
 * - 动态壁纸画在低分辨率纹理上，同时作为折射/模糊的采样源，并拷贝到全屏的壁纸画布；
 * - 模糊用“降采样金字塔 + 可分离高斯”，按 σ 缓存，壁纸不变就不重算；
 * - 只在有变化时请求帧；只渲染可见的组；页面隐藏时完全暂停；上下文丢失时降级并等待恢复；
 * - 软件渲染器直接放弃；运行中主线程渲染开销持续超出预算时主动降级到 CSS 档（交互 < 100ms 的底线）。
 */
import { blobCenter } from '../../design/math/wallpaper';
import {
  GLASS_CANVAS_BLEED,
  glassLight,
  glassShadow,
  semanticColors,
  wallpaper as wallpaperTokens,
} from '../../design/tokens';
import { planBlur } from '../math/blurPlan';
import { bezelProfile } from '../math/profile';
import { shapeGeometry } from '../math/sdf';
import { opticsEqual, rgbColor, type Vec3 } from '../optics';
import { easeToward, FlowGate, FrameBudget, isFrameDue, WallpaperClock } from './activity';
import {
  bindTarget,
  bindTexture,
  compileShader,
  deleteTarget,
  ensureTarget,
  finishProgram,
  isSoftwareRenderer,
  rendererName,
  startProgram,
  waitForPrograms,
  type Program,
  type RenderTarget,
} from './gl';
import { GlassRegistry, type GroupRecord } from './registry';
import { browserFrameHost, FrameScheduler } from './scheduler';
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
import {
  GLASS_MOTION_EVENT,
  GLASS_RENDERED_ATTRIBUTE,
  type GlassDebugHandle,
  type GlassEngine,
  type GlassEngineCallbacks,
  type GlassEngineStats,
  type GlassGroupHandle,
  type GlassShapeHandle,
  type GroupOptions,
  type WallpaperTarget,
} from './types';

/** 设备像素比上限：超过 2 后肉眼几乎看不出差别，像素数却按平方增长 */
const MAX_PIXEL_RATIO = 2;
/** 提前开始渲染即将滚入视口的组 */
const VISIBILITY_MARGIN = '64px';
/** CSS 过渡/动画结束事件丢失时的兜底时长（ms） */
const TRANSITION_TIMEOUT_MS = 2000;
/** GL 画布按此粒度增长，避免每次尺寸微调都重新分配 */
const CANVAS_GRANULARITY = 256;
const HALF_TURN_DEGREES = 180;
const DEGREES_TO_RADIANS = Math.PI / HALF_TURN_DEGREES;
const FULLSCREEN_TRIANGLE_VERTICES = 3;
const SHAPE_COMPONENTS = 4;
const CORNER_COMPONENTS = 2;
const BLOB_COMPONENTS = 4;
const COLOR_COMPONENTS = 3;
/** 帧开销预算：预热 3 帧后，最近 30 帧里有 5 帧主线程开销超过 32ms（60Hz 下丢两帧）即降级 */
const FRAME_BUDGET = {
  warmupFrames: 3,
  slowFrameMs: 32,
  windowFrames: 30,
  maxSlowFrames: 5,
} as const;
/** 帧开销滑动平均的平滑系数（仅用于统计展示） */
const COST_SMOOTHING = 0.2;
const HORIZONTAL = [1, 0] as const;
const VERTICAL = [0, 1] as const;

const CONTEXT_ATTRIBUTES = {
  alpha: true,
  premultipliedAlpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: false,
  // 软件渲染（被驱动列入黑名单的 GPU）时直接放弃，交给 CSS 档
  failIfMajorPerformanceCaveat: true,
  powerPreference: 'low-power',
} as const satisfies WebGLContextAttributes;

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
const MOTION_START_EVENTS = ['transitionrun', 'animationstart'] as const;
const MOTION_END_EVENTS = [
  'transitionend',
  'transitioncancel',
  'animationend',
  'animationcancel',
] as const;

interface Programs {
  readonly wallpaper: Program<(typeof WALLPAPER_UNIFORMS)[number]>;
  readonly copy: Program<(typeof COPY_UNIFORMS)[number]>;
  readonly blur: Program<(typeof BLUR_UNIFORMS)[number]>;
  readonly glass: Program<(typeof GLASS_UNIFORMS)[number]>;
  readonly vertexArray: WebGLVertexArrayObject;
}

async function createPrograms(gl: WebGL2RenderingContext): Promise<Programs> {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const pending = {
    wallpaper: startProgram(gl, vertex, WALLPAPER_SHADER, WALLPAPER_UNIFORMS),
    copy: startProgram(gl, vertex, COPY_SHADER, COPY_UNIFORMS),
    blur: startProgram(gl, vertex, BLUR_SHADER, BLUR_UNIFORMS),
    glass: startProgram(gl, vertex, GLASS_SHADER, GLASS_UNIFORMS),
  };
  await waitForPrograms(
    gl,
    Object.values(pending).map((program) => program.program),
  );
  if (gl.isContextLost()) throw new Error('编译着色器时 WebGL 上下文丢失');
  const programs = {
    wallpaper: finishProgram(gl, pending.wallpaper),
    copy: finishProgram(gl, pending.copy),
    blur: finishProgram(gl, pending.blur),
    glass: finishProgram(gl, pending.glass),
    vertexArray: gl.createVertexArray(),
  };
  gl.deleteShader(vertex);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  return programs;
}

function roundUp(value: number, granularity: number): number {
  return Math.ceil(value / granularity) * granularity;
}

interface BlurEntry {
  target: RenderTarget;
  valid: boolean;
}

interface WallpaperState {
  readonly target: WallpaperTarget;
  readonly context: CanvasRenderingContext2D | null;
  rendered: boolean;
}

const WALLPAPER_COLORS: readonly Vec3[] = wallpaperTokens.blobs.map((blob) =>
  rgbColor(semanticColors.light.wallpaper[blob.color]),
);
const WALLPAPER_BASE = rgbColor(semanticColors.light.wallpaper.base);
const SHADOW_COLOR = rgbColor(glassShadow.color);
const LIGHT_ANGLE = glassLight.angleDeg * DEGREES_TO_RADIANS;

class WebGlGlassEngine implements GlassEngine {
  readonly #canvas: HTMLCanvasElement;
  readonly #gl: WebGL2RenderingContext;
  readonly #callbacks: GlassEngineCallbacks;
  readonly #loseContext: WEBGL_lose_context | null;
  readonly #registry = new GlassRegistry();
  readonly #clock = new WallpaperClock();
  readonly #gate = new FlowGate(wallpaperTokens.idlePauseMs, performance.now());
  readonly #scheduler: FrameScheduler;
  readonly #profiles = new Map<number, Float32Array>();
  readonly #blurCache = new Map<number, BlurEntry>();
  readonly #pongs = new Map<number, RenderTarget>();
  readonly #pyramid: RenderTarget[] = [];
  readonly #disposers: (() => void)[] = [];
  readonly #intersection: IntersectionObserver | null;
  readonly #resize: ResizeObserver | null;
  readonly #maxSize: number;
  /** null = 不做开销检查（开发模式下强制启用 WebGL） */
  readonly #budget: FrameBudget | null;
  #programs: Programs | null;
  #status: 'ready' | 'lost' = 'ready';
  #reducedMotion: boolean;
  #focused = document.hasFocus();
  #wallpaper: WallpaperState | null = null;
  #wallpaperDirty = true;
  #lastWallpaperRender = Number.NEGATIVE_INFINITY;
  #pyramidLevels = 0;
  #textureScale: number = wallpaperTokens.renderScale;
  #viewportWidth = 0;
  #viewportHeight = 0;
  #lastFrame: number | null = null;
  #frames = 0;
  #wallpaperFrames = 0;
  #groupDraws = 0;
  #flowing = false;
  #frameCost = 0;
  #debug: GlassDebugHandle | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
    programs: Programs,
    callbacks: GlassEngineCallbacks,
    enforceBudget: boolean,
  ) {
    this.#canvas = canvas;
    this.#gl = gl;
    this.#programs = programs;
    this.#callbacks = callbacks;
    this.#reducedMotion = callbacks.reducedMotion;
    this.#budget = enforceBudget ? new FrameBudget(FRAME_BUDGET) : null;
    this.#loseContext = gl.getExtension('WEBGL_lose_context');
    const viewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.#maxSize = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      viewportDims[0] ?? 0,
      viewportDims[1] ?? 0,
    );
    this.#scheduler = new FrameScheduler(browserFrameHost, this.#render);
    this.#intersection =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(this.#onIntersect, { rootMargin: VISIBILITY_MARGIN });
    this.#resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(this.#onResize);
    this.#resize?.observe(document.body);
    this.#listen();
    this.#scheduler.setPaused(document.hidden);
    if (import.meta.env.DEV) {
      this.#debug = this.#debugHandle();
      window.__gvtGlass = this.#debug;
    }
  }

  // —— 公共接口 ——

  attachWallpaper(target: WallpaperTarget): () => void {
    const state: WallpaperState = {
      target,
      context: target.canvas.getContext('2d', { alpha: false }),
      rendered: false,
    };
    this.#wallpaper = state;
    this.#resize?.observe(target.element);
    this.#wallpaperDirty = true;
    this.#scheduler.invalidate();
    return () => {
      if (this.#wallpaper !== state) return;
      this.#wallpaper = null;
      this.#resize?.unobserve(target.element);
      target.element.removeAttribute(GLASS_RENDERED_ATTRIBUTE);
      this.#scheduler.setContinuous('wallpaper', false);
    };
  }

  registerGroup(options: GroupOptions): GlassGroupHandle {
    const group = this.#registry.addGroup(options, this.#intersection === null);
    group.context = options.canvas.getContext('2d');
    this.#intersection?.observe(options.root);
    this.#resize?.observe(options.root);
    const stopMotion = this.#trackMotion(group);
    this.#scheduler.invalidate();

    return {
      update: (update) => {
        const optics = update.optics ?? group.optics;
        const spacing = update.spacing ?? group.spacing;
        if (spacing === group.spacing && opticsEqual(optics, group.optics)) return;
        group.optics = optics;
        group.spacing = spacing;
        this.#invalidateGroup(group);
      },
      addShape: (shape) => this.#addShape(group, shape),
      setPointer: (point) => {
        if (point === null) {
          group.pointer.target = 0;
        } else {
          group.pointer.x = point.x;
          group.pointer.y = point.y;
          group.pointer.target = 1;
          group.dirty = true;
        }
        this.#scheduler.setContinuous('pointer', true);
      },
      remove: () => {
        if (this.#registry.removeGroup(group.id) === undefined) return;
        stopMotion();
        this.#intersection?.unobserve(options.root);
        this.#unobserveIfUnused(options.root);
        for (const shape of group.shapes.values()) this.#unobserveIfUnused(shape.element);
        options.root.removeAttribute(GLASS_RENDERED_ATTRIBUTE);
      },
    };
  }

  setReducedMotion(reduced: boolean): void {
    this.#reducedMotion = reduced;
    this.#scheduler.invalidate();
  }

  stats(): GlassEngineStats {
    return {
      status: this.#status,
      frames: this.#frames,
      wallpaperFrames: this.#wallpaperFrames,
      groupDraws: this.#groupDraws,
      registeredGroups: this.#registry.groups.size,
      visibleGroups: this.#registry.visibleGroups().length,
      flowing: this.#flowing,
      frameCostMs: this.#frameCost,
    };
  }

  #debugHandle(): GlassDebugHandle {
    return {
      stats: () => this.stats(),
      loseContext: () => this.#loseContext?.loseContext(),
      restoreContext: () => this.#loseContext?.restoreContext(),
    };
  }

  dispose(): void {
    if (import.meta.env.DEV && this.#debug !== null && window.__gvtGlass === this.#debug) {
      delete window.__gvtGlass;
    }
    this.#scheduler.dispose();
    for (const dispose of this.#disposers.splice(0)) dispose();
    this.#intersection?.disconnect();
    this.#resize?.disconnect();
    for (const group of this.#registry.groups.values()) {
      group.root.removeAttribute(GLASS_RENDERED_ATTRIBUTE);
    }
    this.#registry.groups.clear();
    this.#wallpaper?.target.element.removeAttribute(GLASS_RENDERED_ATTRIBUTE);
    this.#wallpaper = null;
    this.#releaseTargets();
    this.#programs = null;
    // 主动释放 GPU 资源（监听器已移除，不会触发降级）
    this.#loseContext?.loseContext();
  }

  // —— 事件 ——

  #listen(): void {
    const on = <K extends keyof WindowEventMap>(
      type: K,
      handler: (event: WindowEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ): void => {
      window.addEventListener(type, handler, options);
      this.#disposers.push(() => {
        window.removeEventListener(type, handler, options);
      });
    };
    const passiveCapture = { capture: true, passive: true } as const;
    on('scroll', this.#invalidateAll, passiveCapture);
    on('resize', this.#invalidateAll, { passive: true });
    on('focus', () => {
      this.#focused = true;
      this.#scheduler.invalidate();
    });
    on('blur', () => {
      this.#focused = false;
    });
    for (const type of INPUT_EVENTS) {
      on(
        type,
        () => {
          this.#gate.noteInput(performance.now());
          if (!this.#scheduler.isContinuous('wallpaper')) this.#scheduler.invalidate();
        },
        passiveCapture,
      );
    }
    const onVisibility = (): void => {
      this.#scheduler.setPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    this.#canvas.addEventListener('webglcontextlost', this.#onContextLost);
    this.#canvas.addEventListener('webglcontextrestored', this.#onContextRestored);
    this.#disposers.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      this.#canvas.removeEventListener('webglcontextlost', this.#onContextLost);
      this.#canvas.removeEventListener('webglcontextrestored', this.#onContextRestored);
    });
  }

  /** CSS 过渡或动画进行中时逐帧重绘该组（形状可能在移动或变形）；JS 动画逐帧通知 */
  #trackMotion(group: GroupRecord): () => void {
    const start = (): void => {
      group.transitions += 1;
      group.transitionsSince = performance.now();
      this.#scheduler.setContinuous('transition', true);
    };
    const end = (): void => {
      group.transitions = Math.max(group.transitions - 1, 0);
      group.dirty = true;
      this.#scheduler.invalidate();
    };
    const frame = (): void => {
      group.dirty = true;
      this.#scheduler.invalidate();
    };
    for (const type of MOTION_START_EVENTS) group.root.addEventListener(type, start);
    for (const type of MOTION_END_EVENTS) group.root.addEventListener(type, end);
    group.root.addEventListener(GLASS_MOTION_EVENT, frame);
    return () => {
      for (const type of MOTION_START_EVENTS) group.root.removeEventListener(type, start);
      for (const type of MOTION_END_EVENTS) group.root.removeEventListener(type, end);
      group.root.removeEventListener(GLASS_MOTION_EVENT, frame);
    };
  }

  #addShape(group: GroupRecord, options: Parameters<GlassGroupHandle['addShape']>[0]) {
    const shape = this.#registry.addShape(group, options);
    this.#resize?.observe(options.element);
    this.#scheduler.invalidate();
    const handle: GlassShapeHandle = {
      update: (update) => {
        shape.kind = update.kind ?? shape.kind;
        shape.radius = update.radius ?? shape.radius;
        shape.tint = update.tint ?? shape.tint;
        this.#invalidateGroup(group);
      },
      remove: () => {
        if (!group.shapes.delete(shape.id)) return;
        this.#unobserveIfUnused(options.element);
        this.#invalidateGroup(group);
      },
    };
    return handle;
  }

  #unobserveIfUnused(element: HTMLElement): void {
    if (!this.#registry.isReferenced(element)) this.#resize?.unobserve(element);
  }

  #invalidateGroup(group: GroupRecord): void {
    group.dirty = true;
    this.#scheduler.invalidate();
  }

  readonly #invalidateAll = (): void => {
    this.#registry.markAllDirty();
    this.#scheduler.invalidate();
  };

  readonly #onIntersect = (entries: IntersectionObserverEntry[]): void => {
    for (const entry of entries) {
      for (const group of this.#registry.groups.values()) {
        if (group.root !== entry.target) continue;
        group.visible = entry.isIntersecting;
        group.dirty ||= entry.isIntersecting;
      }
    }
    this.#scheduler.invalidate();
  };

  readonly #onResize = (entries: ResizeObserverEntry[]): void => {
    for (const entry of entries) {
      if (entry.target === document.body) this.#registry.markAllDirty();
      if (entry.target === this.#wallpaper?.target.element) this.#wallpaperDirty = true;
      for (const group of this.#registry.groupsOf(entry.target)) group.dirty = true;
    }
    this.#scheduler.invalidate();
  };

  readonly #onContextLost = (event: Event): void => {
    // 阻止默认行为才会收到 webglcontextrestored
    event.preventDefault();
    this.#status = 'lost';
    this.#programs = null;
    this.#scheduler.setContinuous('wallpaper', false);
    this.#scheduler.setContinuous('pointer', false);
    this.#scheduler.setContinuous('transition', false);
    this.#pyramid.length = 0;
    this.#pyramidLevels = 0;
    this.#pongs.clear();
    this.#blurCache.clear();
    for (const group of this.#registry.groups.values()) {
      group.rendered = false;
      group.root.removeAttribute(GLASS_RENDERED_ATTRIBUTE);
    }
    if (this.#wallpaper !== null) {
      this.#wallpaper.rendered = false;
      this.#wallpaper.target.element.removeAttribute(GLASS_RENDERED_ATTRIBUTE);
    }
    this.#callbacks.onStatusChange('lost');
  };

  readonly #onContextRestored = (): void => {
    createPrograms(this.#gl).then(
      (programs) => {
        this.#programs = programs;
        this.#status = 'ready';
        this.#wallpaperDirty = true;
        this.#invalidateAll();
        this.#callbacks.onStatusChange('ready');
      },
      (error: unknown) => {
        console.warn('Liquid Glass：WebGL 上下文恢复失败，继续使用 CSS 玻璃。', error);
      },
    );
  };

  // —— 渲染 ——

  readonly #render = (now: number): void => {
    const start = performance.now();
    if (this.#renderFrame(now)) this.#trackCost(performance.now() - start);
  };

  /** 记录主线程开销；持续超支时停止绘制并通知调用方降级 */
  #trackCost(cost: number): void {
    this.#frameCost =
      this.#frames <= 1 ? cost : this.#frameCost + (cost - this.#frameCost) * COST_SMOOTHING;
    if (this.#budget?.record(cost) !== true) return;
    console.warn(
      `Liquid Glass：渲染开销过高（约 ${this.#frameCost.toFixed(1)}ms/帧），改用 CSS 玻璃。`,
    );
    this.#scheduler.dispose();
    this.#callbacks.onStatusChange('degraded');
  }

  /** 绘制一帧；返回是否实际绘制了内容 */
  #renderFrame(now: number): boolean {
    const programs = this.#programs;
    if (this.#status !== 'ready' || programs === null) return false;
    const dt = this.#lastFrame === null ? 0 : now - this.#lastFrame;
    this.#lastFrame = now;

    this.#flowing =
      this.#wallpaper !== null &&
      this.#gate.isFlowing(now, {
        reducedMotion: this.#reducedMotion,
        focused: this.#focused,
        hidden: document.hidden,
      });
    const seconds = this.#clock.tick(now, this.#flowing);
    if (this.#flowing && isFrameDue(now, this.#lastWallpaperRender, wallpaperTokens.fps)) {
      this.#wallpaperDirty = true;
    }
    this.#measureViewport();

    const pointerActive = this.#easePointers(dt);
    const transitionsActive = this.#settleTransitions(now);
    let drew = false;
    if (this.#wallpaperDirty) {
      this.#renderWallpaper(programs, seconds, now);
      drew = true;
    }
    for (const group of this.#registry.groups.values()) {
      if (!group.visible || (!group.dirty && group.transitions === 0)) continue;
      this.#renderGroup(programs, group);
      drew = true;
    }
    if (drew) this.#frames += 1;

    this.#scheduler.setContinuous('wallpaper', this.#flowing);
    this.#scheduler.setContinuous('pointer', pointerActive);
    this.#scheduler.setContinuous('transition', transitionsActive);
    return drew;
  }

  #easePointers(dt: number): boolean {
    let active = false;
    for (const group of this.#registry.groups.values()) {
      const pointer = group.pointer;
      if (pointer.value === pointer.target) continue;
      pointer.value = easeToward(pointer.value, pointer.target, dt, glassLight.pointerEaseMs);
      group.dirty = true;
      active ||= pointer.value !== pointer.target;
    }
    return active;
  }

  #settleTransitions(now: number): boolean {
    let active = false;
    for (const group of this.#registry.groups.values()) {
      if (group.transitions > 0 && now - group.transitionsSince > TRANSITION_TIMEOUT_MS) {
        group.transitions = 0;
      }
      active ||= group.transitions > 0;
    }
    return active;
  }

  #measureViewport(): void {
    const element = this.#wallpaper?.target.element;
    const width = element?.clientWidth ?? window.innerWidth;
    const height = element?.clientHeight ?? window.innerHeight;
    if (width === this.#viewportWidth && height === this.#viewportHeight) return;
    this.#viewportWidth = width;
    this.#viewportHeight = height;
    this.#wallpaperDirty = true;
  }

  /** GL 画布至少要容纳本次绘制的区域（只增不减） */
  #ensureCanvas(width: number, height: number): void {
    if (this.#canvas.width < width) {
      this.#canvas.width = Math.min(roundUp(width, CANVAS_GRANULARITY), this.#maxSize);
    }
    if (this.#canvas.height < height) {
      this.#canvas.height = Math.min(roundUp(height, CANVAS_GRANULARITY), this.#maxSize);
    }
  }

  /** 把 GL 画布左下角 width × height 的内容拷贝到目标 2D 画布 */
  #present(context: CanvasRenderingContext2D, width: number, height: number): void {
    context.clearRect(0, 0, width, height);
    context.drawImage(
      this.#canvas,
      0,
      this.#canvas.height - height,
      width,
      height,
      0,
      0,
      width,
      height,
    );
  }

  #draw(): void {
    this.#gl.drawArrays(this.#gl.TRIANGLES, 0, FULLSCREEN_TRIANGLE_VERTICES);
  }

  #renderWallpaper(programs: Programs, seconds: number, now: number): void {
    const gl = this.#gl;
    const viewportWidth = Math.max(this.#viewportWidth, 1);
    const viewportHeight = Math.max(this.#viewportHeight, 1);
    const scale = Math.min(
      wallpaperTokens.renderScale,
      wallpaperTokens.maxRenderEdge / Math.max(viewportWidth, viewportHeight),
    );
    const width = Math.max(Math.round(viewportWidth * scale), 1);
    const height = Math.max(Math.round(viewportHeight * scale), 1);
    this.#textureScale = width / viewportWidth;
    const base = this.#pyramid[0];
    if (base?.width !== width || base.height !== height) this.#releaseTargets();
    const target = ensureTarget(gl, this.#pyramid[0], width, height);
    this.#pyramid[0] = target;

    const blobs = new Float32Array(MAX_BLOBS * BLOB_COMPONENTS);
    const colors = new Float32Array(MAX_BLOBS * COLOR_COMPONENTS);
    const count = Math.min(wallpaperTokens.blobs.length, MAX_BLOBS);
    wallpaperTokens.blobs.slice(0, count).forEach((blob, index) => {
      const center = blobCenter(blob, seconds, wallpaperTokens.yPeriodRatio);
      blobs.set([center.x, center.y, blob.radius, blob.softness], index * BLOB_COMPONENTS);
      colors.set(WALLPAPER_COLORS[index] ?? WALLPAPER_BASE, index * COLOR_COMPONENTS);
    });

    const { program, uniforms } = programs.wallpaper;
    gl.bindVertexArray(programs.vertexArray);
    bindTarget(gl, target, width, height);
    gl.useProgram(program);
    gl.uniform2f(uniforms.u_resolution, width, height);
    gl.uniform3fv(uniforms.u_base, WALLPAPER_BASE);
    gl.uniform1i(uniforms.u_blobCount, count);
    gl.uniform4fv(uniforms.u_blobs, blobs);
    gl.uniform3fv(uniforms.u_colors, colors);
    this.#draw();

    this.#pyramidLevels = 0;
    for (const entry of this.#blurCache.values()) entry.valid = false;
    this.#wallpaperDirty = false;
    this.#lastWallpaperRender = now;
    this.#wallpaperFrames += 1;
    this.#registry.markAllDirty();

    const state = this.#wallpaper;
    const context = state?.context ?? null;
    if (state === null || context === null) return;
    this.#ensureCanvas(width, height);
    this.#copy(programs, target.texture, null, width, height);
    if (state.target.canvas.width !== width) state.target.canvas.width = width;
    if (state.target.canvas.height !== height) state.target.canvas.height = height;
    this.#present(context, width, height);
    if (!state.rendered) {
      state.rendered = true;
      state.target.element.setAttribute(GLASS_RENDERED_ATTRIBUTE, '');
    }
  }

  #copy(
    programs: Programs,
    source: WebGLTexture,
    target: RenderTarget | null,
    width: number,
    height: number,
  ): void {
    const gl = this.#gl;
    const { program, uniforms } = programs.copy;
    bindTarget(gl, target, width, height);
    gl.useProgram(program);
    bindTexture(gl, source);
    gl.uniform1i(uniforms.u_source, 0);
    gl.uniform2f(uniforms.u_outputSize, width, height);
    this.#draw();
  }

  /** 金字塔第 level 级（按需逐级降采样） */
  #level(programs: Programs, level: number): RenderTarget | undefined {
    for (let index = this.#pyramidLevels + 1; index <= level; index += 1) {
      const source = this.#pyramid[index - 1];
      if (source === undefined) return undefined;
      const width = Math.max(Math.ceil(source.width / 2), 1);
      const height = Math.max(Math.ceil(source.height / 2), 1);
      const target = ensureTarget(this.#gl, this.#pyramid[index], width, height);
      this.#pyramid[index] = target;
      this.#copy(programs, source.texture, target, width, height);
      this.#pyramidLevels = index;
    }
    return this.#pyramid[level];
  }

  /** 模糊后的壁纸（按 σ 缓存，壁纸重绘后失效） */
  #blurred(programs: Programs, sigma: number): RenderTarget | undefined {
    const plan = planBlur(sigma, this.#textureScale);
    const source = this.#level(programs, plan.level);
    if (source === undefined || plan.passes === 0) return source;
    const gl = this.#gl;
    let entry = this.#blurCache.get(sigma);
    if (entry?.target.width !== source.width || entry.target.height !== source.height) {
      entry = {
        target: ensureTarget(gl, entry?.target, source.width, source.height),
        valid: false,
      };
      this.#blurCache.set(sigma, entry);
    }
    if (entry.valid) return entry.target;
    const pong = ensureTarget(gl, this.#pongs.get(plan.level), source.width, source.height);
    this.#pongs.set(plan.level, pong);
    const { program, uniforms } = programs.blur;
    gl.useProgram(program);
    gl.uniform1i(uniforms.u_source, 0);
    gl.uniform2f(uniforms.u_texel, 1 / source.width, 1 / source.height);
    gl.uniform1i(uniforms.u_tapCount, plan.kernel.tapCount);
    gl.uniform1fv(uniforms.u_weights, plan.kernel.weights);
    gl.uniform1fv(uniforms.u_offsets, plan.kernel.offsets);
    let input = source;
    for (let pass = 0; pass < plan.passes; pass += 1) {
      for (const [direction, output] of [
        [HORIZONTAL, pong],
        [VERTICAL, entry.target],
      ] as const) {
        bindTarget(gl, output, output.width, output.height);
        bindTexture(gl, input.texture);
        gl.uniform2f(uniforms.u_direction, direction[0], direction[1]);
        this.#draw();
        input = output;
      }
    }
    entry.valid = true;
    return entry.target;
  }

  #profile(ior: number): Float32Array {
    let profile = this.#profiles.get(ior);
    if (profile === undefined) {
      profile = bezelProfile(ior);
      this.#profiles.set(ior, profile);
    }
    return profile;
  }

  #renderGroup(programs: Programs, group: GroupRecord): void {
    group.dirty = false;
    const context = group.context;
    const rect = group.root.getBoundingClientRect();
    if (context === null || rect.width === 0 || rect.height === 0) return;
    const cssWidth = rect.width + 2 * GLASS_CANVAS_BLEED;
    const cssHeight = rect.height + 2 * GLASS_CANVAS_BLEED;
    const ratio = Math.min(
      window.devicePixelRatio > 0 ? window.devicePixelRatio : 1,
      MAX_PIXEL_RATIO,
      this.#maxSize / cssWidth,
      this.#maxSize / cssHeight,
    );
    const width = Math.max(Math.round(cssWidth * ratio), 1);
    const height = Math.max(Math.round(cssHeight * ratio), 1);
    if (group.canvas.width !== width) group.canvas.width = width;
    if (group.canvas.height !== height) group.canvas.height = height;
    const originX = rect.left - GLASS_CANVAS_BLEED;
    const originY = rect.top - GLASS_CANVAS_BLEED;

    const shapes = new Float32Array(MAX_SHAPES * SHAPE_COMPONENTS);
    const corners = new Float32Array(MAX_SHAPES * CORNER_COMPONENTS);
    const tints = new Float32Array(MAX_SHAPES * SHAPE_COMPONENTS);
    let count = 0;
    for (const shape of group.shapes.values()) {
      if (count >= MAX_SHAPES) break;
      const box = shape.element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const geometry = shapeGeometry(
        { x: box.left - originX, y: box.top - originY, width: box.width, height: box.height },
        shape.radius,
        shape.kind,
      );
      shapes.set(
        [geometry.centerX, geometry.centerY, geometry.halfWidth, geometry.halfHeight],
        count * SHAPE_COMPONENTS,
      );
      corners.set([geometry.radius, geometry.exponent], count * CORNER_COMPONENTS);
      tints.set(shape.tint, count * SHAPE_COMPONENTS);
      count += 1;
    }
    if (count === 0) {
      context.clearRect(0, 0, width, height);
      return;
    }

    const backdrop = this.#blurred(programs, group.optics.blurPx);
    if (backdrop === undefined) return;
    const gl = this.#gl;
    const optics = group.optics;
    const { program, uniforms } = programs.glass;
    this.#ensureCanvas(width, height);
    bindTarget(gl, null, width, height);
    gl.useProgram(program);
    bindTexture(gl, backdrop.texture);
    gl.uniform1i(uniforms.u_backdrop, 0);
    gl.uniform2f(uniforms.u_viewport, this.#viewportWidth, this.#viewportHeight);
    gl.uniform2f(uniforms.u_origin, originX, originY);
    gl.uniform1f(uniforms.u_canvasHeight, height);
    gl.uniform1f(uniforms.u_pixelRatio, ratio);
    gl.uniform1i(uniforms.u_shapeCount, count);
    gl.uniform4fv(uniforms.u_shapes, shapes);
    gl.uniform2fv(uniforms.u_corners, corners);
    gl.uniform4fv(uniforms.u_tints, tints);
    gl.uniform1f(uniforms.u_spacing, group.spacing);
    gl.uniform1f(uniforms.u_bezel, optics.bezel);
    gl.uniform1f(uniforms.u_refraction, optics.refraction);
    gl.uniform1f(uniforms.u_dispersion, optics.dispersion);
    gl.uniform1f(uniforms.u_fresnel, optics.fresnel);
    gl.uniform1f(uniforms.u_specular, optics.specular);
    gl.uniform1f(uniforms.u_sharpness, optics.specularSharpness);
    gl.uniform1f(uniforms.u_saturation, optics.saturation);
    gl.uniform4fv(uniforms.u_rim, optics.rim);
    gl.uniform2f(uniforms.u_light, Math.cos(LIGHT_ANGLE), Math.sin(LIGHT_ANGLE));
    gl.uniform1f(uniforms.u_backLight, glassLight.backStrength);
    gl.uniform3f(
      uniforms.u_pointer,
      group.pointer.x - originX,
      group.pointer.y - originY,
      group.pointer.value * glassLight.pointerStrength,
    );
    gl.uniform1f(uniforms.u_pointerRadius, glassLight.pointerRadius);
    gl.uniform3f(uniforms.u_shadow, glassShadow.offsetY, glassShadow.radius, glassShadow.opacity);
    gl.uniform3fv(uniforms.u_shadowColor, SHADOW_COLOR);
    gl.uniform3fv(uniforms.u_profile, this.#profile(optics.ior));
    this.#draw();
    this.#present(context, width, height);
    this.#groupDraws += 1;
    if (!group.rendered) {
      group.rendered = true;
      group.root.setAttribute(GLASS_RENDERED_ATTRIBUTE, '');
    }
  }

  #releaseTargets(): void {
    const gl = this.#gl;
    for (const target of this.#pyramid) deleteTarget(gl, target);
    for (const target of this.#pongs.values()) deleteTarget(gl, target);
    for (const entry of this.#blurCache.values()) deleteTarget(gl, entry.target);
    this.#pyramid.length = 0;
    this.#pyramidLevels = 0;
    this.#pongs.clear();
    this.#blurCache.clear();
  }
}

/**
 * 创建引擎；设备不支持（无 WebGL2、软件渲染、着色器编译失败）时返回 null，调用方保持 CSS 档。
 */
export async function createGlassEngine(
  callbacks: GlassEngineCallbacks,
): Promise<GlassEngine | null> {
  const forced = import.meta.env.DEV && window.__gvtGlassForceWebgl === true;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    ...CONTEXT_ATTRIBUTES,
    failIfMajorPerformanceCaveat: !forced,
  });
  if (gl === null) return null;
  if (!forced && isSoftwareRenderer(rendererName(gl))) {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
  try {
    const programs = await createPrograms(gl);
    return new WebGlGlassEngine(canvas, gl, programs, callbacks, !forced);
  } catch (error) {
    console.warn('Liquid Glass：WebGL 初始化失败，使用 CSS 玻璃。', error);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return null;
  }
}
