import { ProgressBar as AriaProgressBar, Label } from 'react-aria-components';
import { cx } from '../../shared/cx';
import type { Tone } from '../types';
import styles from './ProgressBar.module.css';

const FULL_PERCENT = 100;

export interface ProgressBarProps {
  readonly label: string;
  readonly value: number;
  readonly minValue?: number;
  readonly maxValue?: number;
  /** 例如“12 / 30”；省略时显示百分比 */
  readonly valueLabel?: string;
  readonly showValueLabel?: boolean;
  /** 视觉上隐藏标签（读屏仍可读到） */
  readonly hideLabel?: boolean;
  readonly tone?: Exclude<Tone, 'neutral'>;
  readonly className?: string;
}

/** 进度条：填充只做 scaleX 变换，进度变化时不触发布局。 */
export function ProgressBar({
  label,
  value,
  minValue = 0,
  maxValue = FULL_PERCENT,
  valueLabel,
  showValueLabel = true,
  hideLabel = false,
  tone = 'tint',
  className,
}: ProgressBarProps) {
  return (
    <AriaProgressBar
      value={value}
      minValue={minValue}
      maxValue={maxValue}
      {...(valueLabel === undefined ? {} : { valueLabel })}
      className={cx(styles.progress, className)}
      data-tone={tone}
    >
      {({ percentage = 0, valueText }) => (
        <>
          <div className={cx(styles.labels, hideLabel && 'visually-hidden')}>
            <Label className={styles.label}>{label}</Label>
            {showValueLabel && <span className={styles.value}>{valueText}</span>}
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ '--progress': percentage / FULL_PERCENT }} />
          </div>
        </>
      )}
    </AriaProgressBar>
  );
}
