import {
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type Ref,
} from 'react';
import {
  elementTier,
  GLASS_GROUP_ATTRIBUTE,
  type GlassOpticsOverrides,
  type GlassRenderer,
  type ShapeKind,
} from '../../glass';
import {
  CAPSULE_RADIUS,
  radius as radiusScale,
  type GlassVariant,
  type RadiusToken,
  type ShadowToken,
} from '../../design/tokens';
import { cx } from '../../shared/cx';
import { useMergedRefs } from '../hooks/mergeRefs';
import { Surface, type SurfaceElement } from '../Surface/Surface';
import { GlassGroupContext, ShapeHub, useGlass } from './GlassContext';
import { useEngineGroup, useHubShape, useResolvedOptics } from './useEngineGroup';
import { usePointerHighlight } from './usePointerHighlight';
import { useRefractionFilter } from './useRefractionFilter';
import styles from './Glass.module.css';

export interface LiquidGlassProps extends HTMLAttributes<HTMLElement> {
  readonly as?: SurfaceElement;
  readonly variant?: GlassVariant;
  readonly radius?: RadiusToken | 'capsule';
  /** CSS 档的投影；WebGL 档由着色器按形状绘制 */
  readonly elevation?: ShadowToken;
  /**
   * `auto`：可用时用 WebGL（浮在壁纸上的关键元素）；
   * `css`：始终用 CSS（导航栏等固定元素：背后滚过的是页面内容，WebGL 无法读取 DOM 像素）
   */
  readonly renderer?: GlassRenderer;
  /** 跟随指针的高光 */
  readonly interactive?: boolean;
  readonly optics?: GlassOpticsOverrides;
  readonly ref?: Ref<HTMLElement>;
}

function variantStyle(variant: GlassVariant): CSSProperties {
  return {
    '--surface-tint': `var(--glass-${variant}-tint)`,
    '--surface-blur': `var(--glass-${variant}-blur)`,
    '--surface-saturation': `var(--glass-${variant}-saturation)`,
    '--surface-highlight': `var(--glass-${variant}-highlight)`,
    '--surface-rim': `var(--glass-${variant}-rim)`,
  };
}

/**
 * Liquid Glass 面板。同一组 token 在不同档位下的表现：
 * webgl（折射 + 色散 + 菲涅尔 + 高光，可与同组形状融合）→ refraction（CSS 模糊 + SVG 边缘折射）
 * → blur（CSS 模糊）→ opaque（不透明材质）。文字对比度在所有档位下一致。
 */
export function LiquidGlass({
  as = 'div',
  variant = 'regular',
  radius = 'xl',
  elevation = 'glass',
  renderer = 'auto',
  interactive = false,
  optics,
  className,
  style,
  children,
  ref,
  ...rest
}: LiquidGlassProps) {
  const glass = useGlass();
  const parentHub = useContext(GlassGroupContext);
  const [ownHub] = useState(() => new ShapeHub());
  const elementRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mergedRef = useMergedRefs(ref, elementRef);

  const tier = elementTier(glass.tier, renderer, glass.capabilities);
  const engine = tier === 'webgl' ? glass.engine : null;
  const standalone = engine !== null && parentHub === null;
  const hub = parentHub ?? ownHub;
  const kind: ShapeKind = radius === 'capsule' ? 'capsule' : 'squircle';
  const radiusPx = radius === 'capsule' ? CAPSULE_RADIUS : radiusScale[radius];
  const resolved = useResolvedOptics(variant, optics);

  useEngineGroup({
    engine: standalone ? engine : null,
    rootRef: elementRef,
    canvasRef,
    optics: resolved,
    spacing: 0,
    hub: ownHub,
  });
  useHubShape({
    hub,
    enabled: engine !== null,
    elementRef,
    kind,
    radius: radiusPx,
    tint: resolved.tint,
  });
  const refraction = useRefractionFilter({
    enabled: tier === 'refraction',
    elementRef,
    cornerRadius: radiusPx,
    kind,
    optics: resolved,
  });
  usePointerHighlight(elementRef, {
    isEnabled: interactive && tier !== 'opaque',
    sink: engine === null ? null : hub,
  });

  return (
    <Surface
      {...rest}
      {...(standalone ? { [GLASS_GROUP_ATTRIBUTE]: '' } : {})}
      as={as}
      material="none"
      radius={radius}
      elevation={elevation}
      ref={mergedRef}
      className={cx(styles.glass, className)}
      data-tier={tier}
      data-variant={variant}
      data-interactive={interactive ? '' : undefined}
      data-refraction={refraction.filterId === null ? undefined : ''}
      style={{
        ...style,
        ...variantStyle(variant),
        ...(refraction.filterId === null
          ? {}
          : { '--glass-refraction': `url(#${refraction.filterId})` }),
      }}
    >
      {standalone && <canvas ref={canvasRef} className={styles.canvas} aria-hidden />}
      {children}
      {refraction.filter}
    </Surface>
  );
}
