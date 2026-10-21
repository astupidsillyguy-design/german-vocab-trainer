import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 指针悬停在元素上、或焦点位于元素内部时返回 true。
 * 用原生事件监听（而不是 JSX 事件属性），因为容器本身不是交互元素，只是观察者。
 */
export function useHoverOrFocusWithin<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [isHovered, setHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;

    const onEnter = (): void => {
      setHovered(true);
    };
    const onLeave = (): void => {
      setHovered(false);
    };
    const onFocusIn = (): void => {
      setHasFocus(true);
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      setHasFocus(false);
    };

    element.addEventListener('pointerenter', onEnter);
    element.addEventListener('pointerleave', onLeave);
    element.addEventListener('focusin', onFocusIn);
    element.addEventListener('focusout', onFocusOut);
    return () => {
      element.removeEventListener('pointerenter', onEnter);
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('focusin', onFocusIn);
      element.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return [ref, isHovered || hasFocus];
}
