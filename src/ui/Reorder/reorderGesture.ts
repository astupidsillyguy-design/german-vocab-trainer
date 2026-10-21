/**
 * 拖动排序的指针手势（与 React 无关）：拿起、让位、自动滚动与松手后的归位动画。
 *
 * - 移动过程只写被拖项和让位项的 `translate`，不触发 React 渲染，也不改变布局；
 * - 列表项的状态写在 `data-reorder-state` 上（lifted / shifting / settling），过渡由全局样式负责，
 *   “减少动态效果”时弹簧时长为 0，位置瞬间到位；
 * - 松手时同步提交新顺序（flushSync），再用 FLIP 让被拖项从松手处平滑落到新位置。
 */
import { flushSync } from 'react-dom';
import { gesture } from '../../design/tokens';
import { clamp, frameLoop } from '../../motion';

export const REORDER_STATE_ATTRIBUTE = 'data-reorder-state';
/** 拖动期间写在 <html> 上：全局禁止选中文字、显示“抓取”光标 */
export const REORDERING_ATTRIBUTE = 'data-reordering';

export type ReorderState = 'lifted' | 'shifting' | 'settling';

export interface ReorderGestureOptions {
  readonly count: number;
  readonly onMove: (from: number, to: number) => void;
  readonly isDisabled: boolean;
}

const NO_OPTIONS: ReorderGestureOptions = { count: 0, onMove: () => undefined, isDisabled: true };

interface Layout {
  readonly elements: readonly HTMLElement[];
  /** 页面坐标（含滚动距离），滚动时不必重新测量 */
  readonly tops: readonly number[];
  readonly heights: readonly number[];
}

interface Session {
  readonly pointerId: number;
  readonly from: number;
  readonly handle: HTMLElement;
  readonly origin: { readonly x: number; readonly y: number };
  /** 按下时指针的页面纵坐标 */
  readonly startY: number;
  clientY: number;
  layout: Layout | null;
  target: number;
  offsets: number[];
  stopAutoScroll: (() => void) | null;
}

const PRIMARY_BUTTON = 0;
const MS_PER_SECOND = 1000;

function setState(element: HTMLElement, state: ReorderState | null): void {
  if (state === null) element.removeAttribute(REORDER_STATE_ATTRIBUTE);
  else element.setAttribute(REORDER_STATE_ATTRIBUTE, state);
}

function setOffset(element: HTMLElement, offset: number): void {
  element.style.translate = offset === 0 ? '' : `0 ${offset}px`;
}

function measure(elements: readonly HTMLElement[]): Layout {
  const scrollY = window.scrollY;
  const rects = elements.map((element) => element.getBoundingClientRect());
  return {
    elements,
    tops: rects.map((rect) => rect.top + scrollY),
    heights: rects.map((rect) => rect.height),
  };
}

/** 指针越靠近视口上下边缘，滚动越快；离开边缘区域即停止 */
export function autoScrollSpeed(clientY: number, viewportHeight: number): number {
  const edge = gesture.autoScrollEdgePx;
  const bottom = viewportHeight - edge;
  if (clientY < edge) return -gesture.autoScrollMaxSpeed * clamp((edge - clientY) / edge, 0, 1);
  if (clientY > bottom) return gesture.autoScrollMaxSpeed * clamp((clientY - bottom) / edge, 0, 1);
  return 0;
}

/**
 * 被拖项越过相邻项的中线即交换位置：向下拖时看它的下边缘，向上拖时看上边缘。
 * 返回它松手后将落在的位置。
 */
export function dropIndex(
  layout: Pick<Layout, 'tops' | 'heights'>,
  from: number,
  offset: number,
): number {
  const { tops, heights } = layout;
  const top = (tops[from] ?? 0) + offset;
  const bottom = top + (heights[from] ?? 0);
  let target = from;
  for (let index = from + 1; index < tops.length; index += 1) {
    if (bottom <= (tops[index] ?? 0) + (heights[index] ?? 0) / 2) break;
    target = index;
  }
  if (target !== from) return target;
  for (let index = from - 1; index >= 0; index -= 1) {
    if (top >= (tops[index] ?? 0) + (heights[index] ?? 0) / 2) break;
    target = index;
  }
  return target;
}

/** 让位距离：其他项向上 / 向下移动多少，正好空出被拖项（含间距）的位置 */
function shiftsOf(layout: Layout, from: number): { readonly up: number; readonly down: number } {
  const { tops, heights } = layout;
  const top = tops[from] ?? 0;
  const bottom = top + (heights[from] ?? 0);
  const next = tops[from + 1];
  const previousTop = tops[from - 1];
  const previousHeight = heights[from - 1];
  return {
    up: next === undefined ? 0 : next - top,
    down:
      previousTop === undefined || previousHeight === undefined
        ? 0
        : bottom - (previousTop + previousHeight),
  };
}

/** 键盘排序：↑↓ 移动一位，Home / End 移到最前 / 最后；其他按键不处理 */
export function keyboardTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case 'ArrowUp':
      return Math.max(0, index - 1);
    case 'ArrowDown':
      return Math.min(count - 1, index + 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export class ReorderGesture {
  #options: ReorderGestureOptions = NO_OPTIONS;
  readonly #elements = new Map<number, HTMLElement>();
  readonly #refs = new Map<number, (element: HTMLElement | null) => (() => void) | undefined>();
  #session: Session | null = null;
  /** 每次拖动加一：上一次的归位动画结束时，不会清掉新一次拖动的状态 */
  #generation = 0;

  /** 每次渲染后换上最新的项数与回调；禁用时放弃进行中的拖动 */
  configure(options: ReorderGestureOptions): void {
    this.#options = options;
    if (options.isDisabled) this.cancel();
  }

  /** 第 index 项的 ref 回调（按位置缓存，渲染时可以放心调用） */
  itemRef(index: number): (element: HTMLElement | null) => (() => void) | undefined {
    let callback = this.#refs.get(index);
    if (callback === undefined) {
      callback = (element) => {
        if (element === null) return undefined;
        this.#elements.set(index, element);
        return () => {
          if (this.#elements.get(index) === element) this.#elements.delete(index);
        };
      };
      this.#refs.set(index, callback);
    }
    return callback;
  }

  get isDragging(): boolean {
    return (this.#session?.layout ?? null) !== null;
  }

  begin(event: PointerEvent, index: number, handle: HTMLElement): void {
    if (this.#options.isDisabled || this.#session !== null) return;
    if (!event.isPrimary || event.button !== PRIMARY_BUTTON) return;
    this.#session = {
      pointerId: event.pointerId,
      from: index,
      handle,
      origin: { x: event.clientX, y: event.clientY },
      startY: event.clientY + window.scrollY,
      clientY: event.clientY,
      layout: null,
      target: index,
      offsets: [],
      stopAutoScroll: null,
    };
    window.addEventListener('pointermove', this.#onPointerMove);
    window.addEventListener('pointerup', this.#onPointerUp);
    window.addEventListener('pointercancel', this.#onPointerCancel);
    window.addEventListener('keydown', this.#onKeyDown, true);
    window.addEventListener('scroll', this.#onScroll, { passive: true });
    window.addEventListener('blur', this.#onBlur);
  }

  /**
   * 键盘排序；处理了按键时返回 true（调用方据此阻止默认滚动）。
   * 同步提交后把焦点留在被移动项的把手上：React 移动节点时可能让它失去焦点，留住焦点才能连续调整。
   */
  keyboardMove(key: string, index: number, handle: HTMLElement): boolean {
    const { count, isDisabled, onMove } = this.#options;
    if (isDisabled || this.isDragging) return false;
    const to = keyboardTarget(key, index, count);
    if (to === null) return false;
    if (to === index) return true;
    flushSync(() => {
      onMove(index, to);
    });
    if (handle.isConnected && document.activeElement !== handle) handle.focus();
    return true;
  }

  /** 放弃本次拖动，所有项回到原位 */
  cancel(): void {
    this.#finish(false);
  }

  dispose(): void {
    this.#finish(false);
    this.#elements.clear();
  }

  readonly #onPointerMove = (event: PointerEvent): void => {
    const session = this.#session;
    if (session?.pointerId !== event.pointerId) return;
    session.clientY = event.clientY;
    if (session.layout === null) {
      const distance = Math.hypot(
        event.clientX - session.origin.x,
        event.clientY - session.origin.y,
      );
      if (distance < gesture.dragThresholdPx || !this.#activate(session)) return;
    }
    // 拖动期间阻止触屏上的页面滚动与文字选择
    if (event.cancelable) event.preventDefault();
    this.#update(session);
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (this.#session?.pointerId !== event.pointerId) return;
    this.#finish(true);
  };

  readonly #onPointerCancel = (event: PointerEvent): void => {
    if (this.#session?.pointerId !== event.pointerId) return;
    this.#finish(false);
  };

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.isDragging) return;
    event.preventDefault();
    event.stopPropagation();
    this.#finish(false);
  };

  readonly #onScroll = (): void => {
    const session = this.#session;
    if (session !== null && session.layout !== null) this.#update(session);
  };

  readonly #onBlur = (): void => {
    this.#finish(false);
  };

  #activate(session: Session): boolean {
    const { count } = this.#options;
    const elements: HTMLElement[] = [];
    for (let index = 0; index < count; index += 1) {
      const element = this.#elements.get(index);
      if (element === undefined) return false;
      elements.push(element);
    }
    this.#generation += 1;
    // 上一次的归位动画可能还没结束：先清掉，再按静止状态测量
    for (const element of elements) {
      setState(element, null);
      setOffset(element, 0);
    }
    session.layout = measure(elements);
    session.offsets = elements.map(() => 0);
    elements.forEach((element, index) => {
      setState(element, index === session.from ? 'lifted' : 'shifting');
    });
    document.documentElement.setAttribute(REORDERING_ATTRIBUTE, '');
    try {
      session.handle.setPointerCapture(session.pointerId);
    } catch {
      // 不支持指针捕获的环境仍可依靠 window 上的监听
    }
    return true;
  }

  #update(session: Session): void {
    const layout = session.layout;
    if (layout === null) return;
    const { tops, heights, elements } = layout;
    const { from } = session;
    const last = tops.length - 1;
    const offset = clamp(
      session.clientY + window.scrollY - session.startY,
      (tops[0] ?? 0) - (tops[from] ?? 0),
      (tops[last] ?? 0) + (heights[last] ?? 0) - ((tops[from] ?? 0) + (heights[from] ?? 0)),
    );
    const target = dropIndex(layout, from, offset);
    const shifts = shiftsOf(layout, from);
    elements.forEach((element, index) => {
      let next = 0;
      if (index === from) next = offset;
      else if (from < index && index <= target) next = -shifts.up;
      else if (target <= index && index < from) next = shifts.down;
      if (session.offsets[index] === next) return;
      session.offsets[index] = next;
      setOffset(element, next);
    });
    session.target = target;
    this.#autoScroll(session);
  }

  #autoScroll(session: Session): void {
    if (session.stopAutoScroll !== null) return;
    if (autoScrollSpeed(session.clientY, window.innerHeight) === 0) return;
    let previous: number | null = null;
    session.stopAutoScroll = frameLoop.add((now) => {
      const speed = autoScrollSpeed(session.clientY, window.innerHeight);
      if (this.#session !== session || speed === 0) {
        session.stopAutoScroll = null;
        return false;
      }
      if (previous !== null) window.scrollBy(0, (speed * (now - previous)) / MS_PER_SECOND);
      previous = now;
      return true;
    });
  }

  #finish(commit: boolean): void {
    const session = this.#session;
    if (session === null) return;
    this.#session = null;
    window.removeEventListener('pointermove', this.#onPointerMove);
    window.removeEventListener('pointerup', this.#onPointerUp);
    window.removeEventListener('pointercancel', this.#onPointerCancel);
    window.removeEventListener('keydown', this.#onKeyDown, true);
    window.removeEventListener('scroll', this.#onScroll);
    window.removeEventListener('blur', this.#onBlur);
    session.stopAutoScroll?.();
    const layout = session.layout;
    if (layout === null) return;
    document.documentElement.removeAttribute(REORDERING_ATTRIBUTE);

    const { from } = session;
    const target = commit ? session.target : from;
    const dragged = layout.elements[from];
    if (dragged === undefined) return;
    const releasedTop = dragged.getBoundingClientRect().top;
    const generation = this.#generation;
    layout.elements.forEach((element, index) => {
      if (index === from) return;
      if (target === from) {
        // 没有换位置：让位项保持过渡，平滑回到原处
        setOffset(element, 0);
        this.#clearWhenSettled(element, generation);
      } else {
        // 换了位置：提交后它们的新位置恰好就是让位后的位置，直接去掉位移即可
        setState(element, null);
        setOffset(element, 0);
      }
    });
    setOffset(dragged, 0);
    if (target !== from) {
      flushSync(() => {
        this.#options.onMove(from, target);
      });
    }
    // FLIP：先放回松手时的位置（拿起状态下位移没有过渡），再切到归位状态，过渡到 0
    const settledTop = dragged.getBoundingClientRect().top;
    setOffset(dragged, releasedTop - settledTop);
    dragged.getBoundingClientRect();
    setState(dragged, 'settling');
    setOffset(dragged, 0);
    this.#clearWhenSettled(dragged, generation);
  }

  /** 过渡（位移、缩放、阴影）全部结束后清除状态；没有过渡（减少动态效果）时立即清除 */
  #clearWhenSettled(element: HTMLElement, generation: number): void {
    const clear = (): void => {
      if (this.#generation !== generation) return;
      setState(element, null);
    };
    const animations = typeof element.getAnimations === 'function' ? element.getAnimations() : [];
    if (animations.length === 0) {
      clear();
      return;
    }
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(clear);
  }
}
