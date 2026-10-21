import { createContext, useContext } from 'react';
import {
  elementTier,
  type GlassCapabilities,
  type GlassEngine,
  type GlassEngineStatus,
  type GlassGroupHandle,
  type GlassRenderer,
  type GlassShapeHandle,
  type GlassTier,
  type GlassTierPreference,
  type ShapeOptions,
} from '../../glass';

export interface GlassContextValue {
  /** 全局档位（同时写在根元素的 data-glass-tier 上） */
  readonly tier: GlassTier;
  readonly capabilities: GlassCapabilities;
  /** WebGL 引擎；只有档位为 webgl 时非空 */
  readonly engine: GlassEngine | null;
  readonly engineStatus: GlassEngineStatus;
  readonly preference: GlassTierPreference;
  readonly setPreference: (preference: GlassTierPreference) => void;
}

/** 没有 GlassProvider 时（组件单测、设计稿截图）按“仅模糊”渲染 */
const DEFAULT_CONTEXT: GlassContextValue = {
  tier: 'blur',
  capabilities: { webgl2: false, backdropFilter: true, svgBackdropFilter: false },
  engine: null,
  engineStatus: 'idle',
  preference: 'auto',
  setPreference: () => undefined,
};

export const GlassContext = createContext<GlassContextValue>(DEFAULT_CONTEXT);

export function useGlass(): GlassContextValue {
  return useContext(GlassContext);
}

/** 某种渲染方式下元素的实际档位 */
export function useGlassTier(renderer: GlassRenderer = 'auto'): GlassTier {
  const { tier, capabilities } = useGlass();
  return elementTier(tier, renderer, capabilities);
}

type Point = Parameters<GlassGroupHandle['setPointer']>[0];

interface HubEntry {
  options: ShapeOptions;
  handle: GlassShapeHandle | null;
}

/**
 * 玻璃组与其中形状之间的中转站。
 * React 先执行子组件的 effect，形状登记时组可能还没注册到引擎，因此先暂存，组就绪后统一提交；
 * 组被移除（档位降级、上下文丢失）后形状自动回到暂存状态，恢复时重新提交。
 */
export class ShapeHub {
  readonly #entries = new Map<number, HubEntry>();
  #group: GlassGroupHandle | null = null;
  #nextId = 1;

  get size(): number {
    return this.#entries.size;
  }

  attach(group: GlassGroupHandle): void {
    this.#group = group;
    for (const entry of this.#entries.values()) entry.handle = group.addShape(entry.options);
  }

  detach(): void {
    for (const entry of this.#entries.values()) {
      entry.handle?.remove();
      entry.handle = null;
    }
    this.#group = null;
  }

  add(options: ShapeOptions): GlassShapeHandle {
    const id = this.#nextId;
    this.#nextId += 1;
    const entry: HubEntry = { options, handle: this.#group?.addShape(options) ?? null };
    this.#entries.set(id, entry);
    return {
      update: (update) => {
        entry.options = { ...entry.options, ...update };
        entry.handle?.update(update);
      },
      remove: () => {
        entry.handle?.remove();
        this.#entries.delete(id);
      },
    };
  }

  setPointer(point: Point): void {
    this.#group?.setPointer(point);
  }
}

/** GlassGroup 内的 LiquidGlass 通过它把自己登记为组内形状 */
export const GlassGroupContext = createContext<ShapeHub | null>(null);
