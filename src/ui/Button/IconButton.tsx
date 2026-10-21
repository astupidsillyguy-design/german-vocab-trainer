import { useRef, type ReactNode, type Ref } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { cx } from '../../shared/cx';
import { useMergedRefs } from '../hooks/mergeRefs';
import type { ButtonSize, ButtonVariant } from './Button';
import { useButtonMotion } from './useButtonMotion';
import styles from './Button.module.css';

export interface IconButtonProps extends Omit<
  AriaButtonProps,
  'className' | 'style' | 'children' | 'aria-label'
> {
  readonly icon: ReactNode;
  /** 图标按钮没有可见文字，必须提供读屏标签 */
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
  /** 需要主动移动焦点时使用（例如关闭模式后把焦点交还给入口按钮） */
  readonly ref?: Ref<HTMLButtonElement> | undefined;
}

/** 圆形图标按钮，可见尺寸可以小于 44pt，但点击区域始终 ≥ 44pt。 */
export function IconButton({
  icon,
  label,
  variant = 'glass',
  size = 'md',
  className,
  onPressChange,
  ref: forwardedRef,
  ...rest
}: IconButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const handlePressChange = useButtonMotion(ref, variant, onPressChange);
  const mergedRef = useMergedRefs(ref, forwardedRef);
  return (
    <AriaButton
      {...rest}
      ref={mergedRef}
      onPressChange={handlePressChange}
      aria-label={label}
      className={cx(styles.button, className)}
      data-variant={variant}
      data-size={size}
      data-shape="circle"
    >
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
    </AriaButton>
  );
}
