import type { HTMLAttributes, Ref } from 'react';
import {
  CAPSULE_RADIUS,
  radius as radiusScale,
  type MaterialToken,
  type RadiusToken,
  type ShadowToken,
} from '../../design/tokens';
import { radiusVar } from '../../design/cssVar';
import { cx } from '../../shared/cx';
import { useMergedRefs } from '../hooks/mergeRefs';
import { useSquircleClip } from '../hooks/useSquircleClip';
import styles from './Surface.module.css';

export type SurfaceElement = 'div' | 'section' | 'article' | 'header' | 'nav' | 'aside' | 'footer';

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  readonly as?: SurfaceElement;
  /** 玻璃材质；`none` 表示透明容器（只保留圆角与阴影） */
  readonly material?: MaterialToken | 'none';
  readonly radius?: RadiusToken | 'capsule';
  readonly elevation?: ShadowToken;
  /** 是否使用连续曲率圆角（胶囊形会自动忽略） */
  readonly squircle?: boolean;
  readonly ref?: Ref<HTMLElement>;
}

/**
 * 所有“面板类”元素的基础：材质层 + 阴影层 + 超椭圆圆角。
 *
 * 结构说明：阴影画在元素本身，材质（背景模糊、着色、高光）画在 ::before。
 * 超椭圆裁剪只作用于 ::before，因此阴影不会被 clip-path 裁掉；
 * 内容不处于任何会形成 backdrop root 的祖先之下，玻璃模糊能正确采样背景。
 */
export function Surface({
  as: Element = 'div',
  material = 'regular',
  radius = 'lg',
  elevation = 'glass',
  squircle = true,
  className,
  style,
  ref,
  children,
  ...rest
}: SurfaceProps) {
  const radiusPx = radius === 'capsule' ? CAPSULE_RADIUS : radiusScale[radius];
  const clipRef = useSquircleClip<HTMLElement>(squircle && radius !== 'capsule' ? radiusPx : null);
  const mergedRef = useMergedRefs(ref, clipRef);

  return (
    <Element
      {...rest}
      ref={mergedRef}
      className={cx(styles.surface, className)}
      data-material={material}
      data-squircle={squircle && radius !== 'capsule' ? '' : undefined}
      style={{
        ...style,
        '--surface-radius': radiusVar(radius),
        '--surface-shadow': `var(--shadow-${elevation})`,
      }}
    >
      {children}
    </Element>
  );
}
