import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * 当哨兵元素滚动到顶部 `topInsetPx` 以上时返回 true。
 * 使用 IntersectionObserver：不监听 scroll 事件，滚动时零 JS 开销。
 * 不支持 IO 的环境（如测试）始终返回 false。
 */
export function useScrolledPast<T extends Element>(
  topInsetPx: number,
): [RefObject<T | null>, boolean] {
  const sentinelRef = useRef<T>(null);
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry === undefined) return;
        // 只有向上离开视口才算“滚过”；向下离开（元素在视口下方）不算
        setIsPast(!entry.isIntersecting && entry.boundingClientRect.top < topInsetPx);
      },
      { rootMargin: `-${String(topInsetPx)}px 0px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [topInsetPx]);

  return [sentinelRef, isPast];
}
