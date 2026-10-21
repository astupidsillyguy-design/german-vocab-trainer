/**
 * 指针手势的测试工具：按指定坐标与时间戳派发原生指针事件。
 * jsdom 的事件时间戳取自 Date.now()，连续派发几乎同时发生，速度会失真；
 * 这里显式写入 timeStamp，速度计算因此可预测。
 */
import { createEvent, fireEvent } from '@testing-library/react';

export interface PointerStep {
  readonly x: number;
  readonly y: number;
  /** 毫秒 */
  readonly t: number;
}

export interface PointerOptions {
  readonly pointerId?: number;
  readonly isPrimary?: boolean;
  readonly button?: number;
  readonly pointerType?: string;
}

type PointerEventName = 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel';

export function dispatchPointer(
  name: PointerEventName,
  target: Element | Window,
  { x, y, t }: PointerStep,
  { pointerId = 1, isPrimary = true, button = 0, pointerType = 'touch' }: PointerOptions = {},
): void {
  const event = createEvent[name](target, {
    pointerId,
    isPrimary,
    button,
    pointerType,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'timeStamp', { value: t });
  fireEvent(target, event);
}

/**
 * 从 `steps[0]` 按下，依次移动到其余各点，在最后一点松手。
 * 移动与松手派发到 window（与真实浏览器中指针离开元素后的情形一致）。
 */
export function dragPointer(
  target: Element,
  steps: readonly PointerStep[],
  options?: PointerOptions,
): void {
  const [first, ...rest] = steps;
  if (first === undefined) return;
  dispatchPointer('pointerDown', target, first, options);
  for (const step of rest) dispatchPointer('pointerMove', window, step, options);
  dispatchPointer('pointerUp', window, rest.at(-1) ?? first, options);
}

/** 均匀移动：从 start 到 end 共 `count` 步，每步间隔 `interval` 毫秒 */
export function linearSteps(
  start: PointerStep,
  end: { readonly x: number; readonly y: number },
  count: number,
  interval: number,
): PointerStep[] {
  return Array.from({ length: count + 1 }, (_, step) => ({
    x: start.x + ((end.x - start.x) * step) / count,
    y: start.y + ((end.y - start.y) * step) / count,
    t: start.t + interval * step,
  }));
}
