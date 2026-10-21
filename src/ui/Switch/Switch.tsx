import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { SwitchButton, SwitchField, type SwitchFieldProps } from 'react-aria-components';
import { gesture, springRest, springs } from '../../design/tokens';
import { clamp, projectMomentum } from '../../motion';
import { cx } from '../../shared/cx';
import { useControllableState } from '../hooks/useControllableState';
import {
  DRAGGING_ATTRIBUTE,
  moveSpring,
  useDrag,
  useReducedMotion,
  useSpringAnimation,
} from '../motion';
import styles from './Switch.module.css';

export interface SwitchProps extends Omit<SwitchFieldProps, 'className' | 'style' | 'children'> {
  readonly children: ReactNode;
  readonly className?: string;
}

/** 滑块越过中点即切换 */
const SWITCH_MIDPOINT = 1 / 2;

type Direction = 1 | -1;

/**
 * iOS 开关：51×31。点按、空格切换；也可以按住滑块拖到另一侧（松手时按速度判断落点）。
 * 按住时滑块向行进方向拉长；滑块位置由弹簧驱动，快速连点时从当前位置继续，不会跳变。
 */
export function Switch({
  children,
  className,
  isSelected,
  defaultSelected = false,
  onChange,
  isDisabled = false,
  isReadOnly = false,
  ...rest
}: SwitchProps) {
  const [selected, setSelected] = useControllableState(isSelected, defaultSelected, onChange);
  const switchRef = useRef<HTMLLabelElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();
  const gestureStart = useRef<{ position: number; travel: number; direction: Direction }>({
    position: 0,
    travel: 1,
    direction: 1,
  });
  const mounted = useRef(false);

  const animation = useSpringAnimation<'position'>({
    initial: { position: selected ? 1 : 0 },
    config: springs.snappy,
    precision: springRest.unit,
    onUpdate: ({ position }) => {
      switchRef.current?.style.setProperty('--switch-position', String(position));
    },
  });

  const release = (next: boolean, velocity?: number): void => {
    switchRef.current?.removeAttribute(DRAGGING_ATTRIBUTE);
    moveSpring(
      animation,
      { position: next ? 1 : 0 },
      reducedMotion,
      velocity === undefined ? undefined : { velocity: { position: velocity } },
    );
  };

  const drag = useDrag(trackRef, {
    axis: 'x',
    isDisabled: isDisabled || isReadOnly,
    onStart: () => {
      const track = trackRef.current;
      if (track === null) return;
      gestureStart.current = {
        position: animation.value('position'),
        // 滑块可移动的距离 = 轨道宽 − 轨道高（滑块直径加两侧内边距）
        travel: Math.max(track.clientWidth - track.clientHeight, 1),
        direction: getComputedStyle(track).direction === 'rtl' ? -1 : 1,
      };
      switchRef.current?.setAttribute(DRAGGING_ATTRIBUTE, '');
    },
    onMove: ({ offset }) => {
      const { position, travel, direction } = gestureStart.current;
      animation.set({ position: clamp(position + (offset.x * direction) / travel, 0, 1) });
    },
    onEnd: ({ velocity }) => {
      const { travel, direction } = gestureStart.current;
      const unitsPerSecond = (velocity.x * direction) / travel;
      const projected =
        animation.value('position') +
        projectMomentum(unitsPerSecond, gesture.selectionDecelerationRate);
      const next = projected >= SWITCH_MIDPOINT;
      release(next, unitsPerSecond);
      if (next !== selected) setSelected(next);
    },
    onCancel: () => {
      release(selected);
    },
  });

  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      animation.set({ position: selected ? 1 : 0 });
      return;
    }
    if (!drag.isDragging()) moveSpring(animation, { position: selected ? 1 : 0 }, reducedMotion);
    // 只跟随选中状态；其余依赖为稳定引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <SwitchField
      {...rest}
      isSelected={selected}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      onChange={(next) => {
        // 拖动由手势自己决定落点；忽略松手时 label 点按触发的切换
        if (!drag.didDrag()) setSelected(next);
      }}
      className={cx(styles.field, className)}
    >
      <SwitchButton ref={switchRef} className={styles.switch}>
        <span className={styles.labelText}>{children}</span>
        <span ref={trackRef} className={styles.track} aria-hidden>
          <span className={styles.thumb} />
        </span>
      </SwitchButton>
    </SwitchField>
  );
}
