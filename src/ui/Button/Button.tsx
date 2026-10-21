import { useRef, type ReactNode, type Ref } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { cx } from '../../shared/cx';
import { useMergedRefs } from '../hooks/mergeRefs';
import { Spinner } from '../Spinner/Spinner';
import { useButtonMotion } from './useButtonMotion';
import styles from './Button.module.css';

export type ButtonVariant = 'glass' | 'filled' | 'tinted' | 'plain' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<AriaButtonProps, 'className' | 'style' | 'children'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
  readonly className?: string;
  /** 需要主动移动焦点时使用（例如关闭模式后把焦点交还给入口按钮） */
  readonly ref?: Ref<HTMLButtonElement> | undefined;
  readonly children: ReactNode;
}

/**
 * 通用按钮。基于 React Aria：统一处理鼠标、触摸、键盘与读屏，
 * 按下状态（data-pressed）在指针离开按钮时会自动取消，与原生 iOS 行为一致；
 * 按下时以弹簧缩放（玻璃变体鼓起并带跟随指针的高光）。
 * `isPending` 时显示活动指示器，按钮保持可聚焦但不可再次触发。
 */
export function Button({
  variant = 'glass',
  size = 'md',
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  onPressChange,
  ref: forwardedRef,
  ...rest
}: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const handlePressChange = useButtonMotion(ref, variant, onPressChange);
  const mergedRef = useMergedRefs(ref, forwardedRef);
  return (
    <AriaButton
      {...rest}
      ref={mergedRef}
      onPressChange={handlePressChange}
      className={cx(styles.button, className)}
      data-variant={variant}
      data-size={size}
      data-full-width={fullWidth ? '' : undefined}
    >
      {({ isPending }) => (
        <>
          {leadingIcon !== undefined && (
            <span className={styles.icon} aria-hidden>
              {leadingIcon}
            </span>
          )}
          <span className={styles.label}>{children}</span>
          {trailingIcon !== undefined && (
            <span className={styles.icon} aria-hidden>
              {trailingIcon}
            </span>
          )}
          {isPending && (
            <span className={styles.pendingOverlay}>
              <Spinner size="sm" decorative />
            </span>
          )}
        </>
      )}
    </AriaButton>
  );
}
