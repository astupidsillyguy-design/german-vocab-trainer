import { useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  resolveOptics,
  variantTint,
  type GlassEngine,
  type GlassGroupHandle,
  type GlassOpticsOverrides,
  type ResolvedOptics,
  type ShapeKind,
} from '../../glass';
import type { GlassVariant } from '../../design/tokens';
import type { ShapeHub } from './GlassContext';

/** 按数值（而非对象引用）缓存解析结果，调用方可以每次渲染都传新的 overrides 对象 */
export function useResolvedOptics(
  variant: GlassVariant,
  overrides: GlassOpticsOverrides | undefined,
): ResolvedOptics {
  const { bezel, refraction, ior, dispersion, fresnel, specular, specularSharpness } =
    overrides ?? {};
  return useMemo(
    () =>
      resolveOptics(variant, {
        bezel,
        refraction,
        ior,
        dispersion,
        fresnel,
        specular,
        specularSharpness,
      }),
    [variant, bezel, refraction, ior, dispersion, fresnel, specular, specularSharpness],
  );
}

export function useVariantTint(variant: GlassVariant) {
  return useMemo(() => variantTint(variant), [variant]);
}

interface EngineGroupOptions {
  /** null 表示不使用引擎（CSS 档，或由外层 GlassGroup 负责） */
  readonly engine: GlassEngine | null;
  readonly rootRef: RefObject<HTMLElement | null>;
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly optics: ResolvedOptics;
  readonly spacing: number;
  readonly hub: ShapeHub;
}

/** 把一个 DOM 子树注册为引擎中的玻璃组；参数变化只做增量更新，不重新注册 */
export function useEngineGroup({
  engine,
  rootRef,
  canvasRef,
  optics,
  spacing,
  hub,
}: EngineGroupOptions): void {
  const latest = useRef({ optics, spacing });
  const groupRef = useRef<GlassGroupHandle | null>(null);

  useEffect(() => {
    latest.current = { optics, spacing };
    groupRef.current?.update({ optics, spacing });
  }, [optics, spacing]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (engine === null || root === null || canvas === null) return undefined;
    const group = engine.registerGroup({ root, canvas, ...latest.current });
    groupRef.current = group;
    hub.attach(group);
    return () => {
      hub.detach();
      group.remove();
      groupRef.current = null;
    };
  }, [engine, hub, rootRef, canvasRef]);
}

interface HubShapeOptions {
  readonly hub: ShapeHub;
  readonly enabled: boolean;
  readonly elementRef: RefObject<HTMLElement | null>;
  readonly kind: ShapeKind;
  readonly radius: number;
  readonly tint: ResolvedOptics['tint'];
}

/** 把元素登记为组内的一个形状 */
export function useHubShape({ hub, enabled, elementRef, kind, radius, tint }: HubShapeOptions) {
  useEffect(() => {
    const element = elementRef.current;
    if (!enabled || element === null) return undefined;
    const shape = hub.add({ element, kind, radius, tint });
    return () => {
      shape.remove();
    };
  }, [hub, enabled, elementRef, kind, radius, tint]);
}
