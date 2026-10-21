import { useSyncExternalStore } from 'react';
import { prefersReducedMotion, REDUCED_MOTION_QUERY, subscribeMediaQueries } from '../../glass';

const QUERIES = [REDUCED_MOTION_QUERY] as const;

function subscribe(listener: () => void): () => void {
  return subscribeMediaQueries(QUERIES, listener);
}

function serverSnapshot(): boolean {
  return false;
}

/**
 * 系统“减少动态效果”设置，切换后实时生效。
 * 开启时位移、缩放类动画直接跳到终点，只保留淡入淡出；手势仍然跟手（直接操作不属于动画）。
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, serverSnapshot);
}
