import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { interaction, springRest, springs } from '../../design/tokens';
import { notifyGlassMotion } from './glassMotion';
import { useReducedMotion } from './useReducedMotion';
import { useSpringAnimation } from './useSpringAnimation';

const REST_SCALE = 1;

/**
 * 按下时的弹性缩放（写入独立的 `scale` 属性，与组件自己的 transform 互不干扰）。
 *
 * 由弹簧驱动而不是 CSS 过渡：快速连点时从当前大小和速度继续，不会每次从头播放；
 * 轻点再快也至少保持 90ms 的按下状态，保证能看到完整的“按下—弹回”。
 * 返回值直接传给 React Aria 组件的 `onPressChange`。
 */
export function usePressScale(
  ref: RefObject<HTMLElement | null>,
  pressedScale: number,
): (isPressed: boolean) => void {
  const reducedMotion = useReducedMotion();
  const pressedAt = useRef(0);
  const releaseTimer = useRef<number | null>(null);
  const animation = useSpringAnimation<'scale'>({
    initial: { scale: REST_SCALE },
    config: springs.press,
    precision: springRest.unit,
    onUpdate: ({ scale }) => {
      const element = ref.current;
      if (element === null) return;
      if (scale === REST_SCALE) element.style.removeProperty('scale');
      else element.style.scale = String(scale);
      notifyGlassMotion(element);
    },
  });

  useEffect(
    () => () => {
      if (releaseTimer.current !== null) window.clearTimeout(releaseTimer.current);
    },
    [],
  );

  return useCallback(
    (isPressed: boolean) => {
      if (releaseTimer.current !== null) {
        window.clearTimeout(releaseTimer.current);
        releaseTimer.current = null;
      }
      if (reducedMotion) {
        animation.set({ scale: REST_SCALE });
        return;
      }
      if (isPressed) {
        pressedAt.current = performance.now();
        animation.animateTo({ scale: pressedScale });
        return;
      }
      const release = (): void => {
        releaseTimer.current = null;
        animation.animateTo({ scale: REST_SCALE });
      };
      const remaining = interaction.minimumPressMs - (performance.now() - pressedAt.current);
      if (remaining > 0) releaseTimer.current = window.setTimeout(release, remaining);
      else release();
    },
    [animation, pressedScale, reducedMotion],
  );
}
