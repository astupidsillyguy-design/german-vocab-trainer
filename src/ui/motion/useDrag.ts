import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { gesture } from '../../design/tokens';
import { VelocityTracker, type Vector } from '../../motion';

export type DragAxis = 'x' | 'y' | 'both';

export interface DragState {
  /** 自拖动激活那一刻起的位移（px）。从激活点而不是按下点算起，开始拖动时不会“跳”一下 */
  readonly offset: Vector;
  /** 指针速度（px/s） */
  readonly velocity: Vector;
  /** 当前指针位置（视口坐标） */
  readonly point: Vector;
  readonly pointerType: string;
}

export interface DragOptions {
  /** 锁定方向：沿另一方向先移动超过阈值时放弃（交给页面滚动） */
  readonly axis?: DragAxis;
  readonly isDisabled?: boolean;
  /** 移动超过该距离才算拖动，之前仍是点按 */
  readonly threshold?: number;
  /** 按下时判断是否跟踪这次指针（例如只允许从把手开始、排除按钮） */
  readonly shouldStart?: (event: PointerEvent) => boolean;
  readonly onStart?: (state: DragState) => void;
  readonly onMove?: (state: DragState) => void;
  readonly onEnd?: (state: DragState) => void;
  /** 系统取消了指针（例如来电、手势被浏览器接管） */
  readonly onCancel?: () => void;
}

export interface DragControls {
  /** 是否正在拖动 */
  readonly isDragging: () => boolean;
  /**
   * 从拖动激活起，到松手后“迟到”的点击被吞掉为止都为 true。
   * 子控件（链接、开关）的 onPress / onChange 据此忽略由拖动引起的误触。
   */
  readonly didDrag: () => boolean;
}

interface Tracking {
  readonly pointerId: number;
  readonly origin: Vector;
  anchor: Vector | null;
}

const PRIMARY_BUTTON = 0;

function crossedThreshold(axis: DragAxis, dx: number, dy: number, threshold: number): boolean {
  if (axis === 'x') return Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy);
  if (axis === 'y') return Math.abs(dy) >= threshold && Math.abs(dy) > Math.abs(dx);
  return Math.hypot(dx, dy) >= threshold;
}

function crossedOtherAxis(axis: DragAxis, dx: number, dy: number, threshold: number): boolean {
  if (axis === 'x') return Math.abs(dy) >= threshold;
  if (axis === 'y') return Math.abs(dx) >= threshold;
  return false;
}

/**
 * 指针拖动手势（鼠标、触摸、触控笔统一处理）。
 *
 * - 直接监听原生指针事件，移动过程不触发 React 渲染；
 * - 超过阈值后才激活并捕获指针，因此普通点按、键盘操作完全不受影响；
 * - 松手速度取最近 100ms 的位移，停顿后松手速度为 0；
 * - 激活后的点击会被吞掉，避免拖完误触发链接或按钮。
 * 需要拖动的元素应设置合适的 `touch-action`（例如横向拖动用 `pan-y`），否则触屏上会被页面滚动抢走。
 */
export function useDrag<T extends HTMLElement>(
  ref: RefObject<T | null>,
  options: DragOptions,
): DragControls {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const dragging = useRef(false);
  const suppressing = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const tracker = new VelocityTracker();
    let tracking: Tracking | null = null;
    let clearSuppression: (() => void) | null = null;

    const stateOf = (event: PointerEvent, anchor: Vector): DragState => ({
      offset: { x: event.clientX - anchor.x, y: event.clientY - anchor.y },
      velocity: tracker.velocity(event.timeStamp),
      point: { x: event.clientX, y: event.clientY },
      pointerType: event.pointerType,
    });

    const suppressClicks = (): void => {
      clearSuppression?.();
      suppressing.current = true;
      const swallow = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        window.setTimeout(clear, 0);
      };
      const clear = (): void => {
        window.removeEventListener('click', swallow, true);
        window.removeEventListener('pointerdown', clear, true);
        window.clearTimeout(timer);
        suppressing.current = false;
        clearSuppression = null;
      };
      const timer = window.setTimeout(clear, gesture.postDragClickWindowMs);
      window.addEventListener('click', swallow, true);
      window.addEventListener('pointerdown', clear, true);
      clearSuppression = clear;
    };

    const stop = (): void => {
      tracking = null;
      dragging.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    const onMove = (event: PointerEvent): void => {
      if (tracking?.pointerId !== event.pointerId) return;
      tracker.add(event.timeStamp, event.clientX, event.clientY);
      const { axis = 'both', threshold = gesture.dragThresholdPx } = latest.current;
      if (tracking.anchor === null) {
        const dx = event.clientX - tracking.origin.x;
        const dy = event.clientY - tracking.origin.y;
        if (crossedThreshold(axis, dx, dy, threshold)) {
          tracking.anchor = { x: event.clientX, y: event.clientY };
          dragging.current = true;
          suppressing.current = true;
          // jsdom 等环境可能不支持指针捕获；不影响拖动本身
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
            /* 无法捕获时仍可依靠 window 上的监听 */
          }
          latest.current.onStart?.(stateOf(event, tracking.anchor));
        } else if (crossedOtherAxis(axis, dx, dy, threshold)) {
          stop();
          return;
        }
      }
      if (tracking.anchor !== null) latest.current.onMove?.(stateOf(event, tracking.anchor));
    };

    const onUp = (event: PointerEvent): void => {
      if (tracking?.pointerId !== event.pointerId) return;
      tracker.add(event.timeStamp, event.clientX, event.clientY);
      const anchor = tracking.anchor;
      stop();
      if (anchor === null) return;
      latest.current.onEnd?.(stateOf(event, anchor));
      suppressClicks();
    };

    const onCancel = (event: PointerEvent): void => {
      if (tracking?.pointerId !== event.pointerId) return;
      const wasActive = tracking.anchor !== null;
      stop();
      if (!wasActive) return;
      latest.current.onCancel?.();
      suppressClicks();
    };

    const onDown = (event: PointerEvent): void => {
      const { isDisabled = false, shouldStart } = latest.current;
      if (isDisabled || tracking !== null || !event.isPrimary) return;
      if (event.button !== PRIMARY_BUTTON) return;
      if (shouldStart !== undefined && !shouldStart(event)) return;
      tracker.reset();
      tracker.add(event.timeStamp, event.clientX, event.clientY);
      tracking = {
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY },
        anchor: null,
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
    };

    // 链接、图片默认可以被“拖走”（HTML5 拖放），浏览器会随即发出 pointercancel 打断手势；
    // 只在本手势跟踪期间阻止，其余时候不影响原生拖放
    const onNativeDragStart = (event: DragEvent): void => {
      if (tracking !== null) event.preventDefault();
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('dragstart', onNativeDragStart);
    return () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('dragstart', onNativeDragStart);
      stop();
      clearSuppression?.();
    };
  }, [ref]);

  const isDragging = useCallback(() => dragging.current, []);
  const didDrag = useCallback(() => suppressing.current, []);
  return { isDragging, didDrag };
}
