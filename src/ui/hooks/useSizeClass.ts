import { useSyncExternalStore } from 'react';
import { SIZE_CLASSES, sizeClassMinWidth, type SizeClass } from '../../design/tokens';

/** 由宽到窄排列，方便取第一个匹配项。 */
const DESCENDING = [...SIZE_CLASSES].reverse();

function queryFor(sizeClass: SizeClass): string {
  return `(min-width: ${sizeClassMinWidth[sizeClass]}px)`;
}

export function sizeClassForWidth(width: number): SizeClass {
  return DESCENDING.find((sizeClass) => width >= sizeClassMinWidth[sizeClass]) ?? 'compact';
}

function currentSizeClass(): SizeClass {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'compact';
  return (
    DESCENDING.find((sizeClass) => window.matchMedia(queryFor(sizeClass)).matches) ?? 'compact'
  );
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return () => undefined;
  // 只监听断点穿越（matchMedia），不监听 resize，避免拖动窗口时高频触发
  const lists = SIZE_CLASSES.map((sizeClass) => window.matchMedia(queryFor(sizeClass)));
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

export function useSizeClass(): SizeClass {
  return useSyncExternalStore(subscribe, currentSizeClass, () => 'compact');
}

/**
 * 把尺寸等级写到 `<html data-size-class>`，供组件 CSS 使用（组件内不写媒体查询数字）。
 * 在首次渲染前同步调用，避免首帧布局跳动。返回取消监听的函数。
 */
export function syncSizeClassAttribute(root: HTMLElement = document.documentElement): () => void {
  const apply = (): void => {
    root.dataset.sizeClass = currentSizeClass();
  };
  apply();
  return subscribe(apply);
}
