import {
  Label,
  Slider as AriaSlider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
  type SliderProps as AriaSliderProps,
} from 'react-aria-components';
import { cx } from '../../shared/cx';
import styles from './Slider.module.css';

export interface SliderProps extends Omit<
  AriaSliderProps<number>,
  'className' | 'style' | 'children'
> {
  readonly label: string;
  /** 自定义数值显示，例如 “0.9×” */
  readonly formatValue?: (value: number) => string;
  readonly className?: string;
}

const PERCENT = 100;

/** 单值滑块：方向键/PageUp/Home/End 调节，填充条只做 scaleX 变换。 */
export function Slider({ label, formatValue, className, ...rest }: SliderProps) {
  return (
    <AriaSlider {...rest} className={cx(styles.slider, className)}>
      <div className={styles.header}>
        <Label className={styles.label}>{label}</Label>
        <SliderOutput className={styles.output}>
          {({ state }) =>
            formatValue ? formatValue(state.getThumbValue(0)) : state.getThumbValueLabel(0)
          }
        </SliderOutput>
      </div>
      <SliderTrack className={styles.track}>
        {({ state }) => (
          <>
            <span className={styles.rail} aria-hidden>
              <span className={styles.fill} style={{ '--fill': state.getThumbPercent(0) }} />
            </span>
            <SliderThumb
              className={styles.thumb}
              style={{ '--thumb-percent': `${state.getThumbPercent(0) * PERCENT}%` }}
            />
          </>
        )}
      </SliderTrack>
    </AriaSlider>
  );
}
