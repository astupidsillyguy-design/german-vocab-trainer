import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../shared/cx';
import type { Tone } from '../types';
import styles from './Badge.module.css';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  readonly tone?: Tone;
  /** `solid` 用于计数角标，`subtle` 用于状态标签 */
  readonly variant?: 'subtle' | 'solid';
  readonly size?: 'sm' | 'md';
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

/** 状态标签 / 计数角标。颜色从不单独承载信息：始终配有文字。 */
export function Badge({
  tone = 'neutral',
  variant = 'subtle',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(styles.badge, className)}
      data-tone={tone}
      data-variant={variant}
      data-size={size}
    >
      {icon !== undefined && (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}
