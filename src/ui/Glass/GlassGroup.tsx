import { useRef, useState, type HTMLAttributes, type Ref } from 'react';
import { GLASS_GROUP_ATTRIBUTE, type GlassOpticsOverrides } from '../../glass';
import { glassGroup, type GlassVariant } from '../../design/tokens';
import { cx } from '../../shared/cx';
import { useMergedRefs } from '../hooks/mergeRefs';
import { GlassGroupContext, ShapeHub, useGlass } from './GlassContext';
import { useEngineGroup, useResolvedOptics } from './useEngineGroup';
import styles from './Glass.module.css';

export interface GlassGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** 组内共享的光学参数（折射、模糊、高光）；各形状的着色仍取自自己的变体 */
  readonly variant?: GlassVariant;
  /** 融合半径（px）：形状间距小于它时平滑“粘连”，0 = 不融合 */
  readonly spacing?: number;
  readonly optics?: GlassOpticsOverrides;
  readonly ref?: Ref<HTMLDivElement>;
}

/**
 * 玻璃容器（对应 SwiftUI 的 GlassEffectContainer）：其中的 LiquidGlass 在同一张画布上绘制，
 * 彼此靠近时像液体一样融合，并共享一次背景采样。只有 WebGL 档会融合，CSS 档各自独立渲染。
 */
export function GlassGroup({
  variant = 'regular',
  spacing = glassGroup.spacing,
  optics,
  className,
  children,
  ref,
  ...rest
}: GlassGroupProps) {
  const { engine } = useGlass();
  const [hub] = useState(() => new ShapeHub());
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mergedRef = useMergedRefs(ref, rootRef);
  const resolved = useResolvedOptics(variant, optics);
  useEngineGroup({ engine, rootRef, canvasRef, optics: resolved, spacing, hub });

  return (
    <div
      {...rest}
      ref={mergedRef}
      className={cx(styles.group, className)}
      {...{ [GLASS_GROUP_ATTRIBUTE]: '' }}
    >
      {engine !== null && <canvas ref={canvasRef} className={styles.canvas} aria-hidden />}
      <GlassGroupContext value={hub}>{children}</GlassGroupContext>
    </div>
  );
}
