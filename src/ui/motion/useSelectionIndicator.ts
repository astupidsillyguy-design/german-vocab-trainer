import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { fadeDuration, gesture, springRest, springs } from '../../design/tokens';
import { clamp, projectMomentum, rubberbandClamp } from '../../motion';
import { useDrag, type DragControls } from './useDrag';
import { useReducedMotion } from './useReducedMotion';
import { moveSpring, useSpringAnimation } from './useSpringAnimation';

/** 拖动指示块期间写在容器上，样式据此把指示块变成“水滴” */
export const DRAGGING_ATTRIBUTE = 'data-dragging';

/** 指针位于格子中心时对应整数位置 */
const CELL_CENTER = 1 / 2;
/** 拖出两端时，橡皮筋最多再拉出一格 */
const OVERDRAG_CELLS = 1;
const REST_LIFT = 1;
/**
 * 松手选中新项后，若一段时间内外部仍未更新选中项（例如导航被拦截），指示块回到实际选中项。
 * 页面过渡会让选中项晚一两帧才更新，这里留出足够余量。
 */
const RECONCILE_DELAY_MS = fadeDuration.standard;

type Direction = 1 | -1;

interface Geometry {
  /** 第一格起始边（视口坐标） */
  readonly start: number;
  readonly cell: number;
  readonly direction: Direction;
}

function directionOf(element: HTMLElement): Direction {
  return getComputedStyle(element).direction === 'rtl' ? -1 : 1;
}

function measure(container: HTMLElement, count: number): Geometry {
  const rect = container.getBoundingClientRect();
  const style = getComputedStyle(container);
  const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(style.paddingRight) || 0;
  const direction = directionOf(container);
  return {
    start: direction === 1 ? rect.left + paddingLeft : rect.right - paddingRight,
    cell: Math.max(rect.width - paddingLeft - paddingRight, 1) / count,
    direction,
  };
}

export interface SelectionIndicatorOptions {
  /** 指示块所在的容器：变量写在它上面，拖动也从它开始 */
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly count: number;
  /** 当前选中项；-1 表示没有 */
  readonly index: number;
  readonly isDisabled?: boolean;
  /** 拖动松手后落在了另一项上 */
  readonly onSelect: (index: number) => void;
}

/**
 * 等宽选项上的选中指示块（Tab Bar、分段控件），iOS 26 的“液态水滴”交互：
 * - 选中项变化时以弹簧滑过去，速度越快拉伸越明显（--selection-stretch）；
 * - 按住拖动时指示块鼓起（--selection-lift）并跟随手指，两端有橡皮筋；
 * - 松手时按速度投射，落到最近的一项，并继承手指速度。
 * 位置以“格”为单位写入 --selection-position（从右到左排版时取负），样式用 translate 换算成像素。
 */
export function useSelectionIndicator({
  containerRef,
  count,
  index,
  isDisabled = false,
  onSelect,
}: SelectionIndicatorOptions): DragControls {
  const reducedMotion = useReducedMotion();
  const indexRef = useRef(index);
  const previousIndex = useRef<number | null>(null);
  const direction = useRef<Direction>(1);
  const geometry = useRef<Geometry | null>(null);
  const reconcileTimer = useRef<number | null>(null);

  const animation = useSpringAnimation<'position' | 'lift'>({
    initial: { position: Math.max(index, 0), lift: REST_LIFT },
    config: springs.droplet,
    precision: springRest.unit,
    onUpdate: ({ position, lift }, velocities) => {
      const container = containerRef.current;
      if (container === null) return;
      const speed = Math.min(Math.abs(velocities.position) / gesture.stretchVelocity, 1);
      container.style.setProperty('--selection-position', String(position * direction.current));
      container.style.setProperty('--selection-stretch', String(speed * gesture.stretchMax));
      container.style.setProperty('--selection-lift', String(lift));
    },
  });

  const cancelReconcile = (): void => {
    if (reconcileTimer.current === null) return;
    window.clearTimeout(reconcileTimer.current);
    reconcileTimer.current = null;
  };

  const settle = (): void => {
    containerRef.current?.removeAttribute(DRAGGING_ATTRIBUTE);
    moveSpring(
      animation,
      { position: Math.max(indexRef.current, 0), lift: REST_LIFT },
      reducedMotion,
      { config: springs.droplet },
    );
  };

  const follow = (pointerX: number): void => {
    const current = geometry.current;
    if (current === null) return;
    const raw = ((pointerX - current.start) * current.direction) / current.cell - CELL_CENTER;
    const position = rubberbandClamp(raw, 0, count - 1, OVERDRAG_CELLS);
    moveSpring(animation, { position }, reducedMotion, { config: springs.pointer });
  };

  const drag = useDrag(containerRef, {
    axis: 'x',
    isDisabled: isDisabled || count < 2,
    onStart: ({ point }) => {
      const container = containerRef.current;
      if (container === null) return;
      cancelReconcile();
      geometry.current = measure(container, count);
      direction.current = geometry.current.direction;
      container.setAttribute(DRAGGING_ATTRIBUTE, '');
      follow(point.x);
      moveSpring(animation, { lift: gesture.dropletScale }, reducedMotion);
    },
    onMove: ({ point }) => {
      follow(point.x);
    },
    onEnd: ({ velocity }) => {
      const current = geometry.current;
      containerRef.current?.removeAttribute(DRAGGING_ATTRIBUTE);
      if (current === null) return;
      const cellsPerSecond = (velocity.x * current.direction) / current.cell;
      const projected =
        animation.target('position') +
        projectMomentum(cellsPerSecond, gesture.selectionDecelerationRate);
      const target = clamp(Math.round(projected), 0, count - 1);
      moveSpring(animation, { position: target, lift: REST_LIFT }, reducedMotion, {
        velocity: { position: cellsPerSecond },
        config: springs.droplet,
      });
      if (target === indexRef.current) return;
      onSelect(target);
      reconcileTimer.current = window.setTimeout(() => {
        reconcileTimer.current = null;
        if (indexRef.current !== target) settle();
      }, RECONCILE_DELAY_MS);
    },
    onCancel: settle,
  });

  useLayoutEffect(() => {
    indexRef.current = index;
    const previous = previousIndex.current;
    previousIndex.current = index;
    const container = containerRef.current;
    if (container !== null) direction.current = directionOf(container);
    if (index < 0 || drag.isDragging()) return;
    cancelReconcile();
    if (previous === null || previous < 0) animation.set({ position: index, lift: REST_LIFT });
    else moveSpring(animation, { position: index }, reducedMotion, { config: springs.droplet });
    // 只在选中项变化时运行；其余依赖都是稳定引用或在回调中读取最新值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => cancelReconcile, []);

  return drag;
}
