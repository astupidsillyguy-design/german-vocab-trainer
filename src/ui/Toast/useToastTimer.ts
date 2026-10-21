import { useEffect, useRef } from 'react';

/**
 * 可暂停的倒计时：暂停时记录剩余时间，恢复后继续，而不是从头开始。
 * `timeoutMs` 为 null 时不计时。
 */
export function useToastTimer(
  timeoutMs: number | null,
  isPaused: boolean,
  onExpire: () => void,
): void {
  const remainingRef = useRef(timeoutMs);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const remaining = remainingRef.current;
    if (remaining === null || isPaused) return undefined;

    const startedAt = performance.now();
    const timer = window.setTimeout(() => {
      onExpireRef.current();
    }, remaining);

    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(remaining - (performance.now() - startedAt), 0);
    };
  }, [isPaused]);
}
