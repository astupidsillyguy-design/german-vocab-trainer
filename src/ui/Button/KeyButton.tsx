import { useRef } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cx } from '../../shared/cx';
import { useButtonMotion } from './useButtonMotion';
import styles from './Button.module.css';

export interface KeyButtonProps {
  /** 要插入的字符，例如 ä */
  readonly character: string;
  readonly onInsert: (character: string) => void;
  readonly isDisabled?: boolean;
  readonly className?: string;
}

/**
 * 特殊字符键（ä ö ü ß …）。
 * `preventFocusOnPress` 让输入框在点击时不失去焦点，手机键盘也不会收起；
 * React Aria 的按压事件在触屏上没有 300ms 延迟，修复了原版 mousedown 方案的迟滞。
 */
export function KeyButton({ character, onInsert, isDisabled = false, className }: KeyButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const handlePressChange = useButtonMotion(ref, 'key');
  return (
    <AriaButton
      ref={ref}
      onPressChange={handlePressChange}
      className={cx(styles.button, className)}
      data-variant="key"
      preventFocusOnPress
      isDisabled={isDisabled}
      onPress={() => {
        onInsert(character);
      }}
    >
      <span className={styles.label} lang="de">
        {character}
      </span>
    </AriaButton>
  );
}
