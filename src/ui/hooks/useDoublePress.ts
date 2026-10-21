import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { gesture } from '../../design/tokens';

export interface DoublePressOptions {
  readonly isDisabled?: boolean;
}

interface Press {
  readonly time: number;
  readonly x: number;
  readonly y: number;
  readonly pointerType: string;
}

const PRIMARY_BUTTON = 0;
/** 落在这些子控件上的按压属于控件自己（例如连点发音按钮），不计入双击 */
const CONTROL_SELECTOR =
  'button, a[href], input, textarea, select, [role="button"], [role="link"], [role="checkbox"]';

function isOnChildControl(target: EventTarget | null, element: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  const control = target.closest(CONTROL_SELECTOR);
  return control !== null && control !== element && element.contains(control);
}

function isSecondPress(previous: Press | null, event: PointerEvent): boolean {
  return (
    previous !== null &&
    previous.pointerType === event.pointerType &&
    event.timeStamp - previous.time <= gesture.doublePressMs &&
    Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= gesture.doublePressSlopPx
  );
}

/**
 * 双击 / 双触（鼠标、触摸、触控笔统一处理）：两次松手间隔不超过 doublePressMs，
 * 且位置相差不超过 doublePressSlopPx。浏览器的 dblclick 在触屏上并不可靠，因此直接基于指针事件实现。
 *
 * 双击没有键盘等价操作，调用方必须另外提供可聚焦的替代入口（例如“编辑”按钮）。
 * 在触屏上使用时，元素应设置 `touch-action: manipulation`，避免双触被当作缩放。
 */
export function useDoublePress<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onDoublePress: () => void,
  { isDisabled = false }: DoublePressOptions = {},
): void {
  const latest = useRef(onDoublePress);
  useLayoutEffect(() => {
    latest.current = onDoublePress;
  });

  useEffect(() => {
    const element = ref.current;
    if (element === null || isDisabled) return undefined;
    let previous: Press | null = null;

    const onPointerUp = (event: PointerEvent): void => {
      if (!event.isPrimary || event.button !== PRIMARY_BUTTON) return;
      if (isOnChildControl(event.target, element)) {
        previous = null;
        return;
      }
      if (isSecondPress(previous, event)) {
        previous = null;
        latest.current();
        return;
      }
      previous = {
        time: event.timeStamp,
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType,
      };
    };

    element.addEventListener('pointerup', onPointerUp);
    return () => {
      element.removeEventListener('pointerup', onPointerUp);
    };
  }, [ref, isDisabled]);
}
