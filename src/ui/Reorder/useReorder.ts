import { useEffect, useLayoutEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ReorderGesture } from './reorderGesture';

export interface ReorderOptions {
  readonly count: number;
  /** 把第 from 项移到第 to 项：应同步更新数据（返回时新顺序已经生效） */
  readonly onMove: (from: number, to: number) => void;
  readonly isDisabled?: boolean;
}

/** 展开到把手按钮上的事件处理 */
export interface ReorderHandleBindings {
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface ReorderControls {
  /** 第 index 项的根元素（拖动时移动的就是它） */
  readonly itemRef: (index: number) => (element: HTMLElement | null) => (() => void) | undefined;
  readonly handleProps: (index: number) => ReorderHandleBindings;
}

/**
 * 列表拖动排序（F-045 / F-046）：鼠标、触摸与键盘三种方式。
 * 每项设置 `ref={itemRef(index)}`，把手展开 `handleProps(index)`（推荐直接使用 <ReorderHandle>）。
 * 移动完成后由调用方播报新位置（announce），读屏用户也能得知结果。
 */
export function useReorder({ count, onMove, isDisabled = false }: ReorderOptions): ReorderControls {
  const [gesture] = useState(() => new ReorderGesture());
  useLayoutEffect(() => {
    gesture.configure({ count, onMove, isDisabled });
  });
  useEffect(
    () => () => {
      gesture.dispose();
    },
    [gesture],
  );

  return {
    itemRef: (index) => gesture.itemRef(index),
    handleProps: (index) => ({
      onPointerDown: (event) => {
        gesture.begin(event.nativeEvent, index, event.currentTarget);
      },
      onKeyDown: (event) => {
        if (gesture.keyboardMove(event.key, index, event.currentTarget)) event.preventDefault();
      },
    }),
  };
}
