import { useMemo, type Ref, type RefCallback } from 'react';

type Cleanup = () => void;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): Cleanup | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(value);
    return typeof cleanup === 'function' ? cleanup : () => ref(null);
  }
  if (ref) {
    ref.current = value;
    return () => {
      ref.current = null;
    };
  }
  return undefined;
}

/** 合并多个 ref（支持 React 19 的 ref 回调清理函数）。 */
export function mergeRefs<T>(...refs: readonly (Ref<T> | undefined)[]): RefCallback<T> {
  return (value) => {
    const cleanups = refs
      .map((ref) => assignRef(ref, value))
      .filter((cleanup) => cleanup !== undefined);
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  };
}

/** 在组件内合并两个 ref；只在任一 ref 变化时生成新的回调，避免每次渲染都重新挂载。 */
export function useMergedRefs<T>(
  first: Ref<T> | undefined,
  second: Ref<T> | undefined,
): RefCallback<T> {
  return useMemo(() => mergeRefs(first, second), [first, second]);
}
