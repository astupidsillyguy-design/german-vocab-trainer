import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { springRest, springs } from '../../design/tokens';
import { moveSpring, useReducedMotion, useSpringAnimation } from '../motion';

const HIDDEN_ATTRIBUTE = 'data-hidden';
const ACTIVE_SELECTOR = '[aria-current="page"]';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 元素相对祖先的布局位置。用 offset* 而不是 getBoundingClientRect：
 * 前者不受 transform / scale 影响，点击时链接正在做按压缩放也能量出真实位置。
 */
function boxWithin(element: HTMLElement, ancestor: HTMLElement): Box {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node !== null && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    node = parent instanceof HTMLElement ? parent : null;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

/**
 * 侧边栏的选中指示块：切换页面时纵向以弹簧滑动，尺寸变化（收起/展开、字号）时直接贴合。
 */
export function useSidebarIndicator(
  containerRef: RefObject<HTMLElement | null>,
  indicatorRef: RefObject<HTMLElement | null>,
  activeId: string | null,
): void {
  const reducedMotion = useReducedMotion();
  const visible = useRef(false);
  const animation = useSpringAnimation<'y'>({
    initial: { y: 0 },
    config: springs.droplet,
    precision: springRest.px,
    onUpdate: ({ y }) => {
      const indicator = indicatorRef.current;
      if (indicator !== null) indicator.style.translate = `0 ${String(y)}px`;
    },
  });

  /** 量出选中项并更新指示块；`animate` 为 false 时直接跳到位 */
  const sync = (animate: boolean): void => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (container === null || indicator === null) return;
    const active = container.querySelector<HTMLElement>(ACTIVE_SELECTOR);
    if (active === null) {
      indicator.setAttribute(HIDDEN_ATTRIBUTE, '');
      visible.current = false;
      return;
    }
    const box = boxWithin(active, container);
    indicator.style.left = `${String(box.x)}px`;
    indicator.style.width = `${String(box.width)}px`;
    indicator.style.height = `${String(box.height)}px`;
    if (animate && visible.current) moveSpring(animation, { y: box.y }, reducedMotion);
    else animation.set({ y: box.y });
    indicator.removeAttribute(HIDDEN_ATTRIBUTE);
    visible.current = true;
  };

  useLayoutEffect(() => {
    sync(true);
    // 选中项变化时滑动；其余依赖在 sync 中读取最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const observer = new ResizeObserver(() => {
      if (!animation.isAnimating) sync(false);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
    // 只需挂载时建立观察
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
