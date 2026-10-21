/**
 * 假的 WebGL 玻璃引擎：记录 React 绑定层对引擎的全部调用，供组件测试断言。
 */
import { vi } from 'vitest';
import type {
  GlassEngine,
  GlassEngineStats,
  GlassGroupHandle,
  GlassShapeHandle,
  GroupOptions,
  ShapeOptions,
  WallpaperTarget,
} from '../glass/engine/types';
import type { GlassCapabilities } from '../glass';

export const FULL_CAPABILITIES: GlassCapabilities = {
  webgl2: true,
  backdropFilter: true,
  svgBackdropFilter: true,
};

const STATS: GlassEngineStats = {
  status: 'ready',
  frames: 0,
  wallpaperFrames: 0,
  groupDraws: 0,
  registeredGroups: 0,
  visibleGroups: 0,
  flowing: false,
  frameCostMs: 0,
};

export interface FakeShape {
  options: ShapeOptions;
  removed: boolean;
}

export interface FakeGroup {
  readonly options: GroupOptions;
  readonly shapes: FakeShape[];
  readonly handle: GlassGroupHandle;
  readonly update: ReturnType<typeof vi.fn<GlassGroupHandle['update']>>;
  readonly setPointer: ReturnType<typeof vi.fn<GlassGroupHandle['setPointer']>>;
  removed: boolean;
}

export interface FakeEngine {
  readonly engine: GlassEngine;
  readonly groups: FakeGroup[];
  readonly wallpapers: WallpaperTarget[];
  readonly detachWallpaper: ReturnType<typeof vi.fn<() => void>>;
  readonly setReducedMotion: ReturnType<typeof vi.fn<GlassEngine['setReducedMotion']>>;
  readonly dispose: ReturnType<typeof vi.fn<() => void>>;
  /** 仍在引擎中的组与形状 */
  activeGroups(): FakeGroup[];
  activeShapes(group: FakeGroup): ShapeOptions[];
}

function createShape(group: FakeGroup, options: ShapeOptions): GlassShapeHandle {
  const shape: FakeShape = { options, removed: false };
  group.shapes.push(shape);
  return {
    update: (update) => {
      shape.options = { ...shape.options, ...update };
    },
    remove: () => {
      shape.removed = true;
    },
  };
}

export function createFakeEngine(): FakeEngine {
  const groups: FakeGroup[] = [];
  const wallpapers: WallpaperTarget[] = [];
  const detachWallpaper = vi.fn<() => void>();
  const setReducedMotion = vi.fn<GlassEngine['setReducedMotion']>();
  const dispose = vi.fn<() => void>();

  const engine: GlassEngine = {
    attachWallpaper: (target) => {
      wallpapers.push(target);
      return detachWallpaper;
    },
    registerGroup: (options) => {
      const update = vi.fn<GlassGroupHandle['update']>();
      const setPointer = vi.fn<GlassGroupHandle['setPointer']>();
      const shapes: FakeShape[] = [];
      const group: FakeGroup = {
        options,
        shapes,
        update,
        setPointer,
        removed: false,
        handle: {
          update,
          setPointer,
          addShape: (shape) => createShape(group, shape),
          remove: () => {
            group.removed = true;
          },
        },
      };
      groups.push(group);
      return group.handle;
    },
    setReducedMotion,
    stats: () => STATS,
    dispose,
  };

  return {
    engine,
    groups,
    wallpapers,
    detachWallpaper,
    setReducedMotion,
    dispose,
    activeGroups: () => groups.filter((group) => !group.removed),
    activeShapes: (group) =>
      group.shapes.filter((shape) => !shape.removed).map((shape) => shape.options),
  };
}
