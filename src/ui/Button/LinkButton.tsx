import { useRef, type ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cx } from '../../shared/cx';
import type { ButtonSize, ButtonVariant } from './Button';
import { useButtonMotion } from './useButtonMotion';
import styles from './Button.module.css';

export interface LinkButtonProps {
  readonly href: string;
  readonly variant?: Exclude<ButtonVariant, 'destructive'>;
  readonly size?: ButtonSize;
  readonly leadingIcon?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

/** 外观是按钮、语义是链接：用于“跳转到某页”的操作，保留链接的右键/新标签页等行为。 */
export function LinkButton({
  href,
  variant = 'glass',
  size = 'md',
  leadingIcon,
  className,
  children,
}: LinkButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const handlePressChange = useButtonMotion(ref, variant);
  return (
    <Link
      ref={ref}
      onPressChange={handlePressChange}
      href={href}
      className={cx(styles.button, styles.link, className)}
      data-variant={variant}
      data-size={size}
    >
      {leadingIcon !== undefined && (
        <span className={styles.icon} aria-hidden>
          {leadingIcon}
        </span>
      )}
      <span className={styles.label}>{children}</span>
    </Link>
  );
}
