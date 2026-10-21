import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { CheckboxButton, CheckboxField, type CheckboxFieldProps } from 'react-aria-components';
import { componentGeometry, iconStroke } from '../../design/tokens';
import { cx } from '../../shared/cx';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<
  CheckboxFieldProps,
  'className' | 'style' | 'children'
> {
  readonly children: ReactNode;
  readonly className?: string;
}

/** 圆形复选框（iOS 列表多选样式），支持半选状态（例如“章节下部分课时已选”）。 */
export function Checkbox({ children, className, ...rest }: CheckboxProps) {
  return (
    <CheckboxField {...rest} className={cx(styles.field, className)}>
      <CheckboxButton className={styles.checkbox}>
        {({ isSelected, isIndeterminate }) => (
          <>
            <span className={styles.box} aria-hidden>
              {isIndeterminate ? (
                <Minus size={componentGeometry.iconSm} strokeWidth={iconStroke.bold} />
              ) : (
                isSelected && (
                  <Check size={componentGeometry.iconSm} strokeWidth={iconStroke.bold} />
                )
              )}
            </span>
            <span className={styles.labelText}>{children}</span>
          </>
        )}
      </CheckboxButton>
    </CheckboxField>
  );
}
