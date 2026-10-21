import { useEffect, type RefObject } from 'react';
import { springRest, springs } from '../../design/tokens';
import { useReducedMotion, useSpringAnimation } from '../motion';

/** CSS 档中标记“指针在元素上”的属性；样式读取 --glass-pointer-x / --glass-pointer-y */
export const POINTER_ATTRIBUTE = 'data-pointer';

export interface PointerSink {
  /** 视口坐标；null 表示指针离开 */
  readonly setPointer: (point: { readonly x: number; readonly y: number } | null) => void;
}

interface PointerHighlightOptions {
  readonly isEnabled: boolean;
  /** WebGL 档：把指针交给引擎绘制（引擎自带缓动）；null 表示 CSS 档 */
  readonly sink: PointerSink | null;
}

/**
 * 跟随指针的高光。
 * - CSS 档：位置由弹簧平滑跟随（略带拖尾，像光在玻璃里流动），直接写 CSS 变量，不触发渲染；
 *   指针进入时直接出现在指针处，不会从上次离开的位置滑过来；
 * - WebGL 档：坐标交给引擎；
 * - 触屏只在按下期间显示。
 */
export function usePointerHighlight(
  ref: RefObject<HTMLElement | null>,
  { isEnabled, sink }: PointerHighlightOptions,
): void {
  const reducedMotion = useReducedMotion();
  const animation = useSpringAnimation<'x' | 'y'>({
    initial: { x: 0, y: 0 },
    config: springs.pointer,
    precision: springRest.px,
    onUpdate: ({ x, y }) => {
      const element = ref.current;
      if (element === null) return;
      element.style.setProperty('--glass-pointer-x', `${String(x)}px`);
      element.style.setProperty('--glass-pointer-y', `${String(y)}px`);
    },
  });

  useEffect(() => {
    const element = ref.current;
    if (element === null || !isEnabled) return undefined;

    const show = (event: PointerEvent): void => {
      if (sink !== null) {
        sink.setPointer({ x: event.clientX, y: event.clientY });
        return;
      }
      const rect = element.getBoundingClientRect();
      const target = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (reducedMotion || !element.hasAttribute(POINTER_ATTRIBUTE)) animation.set(target);
      else animation.animateTo(target);
      element.setAttribute(POINTER_ATTRIBUTE, '');
    };
    const hide = (): void => {
      if (sink !== null) sink.setPointer(null);
      else element.removeAttribute(POINTER_ATTRIBUTE);
    };
    const onUp = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') hide();
    };

    element.addEventListener('pointermove', show);
    element.addEventListener('pointerdown', show);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointerleave', hide);
    element.addEventListener('pointercancel', hide);
    return () => {
      element.removeEventListener('pointermove', show);
      element.removeEventListener('pointerdown', show);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointerleave', hide);
      element.removeEventListener('pointercancel', hide);
      hide();
    };
  }, [ref, isEnabled, sink, reducedMotion, animation]);
}
